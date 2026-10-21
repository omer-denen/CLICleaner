import { ScanSummary } from './scan-summary.ts';
import { DefaultSelection } from './selection.ts';
import { categoryOf } from './categories.ts';
import type {
  DashboardCardView,
  DashboardLedgerView,
  DashboardResponse,
  DashboardSafeWinView,
  DashboardScanView,
  DashboardTotalsView,
} from './contract.ts';
import type { Cluster } from './types.ts';

/**
 * BASLANGIC OZETI (dashboard) — KARAR MOTORU.
 *
 * Korunan/geri kazanilabilir toplamlar, risk kartlari ve "guvenli
 * kazanimlar" burada hesaplanir. Arayuz yalnizca kimlikleri metne
 * cevirir ve baytlari bicimlendirir; HICBIR hesap yapmaz.
 *
 * Kural: agir tarama TETIKLENMEZ. Girdi, servis katmaninin onbellekten
 * topladigi gerceklerdir (`DashboardFacts`).
 *
 * Bu modul SAF TypeScript'tir: node builtin importu YOKTUR.
 */

export interface DashboardFacts {
  now: number;
  scan: {
    state: 'never' | 'current' | 'stale' | 'scanning';
    at: number | null;
    ageMs: number | null;
    scanning: boolean;
    clusters: Cluster[];
  };
  /** Disk + CLI bulgu toplamlari (envanter onbellegi varsa). */
  inventory: {
    diskBytes: number;
    diskCount: number;
    cliBytes: number;
    cliCount: number;
    brokenInstalls: number;
  } | null;
  env: {
    pathIssues: number;
    orphanVars: number;
    shadowedCommands: number;
  } | null;
  graph: {
    broken: number;
    critical: number;
    shadowed: number;
  } | null;
  recover: { interrupted: number };
  vault: { entries: number; bytes: number; expired: number };
  schedules: { rules: number; due: number; missed: number };
}

/** Ayni anda gosterilecek "guvenli kazanim" sayisi. */
const SAFE_WIN_LIMIT = 5;

export class DashboardSummary {
  private readonly facts: DashboardFacts;

  constructor(facts: DashboardFacts) {
    this.facts = facts;
  }

  private summary(): ScanSummary {
    return new ScanSummary(this.facts.scan.clusters);
  }

  scan(): DashboardScanView {
    const s = this.summary();
    return {
      state: this.facts.scan.state,
      at: this.facts.scan.at,
      ageMs: this.facts.scan.ageMs,
      scanning: this.facts.scan.scanning,
      clusters: this.facts.scan.clusters.length,
      files: s.fileCount(),
    };
  }

  /**
   * Iki defterin bakiyesi.
   *
   * `protected` = taranan toplam - geri kazanilabilir. Bu sayi "sizin
   * veriniz" iddiasidir; proje artefaktlari da buradadir.
   */
  ledgers(): DashboardLedgerView[] {
    const totals = this.summary().totals();
    const inv = this.facts.inventory;
    return [
      {
        id: 'protected',
        bytes: Math.max(0, totals.totalBytes - totals.reclaimableBytes),
      },
      { id: 'reclaimable', bytes: totals.reclaimableBytes },
      { id: 'vault', bytes: this.facts.vault.bytes },
      { id: 'cli', bytes: inv?.cliBytes ?? 0 },
    ];
  }

  /**
   * Risk kartlari. Sira kararlidir: once tarama tazeligi, sonra para
   * kaybettiren riskler, en son bilgi kartlari.
   */
  cards(): DashboardCardView[] {
    const out: DashboardCardView[] = [];
    const { scan, env, graph, recover, vault, schedules, inventory } = this.facts;

    if (scan.state === 'never') {
      out.push({ id: 'scan-missing', tone: 'info', count: 0, target: 'disk' });
    } else if (scan.state === 'stale') {
      out.push({ id: 'scan-stale', tone: 'warn', count: 0, target: 'disk' });
    }

    if (inventory && inventory.brokenInstalls > 0) {
      out.push({
        id: 'broken-installs',
        tone: 'danger',
        count: inventory.brokenInstalls,
        target: 'tools',
      });
    }

    if (graph && graph.broken > 0) {
      out.push({
        id: 'broken-dependencies',
        tone: 'danger',
        count: graph.broken,
        target: 'graph',
      });
    }

    if (env && env.pathIssues > 0) {
      out.push({ id: 'path-issues', tone: 'warn', count: env.pathIssues, target: 'env' });
    }

    if (env && env.shadowedCommands > 0) {
      out.push({
        id: 'shadowed-commands',
        tone: 'warn',
        count: env.shadowedCommands,
        target: 'env',
      });
    }

    if (env && env.orphanVars > 0) {
      out.push({ id: 'orphan-vars', tone: 'info', count: env.orphanVars, target: 'env' });
    }

    if (recover.interrupted > 0) {
      out.push({ id: 'interrupted', tone: 'danger', count: recover.interrupted, target: 'recover' });
    }

    if (vault.expired > 0) {
      out.push({ id: 'vault-expired', tone: 'info', count: vault.expired, target: 'vault' });
    }

    if (schedules.missed > 0) {
      out.push({
        id: 'schedule-missed',
        tone: 'warn',
        count: schedules.missed,
        target: 'schedules',
      });
    }

    if (schedules.due > 0) {
      out.push({ id: 'schedule-due', tone: 'info', count: schedules.due, target: 'schedules' });
    }

    return out;
  }

  /**
   * Varsayilan secim kuralini (T34) gecen kumeler.
   *
   * Kural TEK yerde: `DefaultSelection`. Arayuz kendi "guvenli" listesini
   * uretemez. "Neden" metni yerine kategori + yeniden uretilebilirlik +
   * guven kimligi doner; ceviri arayuzdedir.
   */
  safeWins(limit = SAFE_WIN_LIMIT): DashboardSafeWinView[] {
    const out: DashboardSafeWinView[] = [];
    for (const c of this.facts.scan.clusters) {
      if (!DefaultSelection.selected(c)) continue;
      out.push({
        clusterKey: c.key,
        category: categoryOf(c),
        bytes: c.reclaimableBytes,
        regenerability: c.verdict.regenerability,
        confidence: c.verdict.confidence,
      });
    }
    out.sort((a, b) => b.bytes - a.bytes);
    return out.slice(0, limit);
  }

  totals(): DashboardTotalsView {
    const s = this.summary();
    return {
      clusters: s.all.length,
      files: s.fileCount(),
      verdicts: s.verdictCounts(),
    };
  }

  view(): DashboardResponse {
    return {
      generatedAt: this.facts.now,
      scan: this.scan(),
      ledgers: this.ledgers(),
      cards: this.cards(),
      safeWins: this.safeWins(),
      totals: this.totals(),
    };
  }
}
