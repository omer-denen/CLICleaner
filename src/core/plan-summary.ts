import type { PlannedClusterView, PlannedTargetView } from './contract.ts';

/**
 * PLAN OZETI.
 *
 * Plan ekraninda gosterilen sayimlar: risk dagilimi ("SIL" yazili onay
 * gerekip gerekmedigini belirler), hedef turu dagilimi ve toplam bayt.
 *
 * Bu modul SAF TypeScript'tir: node builtin importu YOKTUR.
 */

export interface RiskCounts {
  /** Orta veya yuksek riskli kume sayisi. */
  mediumOrHigh: number;
  /** Yuksek riskli kume sayisi. */
  high: number;
}

export interface TargetKindCounts {
  /** "klasorun tamami" hedefleri. */
  whole: number;
  /** "yasli dosyalar" hedefleri. */
  older: number;
}

export class PlanSummary {
  private readonly clusters: PlannedClusterView[];

  constructor(clusters: PlannedClusterView[]) {
    this.clusters = clusters;
  }

  /** Plan kapsamindaki tum kumeler. */
  get all(): PlannedClusterView[] {
    return this.clusters;
  }

  /**
   * Risk dagilimi.
   *
   * "mediumOrHigh" -> yazili "SIL" onayi gerekir.
   * "high"         -> ayrica acik isaretleme gerekir.
   */
  riskCounts(): RiskCounts {
    let mediumOrHigh = 0;
    let high = 0;
    for (const c of this.clusters) {
      if (c.risk === 'medium' || c.risk === 'high') mediumOrHigh++;
      if (c.risk === 'high') high++;
    }
    return { mediumOrHigh, high };
  }

  /** Hedef turu dagilimi: "klasorun tamami" / "yasli dosyalar". */
  targetCounts(targets: PlannedTargetView[]): TargetKindCounts {
    let whole = 0;
    let older = 0;
    for (const t of targets) {
      if (t.target.kind === 'whole') whole++;
      else older++;
    }
    return { whole, older };
  }

  /** Verilen hedeflerin toplam kurtarilabilir bayti. */
  totalBytes(targets: PlannedTargetView[]): number {
    let n = 0;
    for (const t of targets) n += t.bytes;
    return n;
  }

  /** Verilen kumelerin hedeflerinin toplam bayti. */
  clusterBytes(clusters: PlannedClusterView[]): number {
    let n = 0;
    for (const c of clusters) for (const t of c.targets) n += t.bytes;
    return n;
  }
}
