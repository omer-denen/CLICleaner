import { runScan } from '../commands/scan.ts';
import { loadScanCache, saveScanCache } from '../web/scan-store.ts';
import { debug, info } from '../util/log.ts';
import { ServiceError, describeError } from './errors.ts';
import { newId } from './ids.ts';
import type { Cluster, Env, ScanResult } from '../core/types.ts';
import type { ScanStreamEvent } from '../web/contract.ts';

/**
 * Disk tarama servisi.
 *
 * Durum (is listesi, aktif tarama, 24 saatlik onbellek) burada tutulur.
 * HTTP/SSE bilgisi YOKTUR: olaylar `emit` kancasiyla disari verilir;
 * server bunlari SSE istemcilerine yazar.
 */

export interface ScanJob {
  id: string;
  status: 'running' | 'done' | 'error' | 'cancelled';
  progress: { done: number; total: number; bytes: number };
  /** Taranacak alanlarin tam listesi (sol sutun). */
  targets: string[];
  /** Simdiye kadar siniflandirilan kumeler: gec baglanan istemciye replay. */
  found: Cluster[];
  result?: ScanResult;
  error?: string;
  startedAt: number;
}

export type ScanEmit = (jobId: string, event: ScanStreamEvent) => void;

export interface ScanArgs {
  envs: Env[];
  profile?: string;
  exclude: string[];
  minAgeDays: number;
}

export class ScanService {
  private readonly scans = new Map<string, ScanJob>();
  private readonly controllers = new Map<string, AbortController>();
  private active: ScanJob | null = null;
  private lastScan: { scan: ScanResult; at: number } | null = null;
  private cacheLoaded = false;
  private readonly emit: ScanEmit;
  private readonly persistScan: boolean;

  constructor(emit: ScanEmit, persistScan: boolean) {
    this.emit = emit;
    this.persistScan = persistScan;
  }

  /** Ayni anda tek tarama; suruyorsa 409. */
  start(args: ScanArgs): ScanJob {
    if (this.active) {
      throw new ServiceError(409, 'Tarama zaten suruyor');
    }
    const job: ScanJob = {
      id: newId(),
      status: 'running',
      progress: { done: 0, total: 0, bytes: 0 },
      targets: [],
      found: [],
      startedAt: Date.now(),
    };
    const controller = new AbortController();
    this.scans.set(job.id, job);
    this.controllers.set(job.id, controller);
    this.active = job;

    void this.runJob(job, controller, args);
    return job;
  }

  get(id: string): ScanJob | undefined {
    return this.scans.get(id);
  }

  activeJobId(): string | null {
    return this.active?.id ?? null;
  }

  last(): { scan: ScanResult; at: number } | null {
    return this.lastScan;
  }

  /**
   * Son tarama sonucunu disk onbelleginden BIR KEZ yukler.
   * 24 saatten eskiyse loadScanCache null doner.
   */
  async ensureCacheLoaded(): Promise<void> {
    if (this.cacheLoaded) return;
    this.cacheLoaded = true;
    if (this.lastScan) return;
    const cached = await loadScanCache();
    if (cached) {
      this.lastScan = cached;
      info('tarama onbellegi yuklendi', {
        at: new Date(cached.at).toISOString(),
        kume: cached.scan.clusters.length,
      });
    } else {
      debug('taze tarama onbellegi yok (24 saat)');
    }
  }

  cancel(id: string): void {
    const job = this.scans.get(id);
    if (!job) throw new ServiceError(404, 'Tarama bulunamadi');
    if (job.status !== 'running') throw new ServiceError(409, 'Tarama zaten bitti');
    this.controllers.get(id)?.abort();
    info('tarama iptal istendi', {
      scanId: job.id,
      ilerleme: `${job.progress.done}/${job.progress.total}`,
    });
  }

  private async runJob(job: ScanJob, controller: AbortController, args: ScanArgs): Promise<void> {
    try {
      const result = await runScan({
        envs: args.envs,
        profile: args.profile,
        minAgeDays: args.minAgeDays,
        json: true,
        includeBytes: true,
        exclude: args.exclude,
        quiet: true,
        signal: controller.signal,
        onProgress: (done, total, bytes) => {
          job.progress = { done, total, bytes };
          this.emit(job.id, { type: 'progress', done, total, bytes });
        },
        onTargets: (paths) => {
          job.targets = paths;
          this.emit(job.id, { type: 'targets', paths });
        },
        onTargetStart: (path, done, total) => {
          this.emit(job.id, { type: 'target-start', path, done, total });
        },
        onTargetDone: (path, done, total, cluster) => {
          if (cluster) job.found.push(cluster);
          this.emit(job.id, { type: 'target-done', path, done, total, cluster });
        },
      });

      if (controller.signal.aborted) {
        job.status = 'cancelled';
        info('tarama iptal edildi', {
          scanId: job.id,
          ilerleme: `${job.progress.done}/${job.progress.total}`,
          kume: result.clusters.length,
        });
        this.emit(job.id, { type: 'cancelled' });
        return;
      }

      job.status = 'done';
      job.result = result;
      this.lastScan = { scan: result, at: Date.now() };
      this.cacheLoaded = true;
      // Sonraki sunucu baslangicinda / sayfa yenilemesinde kullanilir.
      // Testler kismi taramalari onbellege yazmasin (persistScan: false).
      if (this.persistScan) await saveScanCache(result);
      this.emit(job.id, { type: 'done', result });
    } catch (err) {
      if (controller.signal.aborted) {
        job.status = 'cancelled';
        this.emit(job.id, { type: 'cancelled' });
      } else {
        job.status = 'error';
        job.error = describeError(err);
        this.emit(job.id, { type: 'error', message: job.error });
      }
    } finally {
      this.active = null;
      this.controllers.delete(job.id);
    }
  }
}
