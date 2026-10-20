import {
  executeCliQuarantine,
  planCliQuarantine,
  type QuarantinePlan,
} from '../actions/cli-quarantine.ts';
import { info } from '../util/log.ts';
import { ServiceError } from './errors.ts';
import { newId } from './ids.ts';
import type { CliInventoryService } from './cli-inventory-service.ts';
import type {
  CliQuarantineExecuteResponse,
  CliQuarantineItemView,
  CliQuarantinePlanResponse,
} from '../core/contract.ts';

/**
 * Karantina servisi (web).
 *
 * Yalnizca paket yoneticisi olmayan (standalone) araclar icin: shim'ler
 * kasaya tasinir, durum klasorleri kopyalanir, RESTORE.md uretilir.
 * Plan 10 dakika yasar; onay metni `KARANTINA`.
 */

const PLAN_TTL_MS = 10 * 60_000;

export class CliQuarantineService {
  private readonly plans = new Map<string, { plan: QuarantinePlan; expiresAt: number }>();
  private readonly inventory: CliInventoryService;

  constructor(inventory: CliInventoryService) {
    this.inventory = inventory;
  }

  async plan(ids: string[]): Promise<CliQuarantinePlanResponse> {
    if (ids.length === 0) throw new ServiceError(400, 'Arac secilmedi');

    const inv = await this.inventory.ensure();
    const wanted = new Set(ids.map((x) => x.toLowerCase()));
    const selected = inv.tools.filter(
      (t) => wanted.has(t.id.toLowerCase()) && t.source === 'standalone' && t.shims.length > 0,
    );
    if (selected.length === 0) {
      throw new ServiceError(
        400,
        'Karantinaya alinabilir bagimsiz arac bulunamadi (yalnizca paket yoneticisi olmayan shimler)',
      );
    }

    const plan = await planCliQuarantine(selected);
    if (plan.items.length === 0) throw new ServiceError(400, 'Karantina plani bos');

    const planId = newId();
    const expiresAt = Date.now() + PLAN_TTL_MS;
    this.plans.set(planId, { plan, expiresAt });

    const items: CliQuarantineItemView[] = plan.items.map((it) => ({
      id: it.tool.id,
      command: it.tool.command,
      packageName: it.tool.packageName,
      version: it.tool.version,
      installPath: it.tool.installPath,
      shims: it.shims,
      stateDirs: it.stateDirs,
      status: it.tool.status,
      idleDays: it.tool.idleDays,
      evidence: it.tool.evidence,
      totalBytes: it.totalBytes,
    }));

    info('karantina plani olusturuldu', {
      planId,
      araclar: items.length,
      MB: Math.round(plan.totalBytes / 1048576),
    });
    return {
      planId,
      items,
      totalBytes: plan.totalBytes,
      requiresPhrase: true,
      phrase: 'KARANTINA',
      expiresAt,
    };
  }

  async execute(planId: string, phrase: string): Promise<CliQuarantineExecuteResponse> {
    const stored = this.plans.get(planId);
    if (!stored) throw new ServiceError(404, 'Karantina plani bulunamadi veya zaten kullanildi');
    if (Date.now() > stored.expiresAt) {
      this.plans.delete(planId);
      throw new ServiceError(410, 'Karantina plani suresi doldu; yeniden planlayin');
    }
    if (phrase !== 'KARANTINA') {
      throw new ServiceError(400, 'Onay metni hatali ("KARANTINA" bekleniyordu)');
    }

    this.plans.delete(planId);
    info('karantina basladi', { planId, araclar: stored.plan.items.length });
    const results = await executeCliQuarantine(stored.plan);
    // Envanter degisti; sonraki tarama yeniler.
    this.inventory.setLast(null);

    info('karantina bitti', {
      planId,
      basarili: results.filter((r) => r.ok).length,
      hatali: results.filter((r) => !r.ok).length,
    });

    return {
      results: results.map((r) => ({
        command: r.command,
        ok: r.ok,
        verified: r.verified,
        movedShims: r.movedShims.length,
        copiedState: r.copiedState.length,
        vaultDir: r.vaultDir,
        ...(r.error ? { error: r.error } : {}),
      })),
    };
  }
}
