import { join } from 'node:path';

/**
 * Aracin kendi veri dizini (gunluk, kasa, tarama onbellegi, ayarlar).
 *
 * Tek kaynak: bu dosya. Diger moduller yol uydurmaz, buradan alir.
 *
 * 2.0.0'da ad `clicleaner` -> `residue` olarak degisti. Eski dizin
 * (`%LOCALAPPDATA%\clicleaner`) gecis sirasinda SILINMEZ: hem veri
 * (kasa) hem de "kendi verim" korumasi icin hala taninir.
 */

/** Guncel veri dizini adi (LOCALAPPDATA altinda). */
export const DATA_DIR_NAME = 'residue';

/** Onceki ad: gecis ve geri yukleme icin korunur. */
export const LEGACY_DATA_DIR_NAME = 'clicleaner';

/** Guncel veri dizininin tam yolu. */
export function dataDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(env.LOCALAPPDATA ?? '.', DATA_DIR_NAME);
}

/** Eski veri dizininin tam yolu (yoksa undefined). */
export function legacyDataDir(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.LOCALAPPDATA ? join(env.LOCALAPPDATA, LEGACY_DATA_DIR_NAME) : undefined;
}
