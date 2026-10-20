import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { longPath } from '../util/longpath.ts';
import type { ScanResult } from '../core/types.ts';

/**
 * Son tarama sonucunun disk onbellegi.
 *
 * Neden: web arayuzu her acilista 100 saniyelik tarama yapmasin ve
 * sunucu yeniden basladiginda sonuc kaybolmasin. Sonuc 24 saatten
 * eskiyse GECERSIZ sayilir; kullaniciya "Incele" ekrani gosterilir.
 */

export const SCAN_CACHE_TTL_MS = 24 * 60 * 60_000; // varsayilan: 1 gun

export function scanCachePath(): string {
  return join(process.env.LOCALAPPDATA ?? '.', 'clicleaner', 'scans', 'last-scan.json');
}

/** Disk degisti isareti: son tarama artik guncel sayilmaz. */
export function scanDirtyPath(): string {
  return join(process.env.LOCALAPPDATA ?? '.', 'clicleaner', 'scans', 'dirty.json');
}

export async function markScanDirty(at = Date.now()): Promise<void> {
  try {
    const file = scanDirtyPath();
    await mkdir(longPath(dirname(file)), { recursive: true });
    await writeFile(longPath(file), JSON.stringify({ at }), 'utf8');
  } catch {
    /* yazilamadi; TTL yine gecerli */
  }
}

export async function loadScanDirtyAt(): Promise<number> {
  try {
    const txt = await readFile(longPath(scanDirtyPath()), 'utf8');
    const j = JSON.parse(txt) as { at?: unknown };
    return typeof j.at === 'number' && j.at > 0 ? j.at : 0;
  } catch {
    return 0;
  }
}

export async function saveScanCache(result: ScanResult): Promise<void> {
  const file = scanCachePath();
  try {
    await mkdir(longPath(dirname(file)), { recursive: true });
    await writeFile(longPath(file), JSON.stringify(result), 'utf8');
  } catch {
    /* onbellek yazilamadi; tarama yine de gecerli */
  }
}

/**
 * Son tarama kaydini okur.
 *
 * `ttlMs` yalnizca GECERLILIK suzgecidir; status ekrani icin
 * `Number.POSITIVE_INFINITY` verilerek suresi dolmus sonuc da okunur
 * (kullaniciya "eski" olarak gosterilir).
 */
export async function loadScanCache(
  now = Date.now(),
  ttlMs = SCAN_CACHE_TTL_MS,
): Promise<{ scan: ScanResult; at: number } | null> {
  try {
    const txt = await readFile(longPath(scanCachePath()), 'utf8');
    const parsed = JSON.parse(txt) as Partial<ScanResult>;
    if (!Array.isArray(parsed.clusters)) return null;
    const at = typeof parsed.finishedAt === 'number' ? parsed.finishedAt : 0;
    // Gelecekteki tarih (saat kaymasi) 60 sn'ye kadar tolere edilir.
    if (!at || now < at - 60_000) return null;
    if (Number.isFinite(ttlMs) && now - at > ttlMs) return null;
    return { scan: parsed as ScanResult, at };
  } catch {
    return null;
  }
}
