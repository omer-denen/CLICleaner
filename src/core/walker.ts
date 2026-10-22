import { opendir, stat, lstat, readlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { longPath, isDenied, isLongPathError, errorCode } from '../util/longpath.ts';
import { debug, warn } from '../util/log.ts';
import type { Dirent } from 'node:fs';
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
  /** En buyuk dosyalar (buyukten kucuge, en fazla maxLarge) */
  largeFiles: Array<{ relPath: string; bytes: number }>;
  /** Klasorun kendisine ait bilgi (bazilari 0 bayt raporlar) */
  selfBytes: number;
  /**
   * Hardlink nedeniyle SAYILMAYAN bayt: ayni dosyanin ikinci ve sonraki
   * adlari. `bytes` benzersiz dosya baytini tasir; pnpm deposu gibi
   * hardlink'li yerlerde "kazanilacak yer" bu kadar duser (W4).
   */
  hardlinkedBytes: number;
  /**
   * Yas esiklerine gore bayt: `olderThanDays` ile istenen gun sayisi ->
   * o gunden eski dosyalarin toplam bayti. `temp-scratch` (3 gun) ve
   * `runtime-pool` (90 gun) gibi yasla kisitli hedeflerde kullanilir.
   */
  olderBytes: Map<number, number>;
}

export interface WalkOptions {
  root: string;
  followLinks?: boolean;
  /** Bu esigin uzerindeki dosyalari largeFiles'a al */
  largeThreshold?: number;
  maxLarge?: number;
  signal?: AbortSignal;
  onProgress?: (dirs: number, bytes: number) => void;
  /** Yas kirilimlari (gun): sonuc `olderBytes` icinde doner. */
  olderThanDays?: number[];
  /** Yas hesabinda kullanilacak "simdi" (test/tekrar uretilebilirlik). */
  now?: number;
}

/** Yeniden ziyaret edilen gerçek yollar (junction dongusu icin). */
function seenKey(dev: bigint, ino: bigint): string {
  return `${dev}:${ino}`;
}

const LARGE_DEFAULT = 64 * 1024 * 1024; // 64 MB
/** Ayni anda kac dosya `stat` edilir: AV gecikmesinde olcumu hizlandirir. */
const STAT_CONCURRENCY = 32;
/** Ilerleme bildirimi en fazla bu siklikta yayilir (ms). */
const PROGRESS_INTERVAL_MS = 100;
const DAY_MS = 86_400_000;

/**
 * Bir klasoru özyinelemeli olcer.
 *
 * Tasarim notlari:
 * - opendir (readdirSync degil) akis halinde calisir: 30k dosyalik
 *   _cacache icin bellek tabanli dizi listelemek yerine akis kullanilir.
 *   Bu yuzden es zamanli stat islemleri 32'lik KUCUK gruplar halinde
 *   yapilir; bellek siniri korunur (W6).
 * - Gercek inode (dev/ino) BIGINT olarak okunur. NTFS dosya kimligi 64
 *   bittir; Number'a cevrilirse 2^53 uzerinde hassasiyet kaybolur ve
 *   farkli klasorler ayni anahtari uretip yanlis "link-loop" uretir (W2).
 * - Hardlink'ler (pnpm deposu) bayt olarak BIR KEZ sayilir; ikinci adlar
 *   `hardlinkedBytes` altinda raporlanir (W4).
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
    olderThanDays = [],
    now = Date.now(),
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
    hardlinkedBytes: 0,
    olderBytes: new Map(),
  };

  const visited = new Set<string>();
  const hardlinks = new Set<string>();
  const stack: string[] = [root];
  const ageThresholds = [...new Set(olderThanDays)].filter((d) => d > 0);

  let lastProgressAt = 0;
  const report = (force = false): void => {
    if (!onProgress) return;
    const t = Date.now();
    if (!force && t - lastProgressAt < PROGRESS_INTERVAL_MS) return;
    lastProgressAt = t;
    onProgress(res.dirs, res.bytes);
  };

  // Kokun kendisini ziyaret edilmis say: bir junction kokun ustune
  // donerse sonsuz dolasmasin.
  try {
    const st = await stat(longPath(root), { bigint: true });
    if (st.isDirectory()) visited.add(seenKey(st.dev, st.ino));
  } catch {
    /* kok okunamadi: opendir hatayi raporlar */
  }

  /** Tek bir girdiyi isler (grup icinde paralel calisir). */
  const handleEntry = async (entry: Dirent, dir: string): Promise<void> => {
    const full = `${dir}\\${entry.name}`;

    let isDir = entry.isDirectory();
    let isFile = entry.isFile();
    const isLink = entry.isSymbolicLink();

    if (isLink && followLinks) {
      try {
        const target = await readlink(longPath(full));
        const st = await stat(longPath(full), { bigint: true });
        isDir = st.isDirectory();
        isFile = st.isFile();
        void target;
      } catch (err) {
        classify(err, full, res.skipped);
        return;
      }
    } else if (isLink) {
      // Varsayilan: linkleri izleme (dongu + kopya sayma riski)
      return;
    }

    if (isDir) {
      try {
        const st = await stat(longPath(full), { bigint: true });
        const key = seenKey(st.dev, st.ino);
        if (visited.has(key)) {
          res.skipped.push({ path: full, reason: 'link-loop' });
          return;
        }
        visited.add(key);
        res.dirs++;
        stack.push(full);
      } catch (err) {
        classify(err, full, res.skipped);
      }
      return;
    }

    if (!isFile) return;

    try {
      const st = await stat(longPath(full), { bigint: true });
      const size = Number(st.size);
      const mtimeMs = Number(st.mtimeMs);
      const key = seenKey(st.dev, st.ino);
      // Ayni dosyanin birden fazla adi (hardlink): bayt BIR KEZ sayilir.
      const duplicate = st.nlink > 1n && hardlinks.has(key);
      if (duplicate) {
        res.hardlinkedBytes += size;
      } else {
        if (st.nlink > 1n) hardlinks.add(key);
        res.bytes += size;
        for (const d of ageThresholds) {
          if (mtimeMs < now - d * DAY_MS) {
            res.olderBytes.set(d, (res.olderBytes.get(d) ?? 0) + size);
          }
        }
      }
      res.files++;
      if (mtimeMs > res.lastTouched) res.lastTouched = mtimeMs;

      const ext = extOf(entry.name);
      if (ext) {
        res.extensionCounts.set(ext, (res.extensionCounts.get(ext) ?? 0) + 1);
      }

      // Gercek "en buyuk N": liste doluyken daha buyuk dosya gelirse
      // en kucuk kayit cikarilir. (Eski davranis ilk bulunan N'i tutuyordu.)
      if (size >= largeThreshold && maxLarge > 0) {
        const list = res.largeFiles;
        const rec = {
          relPath: full.slice(root.length).replace(/^\\/, '') || entry.name,
          bytes: size,
        };
        if (list.length < maxLarge) {
          list.push(rec);
          list.sort((a, b) => b.bytes - a.bytes);
        } else if (size > list[list.length - 1]!.bytes) {
          list[list.length - 1] = rec;
          list.sort((a, b) => b.bytes - a.bytes);
        }
      }
    } catch (err) {
      classify(err, full, res.skipped);
    }

    report();
  };

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

    let batch: Dirent[] = [];
    for await (const entry of entries) {
      if (signal?.aborted) break;
      batch.push(entry);
      if (batch.length >= STAT_CONCURRENCY) {
        const group = batch;
        batch = [];
        await Promise.all(group.map((e) => handleEntry(e, dir)));
      }
    }
    if (batch.length > 0 && !signal?.aborted) {
      await Promise.all(batch.map((e) => handleEntry(e, dir)));
    }
    report();
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

  report(true);
  return res;
}

/**
 * Atlanan yolu SEBEBIYLE kaydeder.
 *
 * Eski davranis ENOENT disindaki her hatayi `gone` sayiyordu: EBUSY/EMFILE/
 * EIO gibi gecici olcum hatalari "dosya zaten yok" gibi gorunuyor, eksik
 * olcum kullaniciya yansimiyordu (W5). Artik ayri `error` turu ve kod var.
 */
function classify(err: unknown, path: string, skipped: SkippedEntry[]): void {
  if (isLongPathError(err)) {
    skipped.push({ path, reason: 'long-path' });
    warn('uzun yol atlandi', { path });
    return;
  }
  if (isDenied(err)) {
    skipped.push({ path, reason: 'denied' });
    debug('erisim reddedildi', { path });
    return;
  }
  const code = errorCode(err);
  if (code === 'ENOENT') {
    skipped.push({ path, reason: 'gone' });
    return;
  }
  skipped.push({ path, reason: 'error', code });
  debug('olcum hatasi', { path, code });
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
