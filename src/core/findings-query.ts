import type { Finding, FindingSource } from './findings.ts';

/**
 * BIRLESIK BULGU SORGUSU (disk + CLI tek liste).
 *
 * Kaynak filtresi ve ozet toplamlari burada yapilir. Gorunum **salt okunur**:
 * planlar kaynak basina ayridir, birlesik bir uygulama YOKTUR (kullanici
 * karari: iki ayri yazili onay).
 *
 * Sorgu yalnizca iki alana ihtiyac duyar (kaynak + boyut); bu sayede hem
 * cekirdek `Finding` hem web sozlesmesindeki `FindingView` ile calisir.
 *
 * Bu modul SAF TypeScript'tir: node builtin importu YOKTUR.
 */

/** Kaynak filtresi: 'all' = hepsi. */
export type FindingFilter = 'all' | FindingSource;

/** Sorgunun ihtiyac duydugu minimum alan seti. */
export interface FindingLike {
  source: FindingSource;
  bytes: number;
}

export class FindingsQuery<T extends FindingLike = Finding> {
  private readonly findings: T[];

  constructor(findings: T[]) {
    this.findings = findings;
  }

  /** Tum bulgular. */
  get all(): T[] {
    return this.findings;
  }

  /** Bulgu listesini kaynaga gore filtreler. */
  filter(only: FindingFilter): T[] {
    if (only === 'all') return this.findings;
    return this.findings.filter((f) => f.source === only);
  }

  /**
   * Kaynak bazli ozet (ust serit icin).
   *
   * `over` verilirse ozet O listeden alinir; aksi halde tum bulgular
   * kullanilir. (Ust serit, aktif kaynak filtresine gore gosterildigi icin
   * ozet de ayni listeye bakmalidir.)
   */
  totals(over: T[] = this.findings): {
    diskBytes: number;
    cliBytes: number;
    diskCount: number;
    cliCount: number;
  } {
    let diskBytes = 0;
    let cliBytes = 0;
    let diskCount = 0;
    let cliCount = 0;
    for (const f of over) {
      if (f.source === 'disk') {
        diskBytes += f.bytes;
        diskCount++;
      } else {
        cliBytes += f.bytes;
        cliCount++;
      }
    }
    return { diskBytes, cliBytes, diskCount, cliCount };
  }
}
