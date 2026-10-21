import { createHash } from 'node:crypto';

/**
 * Surum kontrolu (T41) — KAPALI varsayilan, acikca opt-in.
 *
 * Kurallar:
 *   - Kapaliyken HICBIR ag istegi yapilmaz.
 *   - Acikken TEK bir HTTPS istegi gider:
 *     `registry.npmjs.org/residue-cleaner/latest`.
 *   - Gonderilen tek veri registry adresidir; kimlik, disk yolu, tarama
 *     sonucu veya kullanim verisi GONDERILMEZ.
 *   - Sonuc 24 saat onbellekte tutulur.
 *   - **Kendi kendine guncelleme YOKTUR.** Kullanici guncellemeyi kendisi
 *     yapar (npm/GitHub).
 */

export type UpdateCheckMode = 'off' | 'daily' | 'weekly';

export const UPDATE_MODES: UpdateCheckMode[] = ['off', 'daily', 'weekly'];

export interface UpdateCheckResult {
  /** Kontrol yapildi mi? (kapaliyken false) */
  checked: boolean;
  /** Mod */
  mode: UpdateCheckMode;
  /** registry'de bulunan guncel surum */
  latest?: string;
  /** kurulu surum */
  current?: string;
  /** Guncel surum farkli mi? */
  updateAvailable: boolean;
  /** Son kontrol zamani (epoch ms) */
  checkedAt?: number;
  /** Hata (ag yoksa vb.) */
  error?: string;
}

export const REGISTRY_URL = 'https://registry.npmjs.org/residue-cleaner/latest';
const CACHE_MS = 24 * 3_600_000;
const TIMEOUT_MS = 8000;

interface CacheEntry {
  at: number;
  result: UpdateCheckResult;
}

const cache = new Map<string, CacheEntry>();

/** Moda gore kacak suresi (ms). */
export function intervalMs(mode: UpdateCheckMode): number {
  if (mode === 'daily') return CACHE_MS;
  if (mode === 'weekly') return 7 * CACHE_MS;
  return 0;
}

export function isUpdateMode(v: unknown): v is UpdateCheckMode {
  return typeof v === 'string' && (UPDATE_MODES as string[]).includes(v);
}

export function cacheKey(mode: UpdateCheckMode): string {
  return mode;
}

/**
 * Tek surum sorgusu. Hata durumunda hata mesajiyla doner (ag yoksa).
 */
export async function fetchLatestVersion(timeoutMs = TIMEOUT_MS): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(REGISTRY_URL, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { version?: string };
    if (!body.version) throw new Error('surum bulunamadi');
    return body.version;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Surum kontrolu (onbellekli). Kapaliyken ag istegi YAPILMAZ.
 */
export async function checkForUpdate(
  mode: UpdateCheckMode,
  currentVersion: string,
  force = false,
): Promise<UpdateCheckResult> {
  if (mode === 'off') {
    return { checked: false, mode, current: currentVersion, updateAvailable: false };
  }

  const key = cacheKey(mode);
  const now = Date.now();
  const hit = cache.get(key);
  if (!force && hit && now - hit.at < intervalMs(mode)) {
    return { ...hit.result, current: currentVersion };
  }

  try {
    const latest = await fetchLatestVersion();
    const result: UpdateCheckResult = {
      checked: true,
      mode,
      latest,
      current: currentVersion,
      updateAvailable: latest !== currentVersion,
      checkedAt: now,
    };
    cache.set(key, { at: now, result });
    return result;
  } catch (e) {
    const result: UpdateCheckResult = {
      checked: true,
      mode,
      current: currentVersion,
      updateAvailable: false,
      checkedAt: now,
      error: e instanceof Error ? e.message : String(e),
    };
    // Hata sonucu onbellege girmez: bir sonraki denemede yeniden sorulur.
    return result;
  }
}

/** Onbellegi temizler (testler icin). */
export function clearUpdateCache(): void {
  cache.clear();
}

/** Kisa, insan tarafindan okunabilir surum ozeti. */
export function versionFingerprint(v: string): string {
  return createHash('sha256').update(v).digest('hex').slice(0, 12);
}
