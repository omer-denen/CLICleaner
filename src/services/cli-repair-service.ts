import {
  executeCliRepairs,
  planCliRepairs,
  type CliRepairPlan,
} from '../actions/cli-repair.ts';
import { info } from '../util/log.ts';
import { ServiceError } from './errors.ts';
import type { CliInventoryService } from './cli-inventory-service.ts';
import type {
  CliRepairExecuteResponse,
  CliRepairItemView,
  CliRepairPlanResponse,
} from '../web/contract.ts';

/**
 * Bozuk / yarim kurulum onarim servisi.
 *
 * Plan 10 dakika yasar; onay metni `ONAR`. Onarimdan sonra envanterdeki
 * saglik bilgisi gecersizdir.
 */

export class CliRepairService {
  private readonly plans = new Map<string, { plan: CliRepairPlan; expiresAt: number }>();
  private readonly inventory: CliInventoryService;

  constructor(inventory: CliInventoryService) {
    this.inventory = inventory;
  }

  async plan(ids: string[]): Promise<CliRepairPlanResponse> {
    if (ids.length === 0) throw new ServiceError(400, 'Arac secilmedi');

    const inv = await this.inventory.ensure();
    const wanted = new Set(ids.map((x) => x.toLowerCase()));
    const selected = inv.tools.filter((t) => wanted.has(t.id.toLowerCase()) && t.repair);
    if (selected.length === 0) {
      throw new ServiceError(400, 'Onarilabilir arac bulunamadi (standalone elle onarilir)');
    }

    const plan = planCliRepairs(selected);
    this.plans.set(plan.id, { plan, expiresAt: plan.expiresAt });

    const items: CliRepairItemView[] = plan.items.map((it) => ({
      id: it.tool.id,
      command: it.tool.command,
      packageName: it.tool.packageName,
      version: it.tool.version,
      repairCommand: it.tool.repair?.display ?? '',
    }));

    info('cli onarim plani olusturuldu', { planId: plan.id, araclar: items.length });
    return {
      planId: plan.id,
      items,
      requiresPhrase: true,
      expiresAt: plan.expiresAt,
    };
  }

  async execute(planId: string, phrase: string): Promise<CliRepairExecuteResponse> {
    const stored = this.plans.get(planId);
    if (!stored) {
      throw new ServiceError(404, 'Onarim plani bulunamadi veya zaten kullanildi');
    }
    if (Date.now() > stored.expiresAt) {
      this.plans.delete(planId);
      throw new ServiceError(410, 'Onarim plani suresi doldu; yeniden planlayin');
    }
    if (phrase !== 'ONAR') {
      throw new ServiceError(400, 'Onay metni hatali ("ONAR" bekleniyordu)');
    }

    this.plans.delete(planId);
    info('cli onarimi basladi', { planId, araclar: stored.plan.items.length });
    const results = await executeCliRepairs(stored.plan);
    // Envanterdeki saglik bilgisi artik eski; sonraki tarama yeniler.
    this.inventory.setLast(null);

    info('cli onarimi bitti', {
      planId,
      basarili: results.filter((r) => r.ok).length,
      hatali: results.filter((r) => !r.ok).length,
    });

    return {
      results: results.map((r) => ({
        command: r.command,
        ok: r.ok,
        output: r.output,
        ...(r.error ? { error: r.error } : {}),
        verified: r.verified,
      })),
    };
  }
}
