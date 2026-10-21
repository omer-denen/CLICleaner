import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  buildPlan,
  closeRecycle,
  deleteTarget,
  Journal,
  type DeletePlan,
  type DeleteResult,
} from '../actions/delete.ts';
import { longPath } from '../util/longpath.ts';
import { ApprovalRules } from '../core/approval.ts';
import { newId } from './ids.ts';
import { ServiceError, describeError } from './errors.ts';
import type { ScanResult } from '../core/types.ts';
import { dataDir } from '../core/data-dir.ts';
import type {
  ExecuteEvent,
  ExecuteStartResponse,
  PlanResponse,
  PlanView,
} from '../core/contract.ts';

/**
 * Disk silme servisi: plan uretimi, 10 dakikalik TTL ve yurutme isleri.
 *
 * HTTP/SSE bilgisi YOKTUR; ilerleme `emit` ile disari verilir.
 */

export interface ExecuteJob {
  id: string;
  status: 'running' | 'done' | 'error';
  last: ExecuteEvent | null;
  startedAt: number;
}

interface StoredPlan {
  planId: string;
  plan: DeletePlan;
  createdAt: number;
  expiresAt: number;
  requiresPhrase: boolean;
  requiresHighAck: boolean;
}

export type DeleteEmit = (jobId: string, event: ExecuteEvent) => void;

const PLAN_TTL_MS = 10 * 60_000;

export class DeleteService {
  private readonly plans = new Map<string, StoredPlan>();
  private readonly jobs = new Map<string, ExecuteJob>();
  private readonly emit: DeleteEmit;

  constructor(emit: DeleteEmit) {
    this.emit = emit;
  }

  createPlan(scan: ScanResult | null, keys: string[], mode: 'recycle' | 'purge'): PlanResponse {
    if (!scan) throw new ServiceError(400, 'Once tarama yapilmali');
    if (keys.length === 0) throw new ServiceError(400, 'Kume secilmedi');

    const selected = scan.clusters.filter((c) => keys.includes(c.key));
    if (selected.length === 0) throw new ServiceError(400, 'Secilen kumeler bulunamadi');

    let plan: DeletePlan;
    try {
      plan = buildPlan(selected, mode);
    } catch (err) {
      // Guvenlik kapisi burada hata firlatir; plana hicbir zaman girmez.
      throw new ServiceError(400, describeError(err));
    }
    if (plan.targets.length === 0) {
      throw new ServiceError(400, 'Secilen kumeler icin silinecek yol yok');
    }

    const planId = newId();
    const expiresAt = Date.now() + PLAN_TTL_MS;
    const risks = plan.clusters.map((c) => c.risk);
    const requiresPhrase = ApprovalRules.requiresPhrase(risks);
    const requiresHighAck = ApprovalRules.requiresHighAck(risks);
    this.plans.set(planId, {
      planId,
      plan,
      createdAt: Date.now(),
      expiresAt,
      requiresPhrase,
      requiresHighAck,
    });

    const view: PlanView = {
      mode: plan.mode,
      clusters: plan.clusters,
      targets: plan.targets,
      totalBytes: plan.totalBytes,
    };
    return { planId, plan: view, requiresPhrase, requiresHighAck, expiresAt };
  }

  execute(planId: string, phrase: string | undefined, acknowledgeHigh: boolean): ExecuteStartResponse {
    const stored = this.plans.get(planId);
    if (!stored) throw new ServiceError(404, 'Plan bulunamadi veya zaten kullanildi');
    if (Date.now() > stored.expiresAt) {
      this.plans.delete(stored.planId);
      throw new ServiceError(410, 'Plan suresi doldu; yeniden planlayin');
    }
    if (stored.requiresPhrase && !ApprovalRules.matches('delete', phrase)) {
      throw new ServiceError(
        400,
        `Onay metni hatali ("${ApprovalRules.phrase('delete')}" bekleniyordu)`,
      );
    }
    if (stored.requiresHighAck && acknowledgeHigh !== true) {
      throw new ServiceError(400, 'Yuksek risk onayi eksik');
    }

    // Plan tek kullanimlik: ayni planla ikinci kez silme baslatilamaz.
    this.plans.delete(stored.planId);

    const job: ExecuteJob = {
      id: newId(),
      status: 'running',
      last: null,
      startedAt: Date.now(),
    };
    this.jobs.set(job.id, job);
    void this.runExecuteJob(job, stored);
    return { jobId: job.id };
  }

  getJob(id: string): ExecuteJob | undefined {
    return this.jobs.get(id);
  }

  private async runExecuteJob(job: ExecuteJob, stored: StoredPlan): Promise<void> {
    const plan = stored.plan;
    const journal = new Journal();
    let freed = 0;
    let removed = 0;
    let skipped = 0;
    let failed = 0;

    const emit = (ev: ExecuteEvent) => {
      job.last = ev;
      this.emit(job.id, ev);
    };

    emit({ type: 'start', total: plan.targets.length, bytes: plan.totalBytes, mode: plan.mode });

    try {
      for (let i = 0; i < plan.targets.length; i++) {
        const pt = plan.targets[i]!;
        emit({
          type: 'target-start',
          index: i,
          total: plan.targets.length,
          label: pt.target.label,
          path: pt.target.path,
          bytes: pt.bytes,
        });

        const t0 = Date.now();
        const heartbeat = setInterval(
          () => emit({ type: 'heartbeat', index: i, elapsedMs: Date.now() - t0 }),
          5_000,
        );

        let r: DeleteResult | null = null;
        try {
          r = await deleteTarget(pt.target, plan.mode);
        } catch (err) {
          failed++;
          journal.add({
            at: Date.now(),
            mode: plan.mode,
            action: 'failed',
            path: pt.target.path,
            bytes: 0,
            reason: describeError(err),
          });
          emit({ type: 'target-done', index: i, bytesFreed: 0, removed: 0, skipped: 0, failed: 1 });
        } finally {
          clearInterval(heartbeat);
        }

        if (r) {
          freed += r.bytesFreed;
          removed += r.removed;
          skipped += r.skipped.length;
          failed += r.failed.length;
          for (const s of r.skipped) {
            journal.add({
              at: Date.now(),
              mode: plan.mode,
              action: 'skipped',
              path: s.path,
              bytes: 0,
              reason: s.reason,
            });
          }
          for (const f of r.failed) {
            journal.add({
              at: Date.now(),
              mode: plan.mode,
              action: 'failed',
              path: f.path,
              bytes: 0,
              reason: f.reason,
            });
          }
          if (r.removed > 0) {
            journal.add({
              at: Date.now(),
              mode: plan.mode,
              action: 'deleted',
              path: pt.target.path,
              bytes: r.bytesFreed,
            });
          }
          emit({
            type: 'target-done',
            index: i,
            bytesFreed: r.bytesFreed,
            removed: r.removed,
            skipped: r.skipped.length,
            failed: r.failed.length,
          });
        }
      }

      let journalPath = '';
      if (journal.all().length > 0) {
        try {
          const dir = join(dataDir(), 'journals');
          await mkdir(longPath(dir), { recursive: true });
          journalPath = await journal.save(dir);
        } catch {
          /* gunluk yazilamadi; silme zaten tamamlandi */
        }
      }

      job.status = 'done';
      emit({ type: 'done', freed, removed, skipped, failed, journalPath, mode: plan.mode });
    } catch (err) {
      job.status = 'error';
      emit({ type: 'error', message: describeError(err) });
    } finally {
      closeRecycle();
    }
  }
}
