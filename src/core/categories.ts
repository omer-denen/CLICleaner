import type { Cluster } from './types.ts';

/**
 * Kategori tureti — TEK kaynak (T42 / D3 P0 + P5).
 *
 * Kategoriler UYGULAMA ADINDAN degil, KANITTAN turetilir: mimari tip
 * (archetype) ve dosya turu (fileKind) sinyallerine bakilir. Cekirdekte
 * yeni bir siniflandirma kurali eklenince burasi da guncellenir; arayuz
 * AYRI bir liste tutmaz.
 *
 * Bu modul yalnizca SINIFLANDIRIR: hicbir yolu silmez, hedef uretmez.
 */

export type CategoryKey = 'ai-debris' | 'orphaned-cli' | 'ghost-envs' | 'other';

/** Kategori sirasi (kararli). */
export const CATEGORY_ORDER: CategoryKey[] = ['ai-debris', 'orphaned-cli', 'ghost-envs', 'other'];

/** Kullaniciya gosterilen adlar (arayuz bunu cevirir). */
export const CATEGORY_LABEL: Record<CategoryKey, string> = {
  'ai-debris': 'AI Debris',
  'orphaned-cli': 'Orphaned CLI',
  'ghost-envs': 'Ghost Envs',
  other: 'Diğer',
};

/** AI artiklari: model depolari, ajan calisma alanlari, GPU/vektor runtime. */
const AI_ARCHETYPES = new Set(['model-store', 'agent-workspace', 'accelerator-runtime']);
const AI_FILE_KINDS = new Set(['onnx-model', 'embedding-index', 'cuda-runtime']);

/** Global CLI kurulumlari (shim tabanli). */
const CLI_ARCHETYPES = new Set(['global-packages']);

/** Derlenmis yorumlayici ortamlari ve proje ici bagimliliklar. */
const ENV_ARCHETYPES = new Set(['runtime-pool', 'project-artifact']);

export interface CategoryStat {
  key: CategoryKey;
  /** Kume sayisi */
  count: number;
  /** Toplam boyut */
  bytes: number;
  /** Silinebilir (reclaimable) boyut */
  reclaimable: number;
}

/** Tek bir kumenin kategorisi. Kanit yoksa "other" (yalniz rapor). */
export function categoryOf(c: Cluster): CategoryKey {
  const archetype = c.evidence.archetype ?? c.archetype;
  const kinds = c.evidence.fileKinds ?? [];
  if (AI_ARCHETYPES.has(archetype)) return 'ai-debris';
  if (kinds.some((k) => AI_FILE_KINDS.has(k))) return 'ai-debris';
  if (CLI_ARCHETYPES.has(archetype)) return 'orphaned-cli';
  if (ENV_ARCHETYPES.has(archetype)) return 'ghost-envs';
  return 'other';
}

/** Kategori bazli ozet. */
export function categoryStats(clusters: Cluster[]): Record<CategoryKey, CategoryStat> {
  const out = {} as Record<CategoryKey, CategoryStat>;
  for (const key of CATEGORY_ORDER) out[key] = { key, count: 0, bytes: 0, reclaimable: 0 };
  for (const c of clusters) {
    const s = out[categoryOf(c)];
    s.count += 1;
    s.bytes += c.totalBytes;
    s.reclaimable += c.reclaimableBytes;
  }
  return out;
}

/**
 * "Ajan kirliligi": AI artiklarinin toplam taranan bayt icindeki payi.
 * Disk dolulugu ayrica `diskUsage` ile olculur; bu oran tarama sonucundan
 * hesaplanir ve ayri bir gostergedir.
 */
export function agentClutter(clusters: Cluster[]): number {
  let total = 0;
  let ai = 0;
  for (const c of clusters) {
    total += c.totalBytes;
    if (categoryOf(c) === 'ai-debris') ai += c.totalBytes;
  }
  if (total <= 0) return 0;
  return ai / total;
}
