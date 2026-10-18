import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { runScan } from '../commands/scan.ts';
import {
  buildPlan,
  closeRecycle,
  deleteTarget,
  Journal,
  type DeletePlan,
  type DeleteResult,
} from '../actions/delete.ts';
import { BUILTIN_PROFILES, ENVS } from '../core/discover.ts';
import { scanCliInventory } from '../core/cli-inventory.ts';
import { executeCliRemoval, planCliRemoval, type CliRemovalPlan } from '../actions/cli-remove.ts';
import { loadScanCache, saveScanCache } from './scan-store.ts';
import { longPath } from '../util/longpath.ts';
import { debug, error as logError, info } from '../util/log.ts';
import type { Cluster, Env, ScanResult } from '../core/types.ts';
import type { CliInventory, CliTool } from '../core/cli-inventory-types.ts';
import type {
  CliExecuteRequest,
  CliExecuteResponse,
  CliInventoryCancelResponse,
  CliInventoryRequest,
  CliInventoryStartResponse,
  CliInventoryStreamEvent,
  CliPlanItemView,
  CliPlanRequest,
  CliPlanResponse,
  ExecuteEvent,
  ExecuteRequest,
  ExecuteStartResponse,
  LatestResponse,
  MetaResponse,
  PlanRequest,
  PlanResponse,
  PlanView,
  ScanRequest,
  ScanStartResponse,
  ScanStreamEvent,
} from './contract.ts';

/**
 * CLICleaner yerel web arayuzu.
 *
 * Guvenlik modeli:
 *  - Sunucu YALNIZCA 127.0.0.1 uzerinde dinler; aga acilmaz.
 *  - Her baslatmada rastgele bir token uretilir; API cagrilari bu
 *    token olmadan reddedilir. Boylece ayni makinedeki baska bir
 *    program/tarayici sekmesi araci kullanamaz.
 *  - Istemci YOL gondermez. Yollar sunucudaki tarama sonucundan
 *    gelir; istemci yalnizca kume anahtari secer.
 *  - Silme iki asamalidir: once plan (kimlik), sonra onay. Plan
 *    10 dakika sonra duser. Orta/yuksek risk "SIL" yazili onayi
 *    olmadan yurutulmez.
 *  - Tarayici "Origin" ve "Host" basliklari dogrulanir (DNS
 *    rebinding ve CSRF'e karsi).
 */

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT_DIR = resolve(HERE, '..', '..');
const DIST_DIR = join(ROOT_DIR, 'dist', 'web');
const WEB_INDEX = join(DIST_DIR, 'index.html');

export interface WebOptions {
  envs?: Env[];
  profile?: string;
  exclude?: string[];
  minAgeDays?: number;
  /** 0 = isletim sisteminin bos portu secmesi (onerilen) */
  port?: number;
  host?: string;
  /** Tarayiciyi otomatik ac */
  open?: boolean;
  /**
   * Tarama sonucunu 24 saatlik disk onbellegine yaz (varsayilan true).
   * Testler false verir; kismi tarama kullanicinin onbellegini ezmesin.
   */
  persistScan?: boolean;
}

// ---------------------------------------------------------------------------
// Durum
// ---------------------------------------------------------------------------

interface ScanJob {
  id: string;
  status: 'running' | 'done' | 'error' | 'cancelled';
  progress: { done: number; total: number; bytes: number };
  /** Taranacak alanlarin tam listesi (sol sutun). */
  targets: string[];
  /** Simdiye kadar siniflandirilan kumeler: gec baglanan istemciye replay. */
  found: Cluster[];
  result?: ScanResult;
  error?: string;
  clients: Set<ServerResponse>;
  startedAt: number;
  controller: AbortController;
}

interface ExecuteJob {
  id: string;
  status: 'running' | 'done' | 'error';
  last: ExecuteEvent | null;
  clients: Set<ServerResponse>;
  startedAt: number;
}

/**
 * CLI envanteri isi. Araclar bulundukca `tools`a eklenir ve SSE
 * istemcilerine tek tek gonderilir; sonunda toplu `inventory` gelir.
 */
interface CliInventoryJob {
  id: string;
  status: 'running' | 'done' | 'error' | 'cancelled';
  unusedDays: number;
  tools: CliTool[];
  result?: CliInventory;
  error?: string;
  clients: Set<ServerResponse>;
  startedAt: number;
  controller: AbortController;
}

interface StoredPlan {
  planId: string;
  plan: DeletePlan;
  createdAt: number;
  expiresAt: number;
  requiresPhrase: boolean;
  requiresHighAck: boolean;
}

interface WebContext {
  token: string;
  opts: WebOptions;
  scans: Map<string, ScanJob>;
  activeScan: ScanJob | null;
  lastScan: { scan: ScanResult; at: number } | null;
  plans: Map<string, StoredPlan>;
  jobs: Map<string, ExecuteJob>;
  lastCliInventory: CliInventory | null;
  /**
   * Ayni anda tek CLI envanteri: ikinci istek yeni bir dosya
   * yuruyusu baslatmaz, calisan isi paylasir. `activeCliInventory`
   * yalnizca suren isi gosterir (bitenler `cliJobs`ta kalir).
   */
  cliJobs: Map<string, CliInventoryJob>;
  activeCliInventory: CliInventoryJob | null;
  cliPlans: Map<string, { plan: CliRemovalPlan; expiresAt: number }>;
  /** Disk onbellegi bir kez okundu mu? */
  scanCacheLoaded: boolean;
}

/** Tarayicidan gelen govde limiti: plan listesi kucuktur, 1 MB yeter. */
const MAX_BODY = 1024 * 1024;
const PLAN_TTL_MS = 10 * 60_000;

/** Istemci hatasi: 4xx olarak doner (500 degil). */
class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export function createWebServer(opts: WebOptions = {}): { server: Server; token: string } {
  const ctx: WebContext = {
    token: randomBytes(24).toString('hex'),
    opts,
    scans: new Map(),
    activeScan: null,
    lastScan: null,
    plans: new Map(),
    jobs: new Map(),
    lastCliInventory: null,
    cliJobs: new Map(),
    activeCliInventory: null,
    cliPlans: new Map(),
    scanCacheLoaded: false,
  };

  const server = createServer((req, res) => {
    handleRequest(req, res, ctx).catch((err) => {
      try {
        const status = err instanceof HttpError ? err.status : 500;
        sendJson(res, status, { error: describe(err) });
      } catch {
        /* yanit zaten yazilmis olabilir */
      }
    });
  });

  return { server, token: ctx.token };
}

/** Web arayuzunu baslatir ve kullanici Ctrl+C'ye basana kadar tutar. */
export async function runWeb(opts: WebOptions = {}): Promise<void> {
  const host = opts.host ?? '127.0.0.1';
  if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') {
    throw new Error('Guvenlik: web arayuzu yalnizca localhost uzerinde calistirilabilir');
  }

  await ensureWebBuild();

  const { server, token } = createWebServer(opts);
  const port = opts.port ?? 0;
  await new Promise<void>((ok, fail) => {
    server.once('error', fail);
    server.listen(port, host, () => ok());
  });

  const addr = server.address();
  const actualPort = typeof addr === 'object' && addr ? addr.port : port;
  const openHost = host === '::1' ? '127.0.0.1' : host;
  const url = `http://${openHost}:${actualPort}/?token=${token}`;
  const displayUrl = `http://localhost:${actualPort}`;

  console.log('');
  console.log('  CLICleaner web arayuzu hazir.');
  console.log('');
  console.log(`  Tarayicida acin:  ${displayUrl}`);
  console.log('  Yalnizca bu bilgisayarda calisir (127.0.0.1).');
  if (opts.open !== false) {
    console.log('  Her baslatmada yeni bir guvenlik token\'i uretilir;');
    console.log('  tarayici bu token ile otomatik acilir.');
  } else {
    console.log('');
    console.log(`  Elle acmak icin (token ile): ${url}`);
  }
  console.log('');
  console.log('  Kapatmak icin Ctrl+C.');
  console.log('');

  if (opts.open !== false) openBrowser(url);

  await new Promise<void>((ok) => {
    const stop = () => {
      // SSE baglantilari acik kalsa bile kapan; aksi halde Windows'ta
      // libuv kapanisinda assert gorebiliriz.
      server.closeAllConnections?.();
      server.close();
      closeRecycle();
      ok();
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
}

// ---------------------------------------------------------------------------
// Yonlendirme
// ---------------------------------------------------------------------------

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: WebContext,
): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
  const pathname = url.pathname;

  // DNS rebinding korumasi: Host basligi loopback olmali.
  if (!isLoopbackHost(req.headers.host)) {
    sendJson(res, 403, { error: 'Yalnizca localhost uzerinden erisilebilir' });
    return;
  }

  // Statik dosyalar token istemez; iclerinde veri yoktur.
  if (!pathname.startsWith('/api/')) {
    await serveStatic(res, pathname);
    return;
  }

  if (pathname === '/api/health') {
    sendJson(res, 200, { ok: true, name: 'clicleaner' });
    return;
  }

  if (!authorized(req, url, ctx.token)) {
    sendJson(res, 401, { error: 'Gecersiz veya eksik token' });
    return;
  }

  if (!sameOrigin(req)) {
    sendJson(res, 403, { error: 'Origin reddedildi' });
    return;
  }

  const route = `${req.method ?? 'GET'} ${pathname}`;

  if (route === 'GET /api/meta') {
    sendJson(res, 200, metaResponse(ctx));
    return;
  }

  if (route === 'GET /api/latest') {
    await ensureLastScan(ctx);
    const body: LatestResponse = {
      scan: ctx.lastScan?.scan ?? null,
      at: ctx.lastScan?.at ?? null,
    };
    sendJson(res, 200, body);
    return;
  }

  if (route === 'POST /api/scan') {
    await handleStartScan(req, res, ctx);
    return;
  }

  if (req.method === 'GET' && pathname.startsWith('/api/scan/') && pathname.endsWith('/events')) {
    openScanStream(req, res, ctx, pathname);
    return;
  }

  if (req.method === 'POST' && pathname.startsWith('/api/scan/') && pathname.endsWith('/cancel')) {
    handleCancelScan(res, ctx, pathname);
    return;
  }

  if (route === 'POST /api/plan') {
    await handleCreatePlan(req, res, ctx);
    return;
  }

  if (route === 'POST /api/execute') {
    await handleExecute(req, res, ctx);
    return;
  }

  if (req.method === 'GET' && pathname.startsWith('/api/jobs/') && pathname.endsWith('/events')) {
    openJobStream(req, res, ctx, pathname);
    return;
  }

  if (route === 'POST /api/cli/inventory') {
    await handleCliInventory(req, res, ctx);
    return;
  }

  if (
    req.method === 'GET' &&
    pathname.startsWith('/api/cli/inventory/') &&
    pathname.endsWith('/events')
  ) {
    openCliInventoryStream(req, res, ctx, pathname);
    return;
  }

  if (
    req.method === 'POST' &&
    pathname.startsWith('/api/cli/inventory/') &&
    pathname.endsWith('/cancel')
  ) {
    handleCancelCliInventory(res, ctx, pathname);
    return;
  }

  if (route === 'POST /api/cli/plan') {
    await handleCliPlan(req, res, ctx);
    return;
  }

  if (route === 'POST /api/cli/execute') {
    await handleCliExecute(req, res, ctx);
    return;
  }

  if (route === 'POST /api/open-recycle-bin') {
    openRecycleBin(res);
    return;
  }

  sendJson(res, 404, { error: 'Bilinmeyen uc nokta' });
}

// ---------------------------------------------------------------------------
// Tarama
// ---------------------------------------------------------------------------

/**
 * Son tarama sonucunu disk onbelleginden BIR KEZ yukler.
 * 24 saatten eskiyse loadScanCache null doner; kullanici "Incele" gorur.
 */
async function ensureLastScan(ctx: WebContext): Promise<void> {
  if (ctx.scanCacheLoaded) return;
  ctx.scanCacheLoaded = true;
  if (ctx.lastScan) return;
  const cached = await loadScanCache();
  if (cached) {
    ctx.lastScan = cached;
    info('tarama onbellegi yuklendi', {
      at: new Date(cached.at).toISOString(),
      kume: cached.scan.clusters.length,
    });
  } else {
    debug('taze tarama onbellegi yok (24 saat)');
  }
}

async function handleStartScan(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: WebContext,
): Promise<void> {
  // Ayni anda tek tarama: mevcut tarama varsa kimligini bildir.
  if (ctx.activeScan) {
    sendJson(res, 409, { error: 'Tarama zaten suruyor', scanId: ctx.activeScan.id });
    return;
  }

  const body = await readJson<ScanRequest>(req);
  const envs = sanitizeEnvs(body.envs) ?? ctx.opts.envs ?? [];
  const profile = sanitizeProfile(body.profile) ?? ctx.opts.profile;
  const exclude = Array.isArray(body.exclude)
    ? body.exclude.filter((e): e is string => typeof e === 'string' && isSafeName(e))
    : (ctx.opts.exclude ?? []);
  const minAgeDays =
    typeof body.minAgeDays === 'number' && Number.isFinite(body.minAgeDays)
      ? Math.max(0, Math.floor(body.minAgeDays))
      : (ctx.opts.minAgeDays ?? 0);

  const job: ScanJob = {
    id: newId(),
    status: 'running',
    progress: { done: 0, total: 0, bytes: 0 },
    targets: [],
    found: [],
    clients: new Set(),
    startedAt: Date.now(),
    controller: new AbortController(),
  };
  ctx.scans.set(job.id, job);
  ctx.activeScan = job;

  void runScanJob(ctx, job, { envs, profile, exclude, minAgeDays });

  const out: ScanStartResponse = { scanId: job.id };
  sendJson(res, 202, out);
}

async function runScanJob(
  ctx: WebContext,
  job: ScanJob,
  args: { envs: Env[]; profile?: string; exclude: string[]; minAgeDays: number },
): Promise<void> {
  try {
    const result = await runScan({
      envs: args.envs,
      profile: args.profile,
      minAgeDays: args.minAgeDays,
      json: true,
      includeBytes: true,
      exclude: args.exclude,
      quiet: true,
      signal: job.controller.signal,
      onProgress: (done, total, bytes) => {
        job.progress = { done, total, bytes };
        broadcast(job.clients, { type: 'progress', done, total, bytes });
      },
      onTargets: (paths) => {
        job.targets = paths;
        const ev: ScanStreamEvent = { type: 'targets', paths };
        broadcast(job.clients, ev);
      },
      onTargetStart: (path, done, total) => {
        const ev: ScanStreamEvent = { type: 'target-start', path, done, total };
        broadcast(job.clients, ev);
      },
      onTargetDone: (path, done, total, cluster) => {
        if (cluster) job.found.push(cluster);
        const ev: ScanStreamEvent = { type: 'target-done', path, done, total, cluster };
        broadcast(job.clients, ev);
      },
    });

    if (job.controller.signal.aborted) {
      job.status = 'cancelled';
      info('tarama iptal edildi', {
        scanId: job.id,
        ilerleme: `${job.progress.done}/${job.progress.total}`,
        kume: result.clusters.length,
      });
      broadcast(job.clients, { type: 'cancelled' });
      return;
    }

    job.status = 'done';
    job.result = result;
    ctx.lastScan = { scan: result, at: Date.now() };
    ctx.scanCacheLoaded = true;
    // Sonraki sunucu baslangicinda / sayfa yenilemesinde kullanilir.
    // Testler kismi taramalari onbellege yazmasin (persistScan: false).
    if (ctx.opts.persistScan !== false) await saveScanCache(result);
    broadcast(job.clients, { type: 'done', result });
  } catch (err) {
    if (job.controller.signal.aborted) {
      job.status = 'cancelled';
      broadcast(job.clients, { type: 'cancelled' });
    } else {
      job.status = 'error';
      job.error = describe(err);
      broadcast(job.clients, { type: 'error', message: job.error });
    }
  } finally {
    ctx.activeScan = null;
    for (const c of job.clients) c.end();
    job.clients.clear();
  }
}

function handleCancelScan(res: ServerResponse, ctx: WebContext, pathname: string): void {
  const id = pathname.split('/')[3] ?? '';
  const job = ctx.scans.get(id);
  if (!job) {
    sendJson(res, 404, { error: 'Tarama bulunamadi' });
    return;
  }
  if (job.status !== 'running') {
    sendJson(res, 409, { error: 'Tarama zaten bitti' });
    return;
  }
  job.controller.abort();
  info('tarama iptal istendi', {
    scanId: job.id,
    ilerleme: `${job.progress.done}/${job.progress.total}`,
  });
  sendJson(res, 202, { ok: true });
}

function openScanStream(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: WebContext,
  pathname: string,
): void {
  const id = pathname.split('/')[3] ?? '';
  const job = ctx.scans.get(id);
  if (!job) {
    sendJson(res, 404, { error: 'Tarama bulunamadi' });
    return;
  }

  sseSetup(res);
  sseSend(res, { type: 'progress', ...job.progress });

  // Gec baglanan istemci, taranacak alanlari ve simdiye kadar
  // bulunan kumeleri de gorur.
  if (job.status === 'running') {
    if (job.targets.length > 0) {
      sseSend(res, { type: 'targets', paths: job.targets } satisfies ScanStreamEvent);
    }
    for (const cluster of job.found) {
      sseSend(res, {
        type: 'target-done',
        path: cluster.parts[0]?.path ?? '',
        done: job.progress.done,
        total: job.progress.total,
        cluster,
      } satisfies ScanStreamEvent);
    }
  }

  if (job.status === 'done' && job.result) {
    sseSend(res, { type: 'done', result: job.result });
    res.end();
    return;
  }
  if (job.status === 'cancelled') {
    sseSend(res, { type: 'cancelled' });
    res.end();
    return;
  }
  if (job.status === 'error') {
    sseSend(res, { type: 'error', message: job.error ?? 'Bilinmeyen hata' });
    res.end();
    return;
  }

  job.clients.add(res);
  req.on('close', () => job.clients.delete(res));
}

// ---------------------------------------------------------------------------
// Plan ve silme
// ---------------------------------------------------------------------------

async function handleCreatePlan(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: WebContext,
): Promise<void> {
  const body = await readJson<PlanRequest>(req);
  await ensureLastScan(ctx);
  const scan = body.scanId ? ctx.scans.get(body.scanId)?.result : ctx.lastScan?.scan;
  if (!scan) {
    sendJson(res, 400, { error: 'Once tarama yapilmali' });
    return;
  }

  const keys = Array.isArray(body.keys)
    ? body.keys.filter((k): k is string => typeof k === 'string' && k.length > 0)
    : [];
  if (keys.length === 0) {
    sendJson(res, 400, { error: 'Kume secilmedi' });
    return;
  }

  const mode = body.mode === 'purge' ? 'purge' : 'recycle';
  const selected = scan.clusters.filter((c) => keys.includes(c.key));
  if (selected.length === 0) {
    sendJson(res, 400, { error: 'Secilen kumeler bulunamadi' });
    return;
  }

  let plan: DeletePlan;
  try {
    plan = buildPlan(selected, mode);
  } catch (err) {
    // Guvenlik kapisi burada hata firlatir; plana hicbir zaman girmez.
    sendJson(res, 400, { error: describe(err) });
    return;
  }

  if (plan.targets.length === 0) {
    sendJson(res, 400, { error: 'Secilen kumeler icin silinecek yol yok' });
    return;
  }

  const requiresPhrase = plan.clusters.some((c) => c.risk === 'medium' || c.risk === 'high');
  const requiresHighAck = plan.clusters.some((c) => c.risk === 'high');
  const planId = newId();
  const expiresAt = Date.now() + PLAN_TTL_MS;

  ctx.plans.set(planId, {
    planId,
    plan,
    createdAt: Date.now(),
    expiresAt,
    requiresPhrase,
    requiresHighAck,
  });

  const planView: PlanView = {
    mode: plan.mode,
    clusters: plan.clusters,
    targets: plan.targets,
    totalBytes: plan.totalBytes,
  };
  const out: PlanResponse = { planId, plan: planView, requiresPhrase, requiresHighAck, expiresAt };
  sendJson(res, 200, out);
}

async function handleExecute(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: WebContext,
): Promise<void> {
  const body = await readJson<ExecuteRequest>(req);
  const stored = ctx.plans.get(body.planId ?? '');
  if (!stored) {
    sendJson(res, 404, { error: 'Plan bulunamadi veya zaten kullanildi' });
    return;
  }
  if (Date.now() > stored.expiresAt) {
    ctx.plans.delete(stored.planId);
    sendJson(res, 410, { error: 'Plan suresi doldu; yeniden planlayin' });
    return;
  }
  if (stored.requiresPhrase && body.phrase !== 'SIL') {
    sendJson(res, 400, { error: 'Onay metni hatali ("SIL" bekleniyordu)' });
    return;
  }
  if (stored.requiresHighAck && body.acknowledgeHigh !== true) {
    sendJson(res, 400, { error: 'Yuksek risk onayi eksik' });
    return;
  }

  // Plan tek kullanimlik: ayni planla ikinci kez silme baslatilamaz.
  ctx.plans.delete(stored.planId);

  const job: ExecuteJob = {
    id: newId(),
    status: 'running',
    last: null,
    clients: new Set(),
    startedAt: Date.now(),
  };
  ctx.jobs.set(job.id, job);
  void runExecuteJob(job, stored);

  const out: ExecuteStartResponse = { jobId: job.id };
  sendJson(res, 202, out);
}

async function runExecuteJob(job: ExecuteJob, stored: StoredPlan): Promise<void> {
  const plan = stored.plan;
  const journal = new Journal();
  let freed = 0;
  let removed = 0;
  let skipped = 0;
  let failed = 0;

  const emit = (ev: ExecuteEvent) => {
    job.last = ev;
    broadcast(job.clients, ev);
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
          reason: describe(err),
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
        const dir = join(process.env.LOCALAPPDATA ?? '.', 'clicleaner', 'journals');
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
    emit({ type: 'error', message: describe(err) });
  } finally {
    closeRecycle();
    for (const c of job.clients) c.end();
    job.clients.clear();
  }
}

// ---------------------------------------------------------------------------
// CLI envanteri
// ---------------------------------------------------------------------------

async function handleCliInventory(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: WebContext,
): Promise<void> {
  const body = await readJson<CliInventoryRequest>(req);
  const unusedDays =
    typeof body.unusedDays === 'number' && Number.isFinite(body.unusedDays)
      ? Math.max(1, Math.floor(body.unusedDays))
      : 21;

  // Ayni anda birden fazla envanter taramasi baslatma: pahali
  // dosya yuruyusleri birbirini yavaslatir. Devam eden is varsa
  // istemci ayni isin akisina baglanir (kacirdigi araclar replay edilir).
  if (ctx.activeCliInventory) {
    const out: CliInventoryStartResponse = {
      jobId: ctx.activeCliInventory.id,
      shared: true,
    };
    sendJson(res, 200, out);
    return;
  }

  // Biten islerin akisi kapanmistir; yalnizca son is yeniden acilabilsin
  // diye eskileri temizle.
  for (const [id, old] of ctx.cliJobs) {
    if (old.status !== 'running') ctx.cliJobs.delete(id);
  }

  const job: CliInventoryJob = {
    id: newId(),
    status: 'running',
    unusedDays,
    tools: [],
    clients: new Set(),
    startedAt: Date.now(),
    controller: new AbortController(),
  };
  ctx.cliJobs.set(job.id, job);
  ctx.activeCliInventory = job;

  info('cli envanteri istendi', { jobId: job.id, unusedDays });
  void runCliInventoryJob(ctx, job);

  const out: CliInventoryStartResponse = { jobId: job.id };
  sendJson(res, 202, out);
}

async function runCliInventoryJob(ctx: WebContext, job: CliInventoryJob): Promise<void> {
  try {
    const inv = await scanCliInventory({
      unusedDays: job.unusedDays,
      signal: job.controller.signal,
      onTool: (tool) => {
        if (job.status !== 'running') return;
        job.tools.push(tool);
        const ev: CliInventoryStreamEvent = { type: 'tool', tool };
        broadcast(job.clients, ev);
      },
    });

    if (job.controller.signal.aborted) {
      job.status = 'cancelled';
      info('cli envanteri iptal edildi', {
        jobId: job.id,
        bulunan: job.tools.length,
      });
      broadcast(job.clients, { type: 'cancelled' } satisfies CliInventoryStreamEvent);
      return;
    }

    job.status = 'done';
    job.result = inv;
    ctx.lastCliInventory = inv;
    info('cli envanteri tamamlandi', {
      jobId: job.id,
      araclar: inv.tools.length,
      atil: inv.tools.filter((t) => t.status === 'unused').length,
      bilinmiyor: inv.tools.filter((t) => t.status === 'unknown').length,
      korunan: inv.tools.filter((t) => t.status === 'protected').length,
      cokluKurulum: inv.duplicates.length,
    });
    const ev: CliInventoryStreamEvent = { type: 'done', inventory: inv };
    broadcast(job.clients, ev);
  } catch (err) {
    if (job.controller.signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
      job.status = 'cancelled';
      info('cli envanteri iptal edildi', { jobId: job.id, bulunan: job.tools.length });
      broadcast(job.clients, { type: 'cancelled' } satisfies CliInventoryStreamEvent);
    } else {
      job.status = 'error';
      job.error = describe(err);
      logError('cli envanteri basarisiz', { jobId: job.id, err: job.error });
      broadcast(job.clients, {
        type: 'error',
        message: job.error,
      } satisfies CliInventoryStreamEvent);
    }
  } finally {
    if (ctx.activeCliInventory === job) ctx.activeCliInventory = null;
    for (const c of job.clients) c.end();
    job.clients.clear();
  }
}

function openCliInventoryStream(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: WebContext,
  pathname: string,
): void {
  const id = pathname.split('/')[4] ?? '';
  const job = ctx.cliJobs.get(id);
  if (!job) {
    sendJson(res, 404, { error: 'Envanter isi bulunamadi' });
    return;
  }

  sseSetup(res);
  sseSend(res, {
    type: 'start',
    unusedDays: job.unusedDays,
    startedAt: job.startedAt,
  } satisfies CliInventoryStreamEvent);

  // Gec baglanan istemci kacirdigi araclari da gorur.
  for (const tool of job.tools) {
    sseSend(res, { type: 'tool', tool } satisfies CliInventoryStreamEvent);
  }

  if (job.status === 'done' && job.result) {
    sseSend(res, { type: 'done', inventory: job.result } satisfies CliInventoryStreamEvent);
    res.end();
    return;
  }
  if (job.status === 'cancelled') {
    sseSend(res, { type: 'cancelled' } satisfies CliInventoryStreamEvent);
    res.end();
    return;
  }
  if (job.status === 'error') {
    sseSend(res, {
      type: 'error',
      message: job.error ?? 'Bilinmeyen hata',
    } satisfies CliInventoryStreamEvent);
    res.end();
    return;
  }

  job.clients.add(res);
  req.on('close', () => job.clients.delete(res));
}

function handleCancelCliInventory(
  res: ServerResponse,
  ctx: WebContext,
  pathname: string,
): void {
  const id = pathname.split('/')[4] ?? '';
  const job = ctx.cliJobs.get(id);
  if (!job) {
    sendJson(res, 404, { error: 'Envanter isi bulunamadi' });
    return;
  }
  if (job.status !== 'running') {
    sendJson(res, 409, { error: 'Envanter zaten bitti' });
    return;
  }

  job.controller.abort();
  info('cli envanteri iptal istendi', { jobId: job.id, bulunan: job.tools.length });
  const out: CliInventoryCancelResponse = { ok: true };
  sendJson(res, 202, out);
}

async function handleCliPlan(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: WebContext,
): Promise<void> {
  const body = await readJson<CliPlanRequest>(req);
  const commands = Array.isArray(body.commands)
    ? body.commands.filter((c): c is string => typeof c === 'string' && c.length > 0)
    : [];
  if (commands.length === 0) {
    sendJson(res, 400, { error: 'Arac secilmedi' });
    return;
  }

  let inv = ctx.lastCliInventory;
  if (!inv) {
    inv = await scanCliInventory({ unusedDays: 21 });
    ctx.lastCliInventory = inv;
  }

  const wanted = new Set(commands.map((c) => c.toLowerCase()));
  // Kimlik verildiyse YALNIZ onu sec. Ayni komutu iki paket
  // saglayabildigi icin komut eslesmesi yanlis kurulumu planlayabilir.
  const byId = inv.tools.filter((t) => wanted.has(t.id.toLowerCase()));
  const selected =
    byId.length > 0 ? byId : inv.tools.filter((t) => wanted.has(t.command.toLowerCase()));
  if (selected.length === 0) {
    sendJson(res, 400, { error: 'Secilen araclar envanterde yok' });
    return;
  }

  const removable = selected.filter((t) => t.status !== 'protected');
  if (removable.length === 0) {
    sendJson(res, 400, { error: 'Korunan araclar kaldirilamaz' });
    return;
  }

  const plan = await planCliRemoval(removable, body.backup !== false);
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
    manual: it.manual,
    backupPaths: it.backup.items.map((b) => b.path),
    backupBytes: it.backup.totalBytes,
    backupSkipped: it.backup.skipped.map((s) => ({
      path: s.path,
      reason: s.reason ?? 'atlandi',
    })),
  }));

  ctx.cliPlans.set(plan.id, { plan, expiresAt: plan.expiresAt });
  info('cli kaldirma plani olusturuldu', {
    planId: plan.id,
    araclar: plan.items.length,
    yedekMB: Math.round(plan.backupBytes / 1048576),
    manuel: plan.items.filter((i) => i.manual).length,
  });
  const out: CliPlanResponse = {
    planId: plan.id,
    items,
    totalBytes: plan.totalBytes,
    backupBytes: plan.backupBytes,
    requiresPhrase: true,
    expiresAt: plan.expiresAt,
  };
  sendJson(res, 200, out);
}

async function handleCliExecute(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: WebContext,
): Promise<void> {
  const body = await readJson<CliExecuteRequest>(req);
  const planId = typeof body.planId === 'string' ? body.planId : '';
  const stored = ctx.cliPlans.get(planId);
  if (!stored) {
    sendJson(res, 404, { error: 'Plan bulunamadi veya zaten kullanildi' });
    return;
  }
  if (Date.now() > stored.expiresAt) {
    ctx.cliPlans.delete(planId);
    sendJson(res, 410, { error: 'Plan suresi doldu; yeniden planlayin' });
    return;
  }
  if (body.phrase !== 'SIL') {
    sendJson(res, 400, { error: 'Onay metni hatali ("SIL" bekleniyordu)' });
    return;
  }

  ctx.cliPlans.delete(planId);
  const results = await executeCliRemoval(stored.plan);
  // Envanter artik eski; bir sonraki planlama yeniden tarar.
  ctx.lastCliInventory = null;

  const out: CliExecuteResponse = {
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
  sendJson(res, 200, out);
}

function openJobStream(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: WebContext,
  pathname: string,
): void {
  const id = pathname.split('/')[3] ?? '';
  const job = ctx.jobs.get(id);
  if (!job) {
    sendJson(res, 404, { error: 'Islem bulunamadi' });
    return;
  }

  sseSetup(res);
  if (job.last) sseSend(res, job.last);

  if (job.status !== 'running') {
    res.end();
    return;
  }

  job.clients.add(res);
  req.on('close', () => job.clients.delete(res));
}

// ---------------------------------------------------------------------------
// Yardimcilar
// ---------------------------------------------------------------------------

function metaResponse(ctx: WebContext): MetaResponse {
  return {
    envs: ENVS.map((e) => ({ id: e.id, label: e.label, description: e.description })),
    profiles: Object.values(BUILTIN_PROFILES).map((p) => ({
      name: p.name,
      description: p.description,
      envs: p.envs as string[],
    })),
    defaults: {
      envs: (ctx.opts.envs ?? []) as string[],
      profile: ctx.opts.profile ?? null,
      exclude: ctx.opts.exclude ?? [],
      minAgeDays: ctx.opts.minAgeDays ?? 0,
    },
  };
}

function openRecycleBin(res: ServerResponse): void {
  try {
    spawn('explorer.exe', ['shell:RecycleBinFolder'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    }).unref();
    sendJson(res, 200, { ok: true });
  } catch (err) {
    sendJson(res, 500, { error: describe(err) });
  }
}

/** Kimligin kimseye sizmadigi rastgele kimlik. */
function newId(): string {
  return randomBytes(8).toString('hex');
}

function isLoopbackHost(host: string | undefined): boolean {
  if (!host) return true;
  return /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(host.trim());
}

function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const o = new URL(origin);
    const host = (req.headers.host ?? '').toLowerCase();
    if (o.host.toLowerCase() !== host) return false;
    return o.hostname === '127.0.0.1' || o.hostname === 'localhost' || o.hostname === '::1';
  } catch {
    return false;
  }
}

function authorized(req: IncomingMessage, url: URL, token: string): boolean {
  const header = req.headers['x-clicleaner-token'];
  const raw = Array.isArray(header) ? header[0] : header;
  const provided = raw ?? url.searchParams.get('token') ?? '';
  if (provided.length !== token.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(token));
  } catch {
    return false;
  }
}

function sanitizeEnvs(envs: unknown): Env[] | null {
  if (!Array.isArray(envs)) return null;
  const allowed = new Set<string>(ENVS.map((e) => e.id));
  const out = envs.filter((e): e is Env => typeof e === 'string' && allowed.has(e));
  return out.length > 0 ? out : null;
}

function sanitizeProfile(profile: unknown): string | undefined {
  if (typeof profile !== 'string' || !profile) return undefined;
  return profile in BUILTIN_PROFILES ? profile : undefined;
}

function isSafeName(name: string): boolean {
  return /^[a-z0-9._@-]+$/i.test(name) && name.length <= 64;
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    size += buf.length;
    if (size > MAX_BODY) throw new HttpError(413, 'Istek govdesi cok buyuk');
    chunks.push(buf);
  }
  if (chunks.length === 0) return {} as T;
  const txt = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(txt) as T;
  } catch {
    throw new HttpError(400, 'Gecersiz JSON govdesi');
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  if (res.writableEnded) return;
  const txt = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(txt);
}

function sseSetup(res: ServerResponse): void {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  res.flushHeaders?.();
  res.write(': bagli\n\n');
}

function sseSend(res: ServerResponse, data: unknown): void {
  if (res.writableEnded) return;
  try {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch {
    /* istemci koptu */
  }
}

function broadcast(clients: Set<ServerResponse>, data: unknown): void {
  for (const c of clients) sseSend(c, data);
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function openBrowser(url: string): void {
  try {
    if (process.platform === 'win32') {
      spawn('cmd.exe', ['/c', 'start', '', url], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch {
    /* tarayici acilamadi; adres konsolda yazili */
  }
}

// ---------------------------------------------------------------------------
// Statik dosyalar
// ---------------------------------------------------------------------------

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

async function serveStatic(res: ServerResponse, pathname: string): Promise<void> {
  const rel = pathname === '/' || pathname === '' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = resolve(DIST_DIR, rel);
  const dist = DIST_DIR.toLowerCase();
  const index = WEB_INDEX.toLowerCase();

  const inside = file.toLowerCase() === index || file.toLowerCase().startsWith(dist + sep.toLowerCase());
  if (!inside) {
    sendJson(res, 404, { error: 'Bulunamadi' });
    return;
  }

  try {
    const buf = await readFile(file);
    const ext = extname(file).toLowerCase();
    res.writeHead(200, {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      'cache-control': rel.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    res.end(buf);
    return;
  } catch {
    /* asagida SPA geri donusu denenir */
  }

  // Uzantisiz yollar tek sayfa uygulamasina duser.
  if (extname(rel) === '') {
    try {
      const idx = await readFile(WEB_INDEX);
      res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-cache' });
      res.end(idx);
      return;
    } catch {
      /* derlenmemis */
    }
  }
  sendJson(res, 404, { error: 'Bulunamadi' });
}

// ---------------------------------------------------------------------------
// Derleme
// ---------------------------------------------------------------------------

let buildPromise: Promise<void> | null = null;

/**
 * dist/web yoksa Vite ile derler. Boylece kaynak depodan calistiran
 * kullanici ayrica bir adim yapmak zorunda kalmaz.
 */
export async function ensureWebBuild(): Promise<void> {
  if (buildPromise) return buildPromise;
  buildPromise = (async () => {
    try {
      await readFile(WEB_INDEX);
      return;
    } catch {
      /* derlenmemis */
    }

    console.log('  Web arayuzu derleniyor (ilk calistirma, birkac saniye)...');
    try {
      const { build } = await import('vite');
      await build({ configFile: join(ROOT_DIR, 'vite.config.ts'), logLevel: 'warn' });
      await readFile(WEB_INDEX);
    } catch (err) {
      buildPromise = null;
      throw new Error(
        `Web arayuzu derlenemedi: ${describe(err)}\n` +
          '  Cozum: npm install && npm run build:web',
      );
    }
  })();
  return buildPromise;
}
