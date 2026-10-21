import { randomBytes } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import {
  analyzeProject,
  planProjectCleanup,
  restoreProjects,
  type ProjectArtifact,
  type ProjectCleanupMode,
  type ProjectPlan,
  type ProjectRecipe,
  type RestoreResult,
} from '../core/project-deps.ts';
import { discoverProjects, type ProjectDiscoveryOptions } from '../core/project-discovery.ts';
import type { ProjectDiscoverResponse } from '../core/contract.ts';
import { ServiceError } from './errors.ts';

/**
 * Proje bagimlilik servisi.
 *
 * Analiz SALT OKUNUR. `restore` yalnizca sunucuda saklanan planin
 * tariflerini calistirir; istemci komut/yol gonderemez.
 */

const PLAN_TTL_MS = 15 * 60_000;
export const PROJECT_RESTORE_PHRASE = 'KUR';

interface StoredProjectPlan {
  plan: ProjectPlan;
  recipes: ProjectRecipe[];
  expiresAt: number;
}

export interface ProjectAnalysisResponse {
  root: string;
  artifacts: ProjectArtifact[];
  plan: ProjectPlan;
}

export interface ProjectPlanResponse extends ProjectAnalysisResponse {
  planId: string;
  requiresPhrase: typeof PROJECT_RESTORE_PHRASE;
  expiresAt: number;
}

export interface ProjectRestoreResponse {
  ok: boolean;
  results: RestoreResult[];
}

export class ProjectService {
  private readonly plans = new Map<string, StoredProjectPlan>();

  /**
   * Kokler altinda proje depolarini bulur. SALT OKUNUR; hicbir hedef
   * uretmez. Gecersiz/yok kokler sessizce elenir, en fazla 5 kok.
   */
  async discover(
    roots: string[],
    opts: ProjectDiscoveryOptions = {},
  ): Promise<ProjectDiscoverResponse> {
    const clean: string[] = [];
    for (const raw of roots.slice(0, 5)) {
      if (typeof raw !== 'string' || raw.trim().length === 0) continue;
      const abs = resolve(raw.trim());
      if (!isAbsolute(abs)) continue;
      const s = await stat(abs).catch(() => null);
      if (s?.isDirectory()) clean.push(abs);
    }
    if (clean.length === 0) {
      throw new ServiceError(400, 'Gecerli bir kok dizin gerekli');
    }
    return discoverProjects(clean, opts);
  }

  async analyze(dir: string): Promise<ProjectAnalysisResponse> {
    const root = resolve(dir);
    const artifacts = await analyzeProject(root);
    const plan = planProjectCleanup(artifacts, 'recipe');
    return { root, artifacts, plan };
  }

  async plan(dir: string, mode: ProjectCleanupMode): Promise<ProjectPlanResponse> {
    const a = await this.analyze(dir);
    const plan = planProjectCleanup(a.artifacts, mode);
    const planId = randomBytes(8).toString('hex');
    const expiresAt = Date.now() + PLAN_TTL_MS;
    this.plans.set(planId, {
      plan,
      recipes: plan.projects.map((p) => p.recipe),
      expiresAt,
    });
    return {
      ...a,
      plan,
      planId,
      requiresPhrase: PROJECT_RESTORE_PHRASE,
      expiresAt,
    };
  }

  async restore(planId: string, phrase: string): Promise<ProjectRestoreResponse> {
    if (phrase.trim().toLocaleUpperCase('tr-TR') !== PROJECT_RESTORE_PHRASE) {
      throw new ServiceError(400, `Onay ifadesi hatali (${PROJECT_RESTORE_PHRASE})`);
    }
    const stored = this.plans.get(planId);
    if (!stored) throw new ServiceError(404, 'Proje plani bulunamadi veya kullanildi');
    if (Date.now() > stored.expiresAt) {
      this.plans.delete(planId);
      throw new ServiceError(410, 'Proje planinin suresi doldu');
    }
    // Plan tek kullanimlik.
    this.plans.delete(planId);
    const results = await restoreProjects(stored.recipes);
    return { ok: results.every((r) => r.ok), results };
  }
}
