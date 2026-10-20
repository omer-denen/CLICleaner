import { cp, lstat, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { longPath } from '../util/longpath.ts';
import { walk } from '../core/walker.ts';

/**
 * CLICleaner kasasi (quarantine vault).
 *
 * Windows Geri Donusum Kutusu KULLANILMAZ. Silinen yollar aracin kendi
 * veri dizinindeki kasaya tasinir; her parti icin manifest tutulur:
 *   %LOCALAPPDATA%\clicleaner\vault\<batch>\manifest.json
 *   %LOCALAPPDATA%\clicleaner\vault\<batch>\items\00001
 *
 * Ayni surucude `rename` atomiktir ve hizlidir; farkli surucude
 * kopyala+sil yedegine dusulur. Kasa kendi veri dizininde oldugu icin
 * tarama/guard katmani onu hedef gostermez.
 */

export interface VaultEntry {
  originalPath: string;
  storedPath: string;
  bytes: number;
  files: number;
  at: number;
}

export interface VaultBatch {
  id: string;
  dir: string;
  at: number;
  entries: VaultEntry[];
}

export function vaultRoot(): string {
  return join(process.env.LOCALAPPDATA ?? '.', 'clicleaner', 'vault');
}

export async function newVaultBatch(now = Date.now()): Promise<VaultBatch> {
  const id = `b-${now}-${Math.random().toString(36).slice(2, 7)}`;
  const dir = join(vaultRoot(), id);
  await mkdir(longPath(join(dir, 'items')), { recursive: true });
  return { id, dir, at: now, entries: [] };
}

export async function saveVaultManifest(batch: VaultBatch): Promise<void> {
  try {
    await mkdir(longPath(batch.dir), { recursive: true });
    await writeFile(
      longPath(join(batch.dir, 'manifest.json')),
      JSON.stringify({ id: batch.id, at: batch.at, entries: batch.entries }, null, 2),
      'utf8',
    );
  } catch {
    /* manifest yazilamadi: kasa yine durur, geri alma listelenemez */
  }
}

/** Tek bir yolu kasaya tasir. `bytes/files` cagiranda olculmus olmali. */
export async function moveIntoVault(
  batch: VaultBatch,
  src: string,
  bytes: number,
  files: number,
): Promise<VaultEntry> {
  const index = batch.entries.length + 1;
  const storedPath = join(batch.dir, 'items', String(index).padStart(5, '0'));
  await mkdir(longPath(dirname(storedPath)), { recursive: true });

  try {
    await rename(longPath(src), longPath(storedPath));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'EXDEV' && code !== 'EPERM' && code !== 'EACCES') throw err;
    // Farkli surucu veya kilit: kopyala, sonra kaynagi sil.
    await cp(longPath(src), longPath(storedPath), {
      recursive: true,
      preserveTimestamps: true,
      force: true,
    });
    await rm(longPath(src), { recursive: true, force: true });
  }

  const entry: VaultEntry = {
    originalPath: src,
    storedPath,
    bytes,
    files,
    at: Date.now(),
  };
  batch.entries.push(entry);
  await saveVaultManifest(batch);
  return entry;
}

async function readBatch(dir: string): Promise<VaultBatch | null> {
  try {
    const j = JSON.parse(await readFile(longPath(join(dir, 'manifest.json')), 'utf8')) as {
      id?: string;
      at?: number;
      entries?: VaultEntry[];
    };
    if (!Array.isArray(j.entries) || !j.id) return null;
    return {
      id: j.id,
      dir,
      at: typeof j.at === 'number' ? j.at : 0,
      entries: j.entries.filter((e) => e && typeof e.originalPath === 'string' && typeof e.storedPath === 'string'),
    };
  } catch {
    return null;
  }
}

/** Tum kasalar (yeni -> eski). */
export async function listVaultBatches(): Promise<VaultBatch[]> {
  let ents;
  try {
    ents = await readdir(longPath(vaultRoot()), { withFileTypes: true });
  } catch {
    return [];
  }
  const out: VaultBatch[] = [];
  for (const e of ents) {
    if (!e.isDirectory()) continue;
    const b = await readBatch(join(vaultRoot(), e.name));
    if (b) out.push(b);
  }
  return out.sort((a, b) => b.at - a.at);
}

export interface VaultEntryRef extends VaultEntry {
  batchId: string;
  /** Sunucu tarafinda kararli kimlik: `<batchId>:<index>` */
  id: string;
}

/** Kasada duran kayitlar (yeni -> eski). */
export async function listVaultEntries(): Promise<VaultEntryRef[]> {
  const batches = await listVaultBatches();
  const out: VaultEntryRef[] = [];
  for (const b of batches) {
    b.entries.forEach((e, i) => out.push({ ...e, batchId: b.id, id: `${b.id}:${i}` }));
  }
  return out.sort((a, b) => b.at - a.at);
}

/** Kimlikten kaydi bulur (istemci YOL gondermez). */
export async function findVaultEntry(id: string): Promise<VaultEntryRef | null> {
  return (await listVaultEntries()).find((e) => e.id === id) ?? null;
}

/** Basariyla geri yuklenen kaydi manifestten cikarir (liste kirlenmesin). */
export async function removeVaultEntry(entry: VaultEntryRef): Promise<void> {
  const batch = (await listVaultBatches()).find((b) => b.id === entry.batchId);
  if (!batch) return;
  batch.entries = batch.entries.filter((e) => e.storedPath !== entry.storedPath);
  await saveVaultManifest(batch);
}

async function moveBack(src: string, dst: string): Promise<void> {
  await mkdir(longPath(dirname(dst)), { recursive: true });
  try {
    await rename(longPath(src), longPath(dst));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'EXDEV' && code !== 'EPERM' && code !== 'EACCES') throw err;
    await cp(longPath(src), longPath(dst), {
      recursive: true,
      preserveTimestamps: true,
      force: true,
    });
    await rm(longPath(src), { recursive: true, force: true });
  }
}

/**
 * Kasaya tasinmis tek kaydi geri yukler.
 * Orijinal yol doluysa cakisma: `<yol>.restored-<zaman>` olarak geri konur.
 */
export async function restoreVaultEntry(
  entry: VaultEntry,
): Promise<{ restored: boolean; to: string; conflict: boolean; reason?: string }> {
  const ref = entry as Partial<VaultEntryRef>;
  const cleanup = async () => {
    if (ref.batchId && ref.id) await removeVaultEntry(entry as VaultEntryRef);
  };
  try {
    await stat(longPath(entry.originalPath));
    const to = `${entry.originalPath}.restored-${Date.now()}`;
    await moveBack(entry.storedPath, to);
    await cleanup();
    return { restored: true, to, conflict: true };
  } catch {
    /* orijinal yol bos: normal geri yukleme */
  }
  try {
    await moveBack(entry.storedPath, entry.originalPath);
    await cleanup();
    return { restored: true, to: entry.originalPath, conflict: false };
  } catch (err) {
    return {
      restored: false,
      to: entry.originalPath,
      conflict: false,
      reason: (err as Error).message,
    };
  }
}

/** Tum kasa kayitlarini geri yukler (yeni -> eski). */
export async function restoreAllVault(): Promise<{ restored: number; conflict: number; failed: number }> {
  const entries = await listVaultEntries();
  let restored = 0;
  let conflict = 0;
  let failed = 0;
  for (const e of entries) {
    const r = await restoreVaultEntry(e);
    if (!r.restored) failed++;
    else {
      restored++;
      if (r.conflict) conflict++;
    }
  }
  return { restored, conflict, failed };
}

/**
 * Kasadaki TUM parti klasorlerini KALICI olarak siler (bosalt).
 *
 * Guvenlik:
 *  - Yalnizca kasa kokunun ALTINDAKI dogrudan cocuk klasorler.
 *  - Kasa kokunun kendisi silinmez.
 *  - Reparse point (junction/symlink) atlanir; hedef klasore dokunulmaz.
 *  - Kalici islem oldugu icin API katmani yazili onay ister (BOŞALT).
 */
export async function purgeVault(): Promise<{ batches: number; bytes: number; failed: number }> {
  let ents;
  try {
    ents = await readdir(longPath(vaultRoot()), { withFileTypes: true });
  } catch {
    return { batches: 0, bytes: 0, failed: 0 };
  }

  const root = vaultRoot().toLowerCase();
  let batches = 0;
  let bytes = 0;
  let failed = 0;

  for (const e of ents) {
    if (!e.isDirectory()) continue;
    const dir = join(vaultRoot(), e.name);
    // Savunma: kasa koku disina cikan bir ad (teorik) islenmez.
    if (!dir.toLowerCase().startsWith(root + '\\')) continue;
    try {
      const st = await lstat(longPath(dir));
      if (st.isSymbolicLink()) continue;
      const w = await walk({ root: dir, largeThreshold: Infinity, maxLarge: 0 });
      await rm(longPath(dir), { recursive: true, force: true });
      batches++;
      bytes += w.bytes;
    } catch {
      failed++;
    }
  }

  return { batches, bytes, failed };
}
