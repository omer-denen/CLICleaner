import type { Lang } from './i18n.ts';

/** Yalnizca SUNUM: bayt ve yas bicimlendirme. Karar yok. */

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = n;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

export function formatAge(ms: number | null, lang: Lang): string {
  if (ms === null || !Number.isFinite(ms)) return '—';
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (ms < minute) return lang === 'tr' ? 'az önce' : 'just now';
  if (ms < hour) {
    const m = Math.round(ms / minute);
    return lang === 'tr' ? `${m} dk önce` : `${m} min ago`;
  }
  if (ms < day) {
    const h = Math.round(ms / hour);
    return lang === 'tr' ? `${h} saat önce` : `${h} h ago`;
  }
  const d = Math.round(ms / day);
  return lang === 'tr' ? `${d} gün önce` : `${d} d ago`;
}
