import type { Cluster } from './types.ts';

/**
 * Varsayilan secim kurali (T34).
 *
 * Bir kume ancak su uc kosul birlikte saglanirsa varsayilan olarak
 * isaretlenir:
 *   1. karar "onerilen" (ask/report-only asla varsayilan secilmez),
 *   2. gercekten silinecek bir yol var (hedefsiz "onerilen" yaniltici olur),
 *   3. yeniden uretilebilirlik kanitlanmis ve guven "dusuk" degil.
 *
 * "Kullanici verisi" ve "belirsiz" kumeler varsayilan secilmez: kullanici
 * bunlari ancak bilerek isaretler. Kanit alanlari olmayan eski onbellek
 * kayitlarinda (regenerability tanimsiz) eski davranisa donulur; aksi
 * halde guncelleme sonrasi ilk tarama bos secimle acilirdi.
 */
export function defaultSelected(c: Cluster): boolean {
  if (c.verdict.kind !== 'recommend') return false;
  if ((c.deleteTargets?.length ?? 0) === 0) return false;
  const regen = c.verdict.regenerability;
  if (regen === 'user-data' || regen === 'unknown') return false;
  if (c.verdict.confidence === 'low') return false;
  return true;
}
