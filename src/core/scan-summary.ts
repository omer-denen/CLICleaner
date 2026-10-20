import { categoryStats, type CategoryStat } from './categories.ts';
import { RISK_SEQUENCE } from './cluster-query.ts';
import type { Cluster, Risk, VerdictKind } from './types.ts';

/**
 * TARAMA OZETI.
 *
 * "Taranan ne kadar", "kac karar var", "kac dosya tarandi" gibi sayimlarin
 * tek sahibi. Sayilar ayni veriden turetilir; hicbir karar burada verilmez.
 *
 * Bu modul SAF TypeScript'tir: node builtin importu YOKTUR.
 */
export class ScanSummary {
  private readonly clusters: Cluster[];

  constructor(clusters: Cluster[]) {
    this.clusters = clusters;
  }

  /** Taranan tum kumeler. */
  get all(): Cluster[] {
    return this.clusters;
  }

  /** Toplam bayt ve kurtarilabilir bayt. */
  totals(): { totalBytes: number; reclaimableBytes: number } {
    let totalBytes = 0;
    let reclaimableBytes = 0;
    for (const c of this.clusters) {
      totalBytes += c.totalBytes;
      reclaimableBytes += c.reclaimableBytes;
    }
    return { totalBytes, reclaimableBytes };
  }

  /** Karar turune gore kume sayilari. */
  verdictCounts(): Record<VerdictKind, number> {
    const out: Record<VerdictKind, number> = {
      recommend: 0,
      ask: 0,
      'report-only': 0,
      keep: 0,
    };
    for (const c of this.clusters) out[c.verdict.kind]++;
    return out;
  }

  /** Taranan dosya sayisi (kumelerin parcalarindan). */
  fileCount(): number {
    let n = 0;
    for (const c of this.clusters) for (const p of c.parts) n += p.files;
    return n;
  }

  /** Git tarafindan takip edilen (tracked) kume sayisi. */
  gitTrackedCount(): number {
    let n = 0;
    for (const c of this.clusters) {
      if ((c.evidence.markers ?? []).includes('git-tracked')) n++;
    }
    return n;
  }

  /** Kategori bazli ozet (sol sutun). */
  categoryStats(): Record<string, CategoryStat> {
    return categoryStats(this.clusters);
  }

  /**
   * Risk sirasina gore gruplar (bos gruplar elenir).
   *
   * `riskOf` sayesinde hem tarama kumeleri (`verdict.risk`) hem plan
   * gorunumu (`risk`) ayni sirayla gruplanir.
   */
  static groupByRisk<T>(
    items: T[],
    riskOf: (item: T) => Risk,
  ): Array<{ risk: Risk; clusters: T[] }> {
    return RISK_SEQUENCE.map((risk) => ({
      risk,
      clusters: items.filter((i) => riskOf(i) === risk),
    })).filter((g) => g.clusters.length > 0);
  }

  /** Tarama kumelerini risk sirasina gore gruplar. */
  riskGroups(): Array<{ risk: Risk; clusters: Cluster[] }> {
    return ScanSummary.groupByRisk(this.clusters, (c) => c.verdict.risk);
  }
}
