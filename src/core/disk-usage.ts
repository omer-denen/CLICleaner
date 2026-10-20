import { statfsSync } from 'node:fs';
import { homedir } from 'node:os';
import { parse } from 'node:path';

/**
 * Disk kullanimi (P4 saglik gostergesi).
 *
 * Yalnizca OKUNUR bir sistem cagrisi: `statfs` surucu istatistiklerini
 * dondurur. Dosya sayimi, tarama veya yazma YOK.
 *
 * Windows'ta surucu, ev dizininin bulundugu kok olarak alinir (genelde C:).
 */

export interface DiskUsage {
  /** Surucu koku, ornek "C:\\" */
  drive: string;
  /** Toplam kapasite (bayt) */
  totalBytes: number;
  /** Kullaniciya kullanilabilir bos alan (bayt) */
  freeBytes: number;
  /** Doluluk orani 0..1 */
  usedRatio: number;
}

export function diskUsage(path: string = homedir()): DiskUsage | null {
  try {
    const s = statfsSync(path);
    const bsize = Number(s.bsize);
    const blocks = Number(s.blocks);
    const bavail = Number(s.bavail);
    if (!Number.isFinite(bsize) || bsize <= 0 || blocks <= 0) return null;
    const totalBytes = blocks * bsize;
    const freeBytes = Math.max(0, bavail * bsize);
    const usedRatio = totalBytes > 0 ? Math.min(1, Math.max(0, 1 - freeBytes / totalBytes)) : 0;
    return {
      drive: parse(path).root || path,
      totalBytes,
      freeBytes,
      usedRatio,
    };
  } catch {
    // Surucu olculemiyorsa (izin/kilitli) gosterge bos kalir; hata firlatilMAZ.
    return null;
  }
}
