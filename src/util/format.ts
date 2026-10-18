/** Bayt / tarih / sure bicimlendirme yardimcilari. */

export function formatBytes(n: number, digits?: number): string {
  if (!Number.isFinite(n) || n < 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const d = digits ?? (i <= 1 ? 0 : v >= 100 ? 0 : v >= 10 ? 1 : 2);
  return `${v.toFixed(d)} ${units[i]}`;
}

/** Turkce tarih: 16 Eki 2026 */
const AYLAR = [
  'Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz',
  'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara',
];
const GUNLER = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

export function formatDate(ms: number): string {
  if (!ms) return '-';
  const d = new Date(ms);
  return `${d.getDate()} ${AYLAR[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatDateTime(ms: number): string {
  if (!ms) return '-';
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** "3 gun once", "5 ay once" - yaslilik kararinda kritik. */
export function formatAge(ms: number, now = Date.now()): string {
  if (!ms) return 'bilinmiyor';
  const s = Math.max(0, (now - ms) / 1000);
  const d = Math.floor(s / 86400);
  if (d < 1) {
    const h = Math.floor(s / 3600);
    if (h < 1) return `${Math.max(1, Math.floor(s / 60))} dk once`;
    return `${h} saat once`;
  }
  if (d < 30) return `${d} gun once`;
  const m = Math.floor(d / 30);
  if (m < 12) return `${m} ay once`;
  return `${Math.floor(m / 12)} yil once`;
}

/** Milisaniye cinsinden zaman damgasindan gun cinsinden yas. */
export function daysSince(ms: number, now = Date.now()): number {
  if (!ms) return Number.POSITIVE_INFINITY;
  // NOT: zaman damgalari MILISANIYEDIR. Daha once 86400'e bolunuyordu
  // (saniye varsayimi) ve yas 1000 kat buyuk cikiyordu.
  return (now - ms) / 86_400_000;
}

export function formatCount(n: number): string {
  return n.toLocaleString('tr-TR');
}

/** TUI icin sabit genislikte yuzde cubugu. */
export function bar(frac: number, width: number): string {
  const f = Math.max(0, Math.min(1, frac));
  const filled = Math.round(f * width);
  return '#'.repeat(filled) + '.'.repeat(Math.max(0, width - filled));
}

/** Sagdan tablo hizalamasi icin sadece gorunur genislik (ANSI'siz). */
export function padEnd(s: string, width: number): string {
  const w = visibleWidth(s);
  return w >= width ? s : s + ' '.repeat(width - w);
}

export function padStart(s: string, width: number): string {
  const w = visibleWidth(s);
  return w >= width ? s : ' '.repeat(width - w) + s;
}

/** ANSI renk kodlarini saymadan gorunur genisligi hesaplar. */
export function visibleWidth(s: string): number {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '').length;
}

/** Uzun metni ortadan kisalt: "...\aherhangi\Classi\buraya..." */
export function truncatePath(s: string, max: number): string {
  if (s.length <= max) return s;
  const keep = max - 3;
  const head = Math.floor(keep * 0.4);
  const tail = keep - head;
  return `${s.slice(0, head)}...${s.slice(s.length - tail)}`;
}