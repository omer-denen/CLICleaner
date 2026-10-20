import type { Cluster } from './types.ts';

/**
 * SECIM VE PLAN KAPSAMI.
 *
 * "Hangi kume secilebilir", "Tumunu planla neyi kapsar", "Secili ne kadar"
 * sorularinin tek sahibi. Iki farkli kural vardir ve BILINCLI olarak
 * ayridir:
 *
 *   - `isSelectable`  : listeden secim kolayligi. "report-only" secilmez.
 *   - `isPlannable`   : PLANA girme. "report-only" ve "keep" HICBIR ZAMAN
 *                       plana girmez; "keep" = kullanici degeri (ayar, oturum,
 *                       beceri, proje emegi).
 *
 * Bu modul SAF TypeScript'tir: node builtin importu YOKTUR.
 */
export class SelectionScope {
  private readonly clusters: Cluster[];

  constructor(clusters: Cluster[]) {
    this.clusters = clusters;
  }

  /** Taranan tum kumeler. */
  get all(): Cluster[] {
    return this.clusters;
  }

  /** Gercekten silinecek yolu var mi? (Hedefsiz "onerilen" yaniltici olurdu.) */
  static hasDeleteTargets(c: Cluster): boolean {
    return (c.deleteTargets?.length ?? 0) > 0;
  }

  /**
   * Listeden SECILEBILIR mi?
   *
   * "report-only" hicbir zaman secilmez (yalniz raporlanir). Secim bir karar
   * degil, kullanici kolayligidir.
   */
  static isSelectable(c: Cluster): boolean {
    return c.verdict.kind !== 'report-only' && SelectionScope.hasDeleteTargets(c);
  }

  /**
   * PLANA alinabilir mi?
   *
   * "report-only" ve "keep" HICBIR ZAMAN plana girmez.
   */
  static isPlannable(c: Cluster): boolean {
    return (
      c.verdict.kind !== 'report-only' &&
      c.verdict.kind !== 'keep' &&
      SelectionScope.hasDeleteTargets(c)
    );
  }

  /**
   * Listeden secilebilen kumelerin anahtarlari. Varsayilan: bu nesnenin
   * tum kumeleri. "Gorunenleri sec" bu listeyi kullanir.
   */
  selectableKeys(over: Cluster[] = this.clusters): string[] {
    return over.filter(SelectionScope.isSelectable).map((c) => c.key);
  }

  /**
   * "Tumunu planla" KAPSAMI: verilen kumelerden plana alinabilenlerin
   * anahtarlari. Varsayilan: bu nesnenin tum kumeleri.
   *
   * "Nuke All" YOKTUR: bu yalniz PLAN uretir; uygulama icin ayrica yazili
   * onay gerekir.
   */
  planScopeKeys(over: Cluster[] = this.clusters): string[] {
    return over.filter(SelectionScope.isPlannable).map((c) => c.key);
  }

  /** "Sec (N)": plana alinabilen kume sayisi. */
  plannableCount(over: Cluster[] = this.clusters): number {
    let n = 0;
    for (const c of over) if (SelectionScope.isPlannable(c)) n++;
    return n;
  }

  /** Secili kumelerin ozeti. */
  totals(keys: Iterable<string>): { clusterCount: number; bytes: number; targetCount: number } {
    const set = keys instanceof Set ? keys : new Set(keys);
    let clusterCount = 0;
    let bytes = 0;
    let targetCount = 0;
    for (const c of this.clusters) {
      if (!set.has(c.key)) continue;
      clusterCount++;
      bytes += c.reclaimableBytes;
      targetCount += c.deleteTargets?.length ?? 0;
    }
    return { clusterCount, bytes, targetCount };
  }
}
