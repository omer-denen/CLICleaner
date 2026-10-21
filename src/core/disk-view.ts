import { ClusterQuery, type QueryCriteria } from './cluster-query.ts';
import { ScanSummary } from './scan-summary.ts';
import { SelectionScope } from './selection-scope.ts';
import { DefaultSelection } from './selection.ts';
import { categoryOf, categoryStats } from './categories.ts';
import { EvidenceReader } from './evidence-text.ts';
import { daysSince } from '../util/format.ts';
import type { Cluster } from './types.ts';
import type {
  ClusterDetailView,
  ClusterKindFilter,
  DiskClusterView,
  DiskViewResponse,
} from './contract.ts';

/**
 * DISK GORUNUMU — KARAR MOTORU.
 *
 * Liste filtresi/siralamasi (`ClusterQuery`), secim kapsami
 * (`SelectionScope`), varsayilan secim (`DefaultSelection`) ve sayimlar
 * (`ScanSummary`) burada birlestirilir. Arayuz yalnizca sonucu gosterir;
 * kendi filtresini/sayimini URETMEZ.
 *
 * Bu modul SAF TypeScript'tir: node builtin importu YOKTUR.
 */

function idleDays(c: Cluster): number {
  const days = daysSince(c.lastTouched);
  return Number.isFinite(days) ? Math.max(0, Math.round(days)) : 0;
}

function isGitTracked(c: Cluster): boolean {
  return EvidenceReader.isGitTracked(c);
}

/** Tek kume satiri (liste icin). */
export function toDiskCluster(c: Cluster): DiskClusterView {
  return {
    key: c.key,
    title: c.title,
    category: categoryOf(c),
    risk: c.verdict.risk,
    verdictKind: c.verdict.kind,
    totalBytes: c.totalBytes,
    reclaimableBytes: c.reclaimableBytes,
    lastTouched: c.lastTouched,
    idleDays: idleDays(c),
    gitTracked: isGitTracked(c),
    selectable: SelectionScope.isSelectable(c),
    plannable: SelectionScope.isPlannable(c),
    defaultSelected: DefaultSelection.selected(c),
    targetCount: c.deleteTargets?.length ?? 0,
    primaryPath: c.parts[0]?.path ?? '',
    what: c.verdict.what,
    consequence: c.verdict.consequence,
    regenerability: c.verdict.regenerability,
    confidence: c.verdict.confidence,
  };
}

/** Tek kume ayrinti gorunumu (sag panel). */
export function toClusterDetail(c: Cluster): ClusterDetailView {
  return {
    cluster: c,
    category: categoryOf(c),
    risk: c.verdict.risk,
    verdictKind: c.verdict.kind,
    idleDays: idleDays(c),
    gitTracked: isGitTracked(c),
    selectable: SelectionScope.isSelectable(c),
    plannable: SelectionScope.isPlannable(c),
    defaultSelected: DefaultSelection.selected(c),
  };
}

export class DiskView {
  private readonly clusters: Cluster[];
  private readonly selectedKeys: string[];

  constructor(clusters: Cluster[], selectedKeys: string[] = []) {
    this.clusters = clusters;
    this.selectedKeys = selectedKeys;
  }

  /** Tek kume (detay); yoksa null. */
  byKey(key: string): Cluster | null {
    return new ClusterQuery(this.clusters).byKey(key);
  }

  /**
   * Liste gorunumu.
   *
   * Secim ozeti YALNIZCA plana alinabilen kumeleri sayar: "keep" veya
   * hedefsiz bir anahtar gonderilse bile toplama katilmaz.
   */
  view(criteria: QueryCriteria = {}, scanAt: number | null = null): DiskViewResponse {
    const query = new ClusterQuery(this.clusters);
    const filtered = query.filter(criteria);
    const summary = new ScanSummary(this.clusters);
    const scope = new SelectionScope(this.clusters);

    const plannableAll = new Set(scope.planScopeKeys());
    const selected = this.selectedKeys.filter((k) => plannableAll.has(k));
    const selection = scope.totals(selected);
    const totals = summary.totals();

    const counts: Record<ClusterKindFilter, number> = {
      all: summary.countFor('all'),
      recommend: summary.countFor('recommend'),
      ask: summary.countFor('ask'),
      'report-only': summary.countFor('report-only'),
      keep: summary.countFor('keep'),
      git: summary.countFor('git'),
    };

    return {
      scan: { at: scanAt, clusters: this.clusters.length },
      clusters: filtered.map(toDiskCluster),
      counts,
      categories: Object.values(categoryStats(this.clusters)),
      totals: {
        clusters: this.clusters.length,
        files: summary.fileCount(),
        totalBytes: totals.totalBytes,
        reclaimableBytes: totals.reclaimableBytes,
      },
      selectableKeys: scope.selectableKeys(filtered),
      plannableKeys: scope.planScopeKeys(filtered),
      defaultSelectedKeys: [...DefaultSelection.keys(this.clusters)],
      selection,
    };
  }
}
