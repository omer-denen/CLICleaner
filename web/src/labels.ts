import type { RiskLevel } from '../../src/web/contract.ts';
import { formatAge } from '../../src/util/format.ts';

/** Mimari tip etiketleri: kullaniciya "bu ne" sorusunun kisa cevabi. */
export const ARCHETYPE_LABEL: Record<string, string> = {
  'project-artifact': 'Proje bağımlılığı',
  'pkg-manager-cache': 'Paket önbelleği',
  'runtime-pool': 'Ortam havuzu',
  'model-store': 'Model deposu',
  'accelerator-runtime': 'GPU runtime',
  'agent-workspace': 'Ajan çalışma alanı',
  'electron-app-data': 'Uygulama önbelleği',
  'editor-extension-store': 'Editör uzantı deposu',
  'versioned-app-store': 'Sürümlü uygulama deposu',
  'temp-scratch': 'Geçici dosyalar',
  'crash-artifacts': 'Çökme dökümleri',
  'updater-staging': 'Güncelleyici artığı',
  'global-packages': 'Global paket kurulumu',
  'editor-workspace': 'Editör çalışma alanı',
  'project-workspace': 'Proje çalışma alanı',
  'os-user-data': 'Kullanıcı verisi',
  'virtual-disk': 'Sanal disk',
  unknown: 'Tanımlanamayan',
};

/** Yeniden üretilebilirlik ekseni (T34): ikinci boyut. */
export const REGEN_LABEL: Record<string, string> = {
  regenerable: 'Yeniden üretilebilir',
  unknown: 'Belirsiz',
  'user-data': 'Kullanıcı verisi',
};

/** Kanıt güveni ekseni (T34). */
export const CONFIDENCE_LABEL: Record<string, string> = {
  high: 'Güven: yüksek',
  medium: 'Güven: orta',
  low: 'Güven: düşük',
};

export const RISK_LABEL: Record<RiskLevel, string> = {
  safe: 'Güvenli',
  low: 'Düşük',
  medium: 'Orta',
  high: 'Yüksek',
};

export const VERDICT_LABEL: Record<string, string> = {
  recommend: 'Önerilen',
  ask: 'Doğrulama',
  'report-only': 'Rapor',
  keep: 'Korunuyor',
};

export const VERDICT_HINT: Record<string, string> = {
  recommend: 'Yeniden üretilebilir; varsayılan olarak seçili.',
  ask: 'Silmeden önce içeriği incelemen gerekiyor.',
  'report-only': 'Otomatik silinmez; yalnızca raporlanır.',
  keep: 'Korunuyor.',
  git: 'Git tarafından takip edilen yollar atlandı (tracked dosyalar silinmez).',
};

/** Yoğun ızgarda tek satıra sığan kısa etiketler (T42 / D3 P1). */
export const RISK_SHORT: Record<RiskLevel, string> = {
  safe: 'GÜV',
  low: 'DÜŞ',
  medium: 'ORTA',
  high: 'YÜK',
};

export const VERDICT_SHORT: Record<string, string> = {
  recommend: 'ÖN',
  ask: 'DOĞR',
  'report-only': 'RAP',
  keep: 'KOR',
};

/** Sol rail kategorilerinin kısa adları (P1'de ızgara sütununda da kullanılır). */
export { CATEGORY_LABEL } from '../../src/core/categories.ts';

/**
 * Kume anahtarini kisaltir.
 *
 * Anahtar "kapsam:tur:ad" bicimindedir (ornek "local:dir\npm-cache");
 * arayuzde yalniz son bolum gosterilir.
 */
export function shortKey(key: string): string {
  const i = Math.max(key.lastIndexOf(':'), key.lastIndexOf('\\'));
  return i >= 0 ? key.slice(i + 1) : key;
}

/** Yolu kısalt: ev dizini ve AppData önekleri tanıdık hale gelir. */
export function shortPath(p: string): string {
  return p
    .replace(/^([A-Za-z]:\\Users\\[^\\]+)\\AppData\\Local/i, '%LOCALAPPDATA%')
    .replace(/^([A-Za-z]:\\Users\\[^\\]+)\\AppData\\Roaming/i, '%APPDATA%')
    .replace(/^([A-Za-z]:\\Users\\[^\\]+)/i, '~');
}

export function riskClass(risk: RiskLevel): string {
  return `risk risk-${risk}`;
}

/** Yas etiketi: TR icin mevcut formatAge, EN icin kisa Ingilizce. */
export function ageLabel(ms: number, lang: 'tr' | 'en', now = Date.now()): string {
  if (lang === 'tr') return formatAge(ms, now);
  if (!ms) return 'unknown';
  const s = Math.max(0, (now - ms) / 1000);
  const d = Math.floor(s / 86400);
  if (d < 1) {
    const h = Math.floor(s / 3600);
    if (h < 1) return `${Math.max(1, Math.floor(s / 60))} min ago`;
    return `${h} h ago`;
  }
  if (d < 30) return `${d} d ago`;
  const m = Math.floor(d / 30);
  if (m < 12) return `${m} mo ago`;
  return `${Math.floor(m / 12)} y ago`;
}
