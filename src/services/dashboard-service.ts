import { DashboardSummary, type DashboardFacts } from '../core/dashboard-summary.ts';
import { diskFindings } from '../core/findings.ts';
import { interruptedOperations } from '../core/operation-journal.ts';
import { expiredVaultEntries, listVaultEntries } from '../actions/vault.ts';
import type { DashboardResponse } from '../core/contract.ts';
import type { ScanService } from './scan-service.ts';
import type { EnvService } from './env-service.ts';
import type { GraphService } from './graph-service.ts';
import type { ScheduleService } from './schedule-service.ts';
import type { CliInventoryService } from './cli-inventory-service.ts';

/**
 * Baslangic ozeti servisi.
 *
 * Karar VERMEZ: gercekleri toplar, `DashboardSummary`'ye verir.
 * ONEMLI: agir tarama tetiklemez. Tarama onbellegi, envanter onbellegi
 * ve ucuz disk okumalari kullanilir; envanter yoksa graf kartlari gizlenir.
 */

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

export class DashboardService {
  private readonly scan: ScanService;
  private readonly env: EnvService;
  private readonly graph: GraphService;
  private readonly schedules: ScheduleService;
  private readonly inventory: CliInventoryService;

  constructor(
    scan: ScanService,
    env: EnvService,
    graph: GraphService,
    schedules: ScheduleService,
    inventory: CliInventoryService,
  ) {
    this.scan = scan;
    this.env = env;
    this.graph = graph;
    this.schedules = schedules;
    this.inventory = inventory;
  }

  async view(): Promise<DashboardResponse> {
    const status = await this.scan.status();
    const clusters = this.scan.last()?.scan.clusters ?? [];
    const findings = diskFindings(clusters);

    let diskBytes = 0;
    for (const f of findings) diskBytes += f.bytes;

    const inv = this.inventory.getLast();
    let cliBytes = 0;
    let cliCount = 0;
    let brokenInstalls = 0;
    if (inv) {
      for (const t of inv.tools) {
        cliBytes += t.totalBytes;
        cliCount++;
        if (t.health === 'broken') brokenInstalls++;
      }
    }

    const [env, graph, vault, schedules, interrupted, settings] = await Promise.all([
      safe(() => this.env.analyze()),
      safe(() => this.graph.viewCached()),
      safe(() => listVaultEntries()),
      safe(() => this.schedules.list()),
      safe(() => interruptedOperations()),
      safe(() => this.scan.settings()),
    ]);

    const retentionDays = settings?.vaultRetentionDays ?? 30;
    const expired = vault ? await safe(() => expiredVaultEntries(retentionDays)) : null;

    const pathIssues =
      env?.findings.filter(
        (f) => f.kind === 'missing-path' || f.kind === 'duplicate-path',
      ).length ?? 0;
    const orphanVars = env?.findings.filter((f) => f.kind === 'orphan-variable').length ?? 0;

    const facts: DashboardFacts = {
      now: Date.now(),
      scan: {
        state: status.state,
        at: status.lastScanAt,
        ageMs: status.ageMs,
        scanning: status.scanning,
        clusters,
      },
      inventory: {
        diskBytes,
        diskCount: findings.length,
        cliBytes,
        cliCount,
        brokenInstalls,
      },
      env: env
        ? {
            pathIssues,
            orphanVars,
            shadowedCommands: env.commandShadows.length,
          }
        : null,
      graph: graph
        ? {
            broken: graph.summary.broken,
            critical: graph.summary.critical,
            shadowed: graph.summary.shadowed,
          }
        : null,
      recover: { interrupted: interrupted?.length ?? 0 },
      vault: {
        entries: vault?.length ?? 0,
        bytes: (vault ?? []).reduce((sum, e) => sum + e.bytes, 0),
        expired: expired?.length ?? 0,
      },
      schedules: {
        rules: schedules?.length ?? 0,
        due: (schedules ?? []).filter((s) => s.due).length,
        missed: (schedules ?? []).reduce((sum, s) => sum + s.missed, 0),
      },
    };

    return new DashboardSummary(facts).view();
  }
}
