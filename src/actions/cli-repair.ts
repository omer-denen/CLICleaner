import { randomBytes } from 'node:crypto';
import type { CliTool } from '../core/cli-inventory-types.ts';
import { runProcess } from './cli-remove.ts';

/**
 * Bozuk / yarim kurulum onarimi.
 *
 * Kaldirmadan farkli olarak burada amac kurulumu GERI GETIRMEK:
 * paket yoneticisinin kendi install komutu calistirilir. npm'de
 * --allow-scripts, uv/dotnet/pip'te --force kullanilir. Standalone
 * araclar icin onarim komutu yoktur; yalnizca raporlanir.
 */

export interface CliRepairItem {
  tool: CliTool;
}

export interface CliRepairPlan {
  id: string;
  createdAt: number;
  expiresAt: number;
  items: CliRepairItem[];
}

export interface CliRepairResult {
  command: string;
  ok: boolean;
  output: string;
  error?: string;
  verified: boolean;
}

const PLAN_TTL_MS = 10 * 60_000;
const REPAIR_TIMEOUT_MS = 5 * 60_000;

export function planCliRepairs(tools: CliTool[]): CliRepairPlan {
  const now = Date.now();
  return {
    id: randomBytes(8).toString('hex'),
    createdAt: now,
    expiresAt: now + PLAN_TTL_MS,
    items: tools.filter((t) => t.repair).map((tool) => ({ tool })),
  };
}

export async function executeCliRepairs(plan: CliRepairPlan): Promise<CliRepairResult[]> {
  const out: CliRepairResult[] = [];

  for (const item of plan.items) {
    const spec = item.tool.repair;
    if (!spec) {
      out.push({
        command: item.tool.command,
        ok: false,
        output: 'Onarim komutu yok (standalone arac).',
        verified: false,
      });
      continue;
    }

    const r = await runProcess(spec.program, spec.args, REPAIR_TIMEOUT_MS);
    const output = [r.stdout, r.stderr].filter(Boolean).join('\n').trim();
    out.push({
      command: spec.display,
      ok: r.code === 0,
      output: output || `cikis kodu ${r.code ?? '?'}`,
      ...(r.code !== 0
        ? { error: `cikis kodu ${r.code ?? '?'}${r.timedOut ? ' (zaman asimi)' : ''}` }
        : {}),
      verified: r.code === 0,
    });
  }

  return out;
}
