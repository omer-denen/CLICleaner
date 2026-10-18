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

export const SCAN_CACHE_TTL_MS = 24 * 60 * 60_000; // 1 gun

export function scanCachePath(): string {
  return join(process.env.LOCALAPPDATA ?? '.', 'clicleaner', 'scans', 'last-scan.json');
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

export async function loadScanCache(now = Date.now()): Promise<{ scan: ScanResult; at: number } | null> {
  try {
    const txt = await readFile(longPath(scanCachePath()), 'utf8');
    const parsed = JSON.parse(txt) as Partial<ScanResult>;
    if (!Array.isArray(parsed.clusters)) return null;
    const at = typeof parsed.finishedAt === 'number' ? parsed.finishedAt : 0;
    if (!at || now - at > SCAN_CACHE_TTL_MS || now < at - 60_000) return null;
    return { scan: parsed as ScanResult, at };
  } catch {
    return null;
  }
}
