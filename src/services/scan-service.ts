import { runScan } from '../commands/scan.ts';
import {
  loadScanCache,
  loadScanDirtyAt,
  markScanDirty,
  saveScanCache,
  SCAN_CACHE_TTL_MS,
} from '../web/scan-store.ts';
import {
  MAX_CACHE_HOURS,
  MIN_CACHE_HOURS,
  loadSettings,
  saveSettings,
} from '../web/settings-store.ts';
import { debug, info } from '../util/log.ts';
import { ServiceError, describeError } from './errors.ts';
import { newId } from './ids.ts';
import type { Cluster, Env, ScanResult } from '../core/types.ts';
import type {
  ScanStatusResponse,
  ScanStreamEvent,
  SettingsResponse,
} from '../web/contract.ts';

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
  /** SSE yeniden baglanma: olay kimligi + son N olay (Last-Event-ID). */
  events: Array<{ id: number; event: ScanStreamEvent }>;
  nextEventId: number;
  result?: ScanResult;
  error?: string;
  startedAt: number;
}

export type ScanEmit = (jobId: string, event: ScanStreamEvent, id?: number) => void;

export interface ScanArgs {
  envs: Env[];
  profile?: string;
  exclude: string[];
  minAgeDays: number;
  root?: string;
}

export class ScanService {
  private readonly scans = new Map<string, ScanJob>();
  private readonly controllers = new Map<string, AbortController>();
  private active: ScanJob | null = null;
  private lastScan: { scan: ScanResult; at: number } | null = null;
  private cacheLoaded = false;
  private ttlMs = SCAN_CACHE_TTL_MS;
  private dirtyAt = 0;
  private settingsLoaded = false;
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
      events: [],
      nextEventId: 0,
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
    // Suresi dolmus sonuc da yuklenir: kullaniciya "eski" olarak
    // gosterilebilir; yeniden tarama ENGELLENMEZ.
    const [cached, dirtyAt] = await Promise.all([
      loadScanCache(Date.now(), Number.POSITIVE_INFINITY),
      loadScanDirtyAt(),
    ]);
    this.dirtyAt = Math.max(this.dirtyAt, dirtyAt);
    if (cached) {
      this.lastScan = cached;
      info('tarama onbellegi yuklendi', {
        at: new Date(cached.at).toISOString(),
        kume: cached.scan.clusters.length,
      });
    } else {
      debug('tarama onbellegi yok');
    }
  }

  /** Ayarlari (onbellek suresi) bir kez yukler. */
  async ensureSettingsLoaded(): Promise<void> {
    if (this.settingsLoaded) return;
    this.settingsLoaded = true;
    const s = await loadSettings();
    this.ttlMs = Math.max(MIN_CACHE_HOURS, s.scanCacheHours) * 3_600_000;
  }

  /** Tarama durumu: never / current / stale / scanning. */
  async status(): Promise<ScanStatusResponse> {
    await Promise.all([this.ensureCacheLoaded(), this.ensureSettingsLoaded()]);
    // CLI temizligi ayri surecte dirty.json yazar; her durum sorgusunda
    // diskteki isaret okunur (ucuz tek dosya).
    this.dirtyAt = Math.max(this.dirtyAt, await loadScanDirtyAt());
    const at = this.lastScan?.at ?? null;
    const ageMs = at !== null ? Math.max(0, Date.now() - at) : null;
    const dirty = at !== null && this.dirtyAt > at;
    const expired = ageMs !== null && ageMs > this.ttlMs;
    const state = this.active
      ? 'scanning'
      : at === null
        ? 'never'
        : dirty || expired
          ? 'stale'
          : 'current';
    return {
      state,
      lastScanAt: at,
      ageMs,
      ttlMs: this.ttlMs,
      nextRecommendedAt: at !== null ? at + this.ttlMs : null,
      dirty,
      scanning: !!this.active,
      clusters: this.lastScan?.scan.clusters.length ?? null,
    };
  }

  async settings(): Promise<SettingsResponse> {
    await this.ensureSettingsLoaded();
    return {
      scanCacheHours: Math.round(this.ttlMs / 3_600_000),
      minCacheHours: MIN_CACHE_HOURS,
      maxCacheHours: MAX_CACHE_HOURS,
    };
  }

  async updateSettings(patch: { scanCacheHours?: number }): Promise<SettingsResponse> {
    const saved = await saveSettings(patch);
    this.ttlMs = saved.scanCacheHours * 3_600_000;
    this.settingsLoaded = true;
    info('ayarlar guncellendi', { scanCacheHours: saved.scanCacheHours });
    return this.settings();
  }

  /** Disk degisti (silme vb.): sonucu eski isaretle. */
  async markDirty(): Promise<void> {
    this.dirtyAt = Date.now();
    if (this.persistScan) await markScanDirty(this.dirtyAt);
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

  /**
   * Olayi artan kimlikle yayinlar ve son 2000 olayi tutar. Yeniden
   * baglanan istemci `Last-Event-ID` gonderirse buradan tekrar oynatilir.
   */
  private pushEvent(job: ScanJob, event: ScanStreamEvent): void {
    const id = ++job.nextEventId;
    job.events.push({ id, event });
    if (job.events.length > 2000) job.events.splice(0, job.events.length - 2000);
    this.emit(job.id, event, id);
  }

  private async runJob(job: ScanJob, controller: AbortController, args: ScanArgs): Promise<void> {
    try {
      const result = await runScan({
        envs: args.envs,
        profile: args.profile,
        minAgeDays: args.minAgeDays,
        root: args.root,
        json: true,
        includeBytes: true,
        exclude: args.exclude,
        quiet: true,
        signal: controller.signal,
        onProgress: (done, total, bytes) => {
          job.progress = { done, total, bytes };
          this.pushEvent(job, { type: 'progress', done, total, bytes });
        },
        onTargets: (paths) => {
          job.targets = paths;
          this.pushEvent(job, { type: 'targets', paths });
        },
        onTargetStart: (path, done, total) => {
          this.pushEvent(job, { type: 'target-start', path, done, total });
        },
        onTargetDone: (path, done, total, cluster) => {
          if (cluster) job.found.push(cluster);
          this.pushEvent(job, { type: 'target-done', path, done, total, cluster });
        },
      });

      if (controller.signal.aborted) {
        job.status = 'cancelled';
        info('tarama iptal edildi', {
          scanId: job.id,
          ilerleme: `${job.progress.done}/${job.progress.total}`,
          kume: result.clusters.length,
        });
        this.pushEvent(job, { type: 'cancelled' });
        return;
      }

      job.status = 'done';
      job.result = result;
      this.cacheLoaded = true;
      // Proje ici (--root) tarama SISTEM onbellegini temsil etmez:
      // ne son tarama olarak saklanir ne de 24 saatlik diske yazilir.
      // Aksi halde 27 kumelik kismi bir proje taramasi "son tam
      // tarama" gibi gorunurdu.
      if (!args.root) {
        this.lastScan = { scan: result, at: Date.now() };
        // Sonraki sunucu baslangicinda / sayfa yenilemesinde kullanilir.
        // Testler kismi taramalari onbellege yazmasin (persistScan: false).
        if (this.persistScan) await saveScanCache(result);
      }
      this.pushEvent(job, { type: 'done', result });
    } catch (err) {
      if (controller.signal.aborted) {
        job.status = 'cancelled';
        this.pushEvent(job, { type: 'cancelled' });
      } else {
        job.status = 'error';
        job.error = describeError(err);
        this.pushEvent(job, { type: 'error', message: job.error });
      }
    } finally {
      this.active = null;
      this.controllers.delete(job.id);
    }
  }
}
