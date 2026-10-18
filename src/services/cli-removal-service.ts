import {
  executeCliRemoval,
  planCliRemoval,
  reinstallSpec,
  type CliRemovalPlan,
} from '../actions/cli-remove.ts';
import { info } from '../util/log.ts';
import { ServiceError } from './errors.ts';
import type { CliInventoryService } from './cli-inventory-service.ts';
import type { UninstallSpec } from '../core/cli-inventory-types.ts';
import type {
  CliExecuteResponse,
  CliPlanItemView,
  CliPlanResponse,
} from '../web/contract.ts';

/**
 * CLI kaldirma servisi: plan uretimi, 10 dakikalik TTL ve yurutme.
 *
 * Envanter `CliInventoryService`ten alinir; kaldirma sonrasi onbellek
 * gecersiz kilinir. Paket yoneticisinin kendi uninstall komutu kullanilir.
 */

const PLAN_TTL_MS = 10 * 60_000;

export class CliRemovalService {
  private readonly plans = new Map<string, { plan: CliRemovalPlan; expiresAt: number }>();
  private readonly inventory: CliInventoryService;

  constructor(inventory: CliInventoryService) {
    this.inventory = inventory;
  }

  async plan(commands: string[], backup: boolean): Promise<CliPlanResponse> {
    if (commands.length === 0) throw new ServiceError(400, 'Arac secilmedi');

    const inv = await this.inventory.ensure();
    const wanted = new Set(commands.map((c) => c.toLowerCase()));
    // Kimlik verildiyse YALNIZ onu sec. Ayni komutu iki paket
    // saglayabildigi icin komut eslesmesi yanlis kurulumu planlayabilir.
    const byId = inv.tools.filter((t) => wanted.has(t.id.toLowerCase()));
    const selected =
      byId.length > 0 ? byId : inv.tools.filter((t) => wanted.has(t.command.toLowerCase()));
    if (selected.length === 0) {
      throw new ServiceError(400, 'Secilen araclar envanterde yok');
    }

    const removable = selected.filter((t) => t.status !== 'protected');
    if (removable.length === 0) {
      throw new ServiceError(400, 'Korunan araclar kaldirilamaz');
    }

    // Golgede kalan bir paket secildiyse kaldirma sonrasi aktif paketi
    // yeniden baglayacak onarim komutunu plana ekle.
    const repairs = new Map<string, UninstallSpec>();
    for (const d of inv.duplicates) {
      const keep = inv.tools.find((t) => t.id === d.keepId);
      if (!keep) continue;
      const spec = reinstallSpec(keep);
      if (!spec) continue;
      for (const id of d.removeIds) repairs.set(id, spec);
    }

    const plan = await planCliRemoval(removable, backup, repairs);
    const items: CliPlanItemView[] = plan.items.map((it) => ({
      id: it.tool.id,
      command: it.tool.command,
      source: it.tool.source,
      packageName: it.tool.packageName,
      version: it.tool.version,
      installPath: it.tool.installPath,
      shims: it.tool.shims,
      stateDirs: it.tool.stateDirs,
      status: it.tool.status,
      confidence: it.tool.confidence,
      idleDays: it.tool.idleDays,
      evidence: it.tool.evidence,
      uninstallCommand: it.uninstallCommand,
      reinstallCommand: it.reinstallCommand,
      ...(it.repair ? { repairCommand: it.repair.display } : {}),
      manual: it.manual,
      backupPaths: it.backup.items.map((b) => b.path),
      backupBytes: it.backup.totalBytes,
      backupSkipped: it.backup.skipped.map((s) => ({
        path: s.path,
        reason: s.reason ?? 'atlandi',
      })),
    }));

    this.plans.set(plan.id, { plan, expiresAt: plan.expiresAt });
    info('cli kaldirma plani olusturuldu', {
      planId: plan.id,
      araclar: plan.items.length,
      yedekMB: Math.round(plan.backupBytes / 1048576),
      manuel: plan.items.filter((i) => i.manual).length,
    });

    return {
      planId: plan.id,
      items,
      totalBytes: plan.totalBytes,
      backupBytes: plan.backupBytes,
      requiresPhrase: true,
      expiresAt: plan.expiresAt,
    };
  }

  async execute(planId: string, phrase: string): Promise<CliExecuteResponse> {
    const stored = this.plans.get(planId);
    if (!stored) throw new ServiceError(404, 'Plan bulunamadi veya zaten kullanildi');
    if (Date.now() > stored.expiresAt) {
      this.plans.delete(planId);
      throw new ServiceError(410, 'Plan suresi doldu; yeniden planlayin');
    }
    if (phrase !== 'SIL') {
      throw new ServiceError(400, 'Onay metni hatali ("SIL" bekleniyordu)');
    }

    this.plans.delete(planId);
    const results = await executeCliRemoval(stored.plan);
    // Envanter artik eski; bir sonraki planlama yeniden tarar.
    this.inventory.setLast(null);

    return {
      results: results.map((r) => ({
        command: r.command,
        ok: r.ok,
        manual: r.manual,
        output: r.output,
        ...(r.error ? { error: r.error } : {}),
        ...(r.backupDir ? { backupDir: r.backupDir } : {}),
        verified: r.verified,
      })),
    };
  }
}
