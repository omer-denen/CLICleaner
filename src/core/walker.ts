import { opendir, stat, lstat, readlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { longPath, isDenied, isLongPathError } from '../util/longpath.ts';
import { debug, warn } from '../util/log.ts';
import type { SkippedEntry } from './types.ts';

export interface WalkResult {
  bytes: number;
  files: number;
  dirs: number;
  /** En guncel dosya zaman damgasi (mtime) */
  lastTouched: number;
  skipped: SkippedEntry[];
  /** Klasor icindeki dosya uzanti sayimi (reclaimable hesabi icin) */
  extensionCounts: Map<string, number>;
  /** En buyuk dosyalar (tanimli turlere gore) */
  largeFiles: Array<{ relPath: string; bytes: number }>;
  /** Klasorun kendisine ait bilgi (bazilari 0 bayt raporlar) */
  selfBytes: number;
}

export interface WalkOptions {
  root: string;
  followLinks?: boolean;
  /** Bu esigin uzerindeki dosyalari largeFiles'a al */
  largeThreshold?: number;
  maxLarge?: number;
  signal?: AbortSignal;
  onProgress?: (dirs: number, bytes: number) => void;
}

/** Yeniden ziyaret edilen gerçek yollar (junction dongusu icin). */
function seenKey(dev: bigint, ino: bigint): string {
  return `${dev}:${ino}`;
}

const LARGE_DEFAULT = 64 * 1024 * 1024; // 64 MB

/**
 * Bir klasoru özyinelemeli olcer.
 *
 * Tasarim notlari:
 * - opendir (readdirSync degil) akis halinde calisir: 30k dosyalik
 *   _cacache icin bellek tabanli dizi listelemek yerine akis kullanilir.
 * - Gercek inode (dev/ino) ile dongu tespiti; symlink zaten izlenmez.
 * - Uzun yol hatasi ayri sayilir: kullanici "ne oldu" diye sordugunda
 *   sessizce eksik saymak yerine raporlayabilmeliyiz.
 */
export async function walk(opts: WalkOptions): Promise<WalkResult> {
  const {
    root,
    followLinks = false,
    largeThreshold = LARGE_DEFAULT,
    maxLarge = 24,
    signal,
    onProgress,
  } = opts;

  const res: WalkResult = {
    bytes: 0,
    files: 0,
    dirs: 0,
    lastTouched: 0,
    skipped: [],
    extensionCounts: new Map(),
    largeFiles: [],
    selfBytes: 0,
  };

  const visited = new Set<string>();
  const stack: string[] = [root];

  // Kokun kendisini ziyaret edilmis say: bir junction kokun ustune
  // donerse sonsuz dolasmasin.
  try {
    const st = await stat(longPath(root));
    if (st.isDirectory()) visited.add(seenKey(BigInt(st.dev), BigInt(st.ino)));
  } catch {
    /* kok okunamadi: opendir hatayi raporlar */
  }

  while (stack.length > 0) {
    if (signal?.aborted) break;
    const dir = stack.pop()!;

    let entries;
    try {
      entries = await opendir(longPath(dir), { bufferSize: 128 });
    } catch (err) {
      classify(err, dir, res.skipped);
      continue;
    }

    for await (const entry of entries) {
      if (signal?.aborted) break;
      const full = `${dir}\\${entry.name}`;

      let isDir = entry.isDirectory();
      let isFile = entry.isFile();
      let isLink = entry.isSymbolicLink();

      if (isLink && followLinks) {
        try {
          const target = await readlink(longPath(full));
          const st = await stat(longPath(full));
          isDir = st.isDirectory();
          isFile = st.isFile();
          void target;
        } catch (err) {
          classify(err, full, res.skipped);
          continue;
        }
      } else if (isLink) {
        // Varsayilan: linkleri izleme (dongu + kopya sayma riski)
        continue;
      }

      if (isDir) {
        let key: string;
        try {
          const st = await stat(longPath(full));
          key = seenKey(BigInt(st.dev), BigInt(st.ino));
        } catch (err) {
          classify(err, full, res.skipped);
          continue;
        }
        if (visited.has(key)) {
          res.skipped.push({ path: full, reason: 'link-loop' });
          continue;
        }
        visited.add(key);
        res.dirs++;
        stack.push(full);
        continue;
      }

      if (!isFile) continue;

      try {
        const st = await stat(longPath(full));
        const size = Number(st.size);
        res.bytes += size;
        res.files++;
        if (st.mtimeMs > res.lastTouched) res.lastTouched = st.mtimeMs;

        const ext = extOf(entry.name);
        if (ext) {
          res.extensionCounts.set(ext, (res.extensionCounts.get(ext) ?? 0) + 1);
        }

        if (size >= largeThreshold && res.largeFiles.length < maxLarge) {
          res.largeFiles.push({
            relPath: full.slice(root.length).replace(/^\\/, '') || entry.name,
            bytes: size,
          });
          // buyuk dosyalari kucukten buyuge tut
          res.largeFiles.sort((a, b) => b.bytes - a.bytes);
        }
      } catch (err) {
        classify(err, full, res.skipped);
      }

      if (res.dirs % 256 === 0) onProgress?.(res.dirs, res.bytes);
    }

    if (res.dirs % 64 === 0) onProgress?.(res.dirs, res.bytes);
  }

  // Klasorun kendi stat'i (dosya olarak sayilmissa)
  try {
    const st = await lstat(longPath(root));
    if (st.isFile()) {
      res.selfBytes = Number(st.size);
      res.bytes += res.selfBytes;
      res.files++;
    }
  } catch {
    /* yok sayilir */
  }

  return res;
}

function classify(err: unknown, path: string, skipped: SkippedEntry[]): void {
  if (isLongPathError(err)) {
    skipped.push({ path, reason: 'long-path' });
    warn('uzun yol atlandi', { path });
  } else if (isDenied(err)) {
    skipped.push({ path, reason: 'denied' });
    debug('erisim reddedildi', { path });
  } else {
    skipped.push({ path, reason: 'gone' });
  }
}

function extOf(name: string): string | null {
  const i = name.lastIndexOf('.');
  if (i <= 0) return null;
  const e = name.slice(i + 1).toLowerCase();
  if (e.length > 12) return null;
  return e;
}

/** Birden fazla klasoru paralel olcer. */
export async function walkMany(
  roots: string[],
  opts: Omit<WalkOptions, 'root'> = {},
  concurrency = 6,
): Promise<Map<string, WalkResult>> {
  const out = new Map<string, WalkResult>();
  const queue = [...roots];
  const workers = Array.from({ length: Math.min(concurrency, queue.length || 1) }, async () => {
    for (;;) {
      const root = queue.shift();
      if (root === undefined) return;
      out.set(root, await walk({ ...opts, root }));
    }
  });
  await Promise.all(workers);
  return out;
}

export { dirname };