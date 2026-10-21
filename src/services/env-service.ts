import { randomBytes } from 'node:crypto';
import { ApprovalRules } from '../core/approval.ts';
import {
  analyzeEnvironment,
  applyEnvPlan,
  planPathCleanup,
  readEnvironmentSnapshot,
  redactEnvironmentAnalysis,
  type EnvAnalysis,
  type EnvApplyResult,
  type EnvPlan,
  type PathCleanupOptions,
} from '../core/env-engine.ts';
import type { EnvPlanResponse } from '../core/contract.ts';
import { ServiceError } from './errors.ts';

/**
 * Ortam degiskeni servisi.
 *
 * Planlar sunucuda saklanir; istemci YALNIZCA plan kimligi ve onay
 * ifadesi gonderir. Boylece "keyfi kayit defteri degeri yaz" ucu yoktur.
 */

const PLAN_TTL_MS = 10 * 60_000;

interface StoredEnvPlan {
  plan: EnvPlan;
  expiresAt: number;
}

export class EnvService {
  private readonly plans = new Map<string, StoredEnvPlan>();

  async analyze(): Promise<EnvAnalysis> {
    return redactEnvironmentAnalysis(analyzeEnvironment(await readEnvironmentSnapshot()));
  }

  async plan(opts: PathCleanupOptions): Promise<EnvPlanResponse> {
    const raw = analyzeEnvironment(await readEnvironmentSnapshot());
    const plan = planPathCleanup(raw, opts);
    const analysis = redactEnvironmentAnalysis(raw);
    const planId = randomBytes(8).toString('hex');
    const expiresAt = Date.now() + PLAN_TTL_MS;
    this.plans.set(planId, { plan, expiresAt });
    return {
      planId,
      plan,
      findings: analysis.findings,
      expiresAt,
      phrase: ApprovalRules.phrase('envClean'),
      approvalKind: 'envClean',
    };
  }

  async apply(planId: string, phrase: string): Promise<EnvApplyResult> {
    const stored = this.plans.get(planId);
    if (!stored) throw new ServiceError(404, 'Ortam plani bulunamadi veya kullanildi');
    if (Date.now() > stored.expiresAt) {
      this.plans.delete(planId);
      throw new ServiceError(410, 'Ortam planinin suresi doldu');
    }
    const result = await applyEnvPlan(stored.plan, { phrase, reason: 'api' });
    if (result.ok) this.plans.delete(planId);
    return result;
  }
}
