import { daysSince } from '../util/format.ts';
import { categoryOf, type CategoryKey } from './categories.ts';
import type { Cluster, Risk, VerdictKind } from './types.ts';

/**
 * KUME LISTESI MOTORU (liste sorgu motoru).
 *
 * "Hangi kume listede" sorusunun tek sahibi. Arama, karar filtresi,
 * kategori filtresi, triyaj cipleri ve siralama burada yapilir; arayuz
 * yalnizca sonucu gosterir.
 *
 * Bu modul SAF TypeScript'tir: node builtin importu YOKTUR. Boylece hem
 * Node (CLI/TUI) hem tarayici (web) ayni dosyayi paylasabilir.
 *
 * Kurallar:
 *   - HICBIR sey silmez, hedef uretmez; yalnizca listeler.
 *   - Karar (verdict) motorun verdigi veridir; burada yeniden yorumlanmaz.
 *   - Filtreler AND (kesim) mantigiyla birlesir.
 */

export type SortMode = 'size' | 'risk' | 'recent' | 'name';

/** Karar filtresi; 'git' = tracked isareti olanlar (Git farkindaligi). */
export type KindFilter = 'all' | VerdictKind | 'git';

/** Triyaj cipleri: buyuk / riskli / zombi. */
export interface TriageFilters {
  big: boolean;
  risky: boolean;
  zombie: boolean;
}

export interface QueryCriteria {
  /** Arama metni: baslik / kume anahtari / "ne ise yarar" / parca yolu. */
  text?: string;
  /** Karar filtresi. */
  kind?: KindFilter;
  /** Sol sutun kategorisi; 'all' = hepsi. */
  category?: CategoryKey | 'all';
  /** Triyaj cipleri. */
  triage?: TriageFilters;
  /** Siralama. */
  sort?: SortMode;
}

/** Risk siralama: once yuksek risk, en sonda guvenli. */
export const RISK_ORDER: Record<Risk, number> = { high: 0, medium: 1, low: 2, safe: 3 };

/** Risk sirasi (gruplama icin): yuksekten guvenliye. */
export const RISK_SEQUENCE: Risk[] = ['high', 'medium', 'low', 'safe'];

/** Triyaj esikleri: "buyuk" = 1 GB uzeri kurtarilabilir, "zombi" = 30 gunden eski. */
export const TRIAGE_BIG_BYTES = 1024 * 1024 * 1024;
export const TRIAGE_ZOMBIE_DAYS = 30;

export class ClusterQuery {
  private readonly clusters: Cluster[];

  constructor(clusters: Cluster[]) {
    this.clusters = clusters;
  }

  /** Taranan tum kumeler. */
  get all(): Cluster[] {
    return this.clusters;
  }

  /** Anahtardan tek kume (yoksa null). Baglam paneli bunu kullanir. */
  byKey(key: string | null | undefined): Cluster | null {
    if (!key) return null;
    return this.clusters.find((c) => c.key === key) ?? null;
  }

  /** Arama metni: baslik, anahtar, karar metni veya parca yollarinda arar. */
  static matchesText(c: Cluster, needle: string): boolean {
    return (
      c.title.toLowerCase().includes(needle) ||
      c.key.toLowerCase().includes(needle) ||
      c.verdict.what.toLowerCase().includes(needle) ||
      c.parts.some((p) => p.path.toLowerCase().includes(needle))
    );
  }

  /** Tek bir kume verilen kritere uyuyor mu? */
  matches(c: Cluster, criteria: QueryCriteria): boolean {
    const kind = criteria.kind ?? 'all';
    if (kind === 'git') {
      if (!(c.evidence.markers ?? []).includes('git-tracked')) return false;
    } else if (kind !== 'all' && c.verdict.kind !== kind) {
      return false;
    }

    const category = criteria.category ?? 'all';
    if (category !== 'all' && categoryOf(c) !== category) return false;

    const triage = criteria.triage;
    if (triage) {
      if (triage.big && c.reclaimableBytes < TRIAGE_BIG_BYTES) return false;
      if (triage.risky && c.verdict.risk !== 'medium' && c.verdict.risk !== 'high') {
        return false;
      }
      if (triage.zombie && daysSince(c.lastTouched) < TRIAGE_ZOMBIE_DAYS) return false;
    }

    const text = (criteria.text ?? '').trim().toLowerCase();
    if (text && !ClusterQuery.matchesText(c, text)) return false;

    return true;
  }

  /**
   * Kumeleri filtrele ve sirala.
   *
   * Filtreler AND mantigiyla birlesir; siralama varsayilan olarak
   * kurtarilabilir boyuta gore azalan olur.
   */
  filter(criteria: QueryCriteria): Cluster[] {
    const out = this.clusters.filter((c) => this.matches(c, criteria));
    const mode = criteria.sort ?? 'size';
    return out.sort((a, b) => ClusterQuery.compare(a, b, mode));
  }

  /** Yalniz arama (diger filtreler uygulanmaz). */
  search(text: string): Cluster[] {
    const needle = text.trim().toLowerCase();
    if (!needle) return [...this.clusters];
    return this.clusters.filter((c) => ClusterQuery.matchesText(c, needle));
  }

  /** Siralama: boyut, risk, son hareket veya ad. */
  sort(mode: SortMode): Cluster[] {
    return [...this.clusters].sort((a, b) => ClusterQuery.compare(a, b, mode));
  }

  /** Liste siralamasi: boyut, risk, son hareket veya ad. */
  static compare(a: Cluster, b: Cluster, mode: SortMode): number {
    switch (mode) {
      case 'risk': {
        const d = RISK_ORDER[a.verdict.risk] - RISK_ORDER[b.verdict.risk];
        return d !== 0 ? d : b.reclaimableBytes - a.reclaimableBytes;
      }
      case 'recent':
        return b.lastTouched - a.lastTouched;
      case 'name':
        return a.title.localeCompare(b.title);
      case 'size':
      default:
        return b.reclaimableBytes - a.reclaimableBytes;
    }
  }
}
