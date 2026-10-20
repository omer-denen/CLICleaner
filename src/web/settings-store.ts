import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { longPath } from '../util/longpath.ts';

/**
 * Web arayuzu ayarlari (kalici).
 *
 * Sabit kodlanmis 24 saat kurali yerine kullanici ayari tutulur.
 * Dosya aracin kendi veri dizinindedir; taranmaz, silinmez.
 */

export interface WebSettings {
  /** Tarama onbellegi gecerlilik suresi (saat). 1..720 */
  scanCacheHours: number;
}

export const DEFAULT_SETTINGS: WebSettings = { scanCacheHours: 24 };
export const MIN_CACHE_HOURS = 1;
export const MAX_CACHE_HOURS = 720;

export function settingsPath(): string {
  return join(process.env.LOCALAPPDATA ?? '.', 'clicleaner', 'settings.json');
}

function clampHours(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return DEFAULT_SETTINGS.scanCacheHours;
  return Math.min(MAX_CACHE_HOURS, Math.max(MIN_CACHE_HOURS, Math.round(v)));
}

export async function loadSettings(): Promise<WebSettings> {
  try {
    const txt = await readFile(longPath(settingsPath()), 'utf8');
    const j = JSON.parse(txt) as Partial<WebSettings>;
    return { scanCacheHours: clampHours(j.scanCacheHours) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(patch: Partial<WebSettings>): Promise<WebSettings> {
  const current = await loadSettings();
  const next: WebSettings = {
    ...current,
    ...(patch.scanCacheHours !== undefined ? { scanCacheHours: clampHours(patch.scanCacheHours) } : {}),
  };
  try {
    const file = settingsPath();
    await mkdir(longPath(dirname(file)), { recursive: true });
    await writeFile(longPath(file), JSON.stringify(next, null, 2), 'utf8');
  } catch {
    /* yazilamadi: varsayilanla devam */
  }
  return next;
}
