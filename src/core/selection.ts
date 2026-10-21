import type { Cluster } from './types.ts';

/**
 * VARSAYILAN SECIM KURALI (T34).
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
 *
 * Bu modul SAF TypeScript'tir: node builtin importu YOKTUR.
 */
export class DefaultSelection {
  /** Tek kume varsayilan olarak isaretlenir mi? */
  static selected(c: Cluster): boolean {
    if (c.verdict.kind !== 'recommend') return false;
    // Kesisen ilke: varsayilan secim YALNIZCA "safe" risklidir.
    // low/medium/high kullaniciya acikca sorulur.
    if (c.verdict.risk !== 'safe') return false;
    if ((c.deleteTargets?.length ?? 0) === 0) return false;
    const regen = c.verdict.regenerability;
    if (regen === 'user-data' || regen === 'unknown') return false;
    if (c.verdict.confidence === 'low') return false;
    return true;
  }

  /**
   * Varsayilan secim kumesi (anahtarlar).
   *
   * Arayuz bu listeyi dogrudan kullanir; secim kurali tek yerde (burada)
   * yasar, boylece web ile TUI ayni kume varsayilan olarak isaretler.
   */
  static keys(clusters: Cluster[]): Set<string> {
    const out = new Set<string>();
    for (const c of clusters) {
      if (DefaultSelection.selected(c)) out.add(c.key);
    }
    return out;
  }
}
