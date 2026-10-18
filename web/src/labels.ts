import type { RiskLevel } from '../../src/web/contract.ts';
import { formatAge } from '../../src/util/format.ts';

/** Mimari tip etiketleri: kullaniciya "bu ne" sorusunun kisa cevabi. */
export const ARCHETYPE_LABEL: Record<string, string> = {
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
  'os-user-data': 'Kullanıcı verisi',
  'virtual-disk': 'Sanal disk',
  unknown: 'Tanımlanamayan',
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
};

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
