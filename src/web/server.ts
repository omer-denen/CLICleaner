import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { closeRecycle } from '../actions/delete.ts';
import {
  findVaultEntry,
  listVaultEntries,
  purgeVault,
  restoreAllVault,
  restoreVaultEntry,
} from '../actions/vault.ts';
import { exists } from '../actions/restore.ts';
import { BUILTIN_PROFILES, ENVS } from '../core/discover.ts';
import { buildFindings } from '../core/findings.ts';
import { primaryPath, scanItemId } from '../core/scan-items.ts';
import { longPath } from '../util/longpath.ts';
import { ScanService } from '../services/scan-service.ts';
import { DeleteService } from '../services/delete-service.ts';
import { CliInventoryService } from '../services/cli-inventory-service.ts';
import { CliRemovalService } from '../services/cli-removal-service.ts';
import { CliRepairService } from '../services/cli-repair-service.ts';
import { CliQuarantineService } from '../services/cli-quarantine-service.ts';
import { ServiceError, describeError } from '../services/errors.ts';
import { readJson, sendJson, sseSend, sseSetup } from './http.ts';
import type { Env } from '../core/types.ts';
import type {
  CliInventoryCancelResponse,
  CliInventoryRequest,
  CliInventoryStartResponse,
  CliInventoryStreamEvent,
  CliExecuteRequest,
  CliPlanRequest,
  CliRepairExecuteRequest,
  CliRepairPlanRequest,
  CliQuarantineExecuteRequest,
  CliQuarantinePlanRequest,
  ExecuteRequest,
  FindingsResponse,
  LatestResponse,
  MetaResponse,
  PlanRequest,
  ScanRequest,
  ScanStartResponse,
  ScanStatusResponse,
  ScanStreamEvent,
  SettingsResponse,
  SettingsUpdateRequest,
  VaultEntryView,
  VaultListResponse,
  VaultPurgeRequest,
  VaultPurgeResponse,
  VaultRestoreAllResponse,
  VaultRestoreRequest,
  VaultRestoreResponse,
} from './contract.ts';

/**
 * CLICleaner yerel web arayuzu — YALNIZ HTTP/SSE adaptoru.
 *
 * Is mantigi `src/services/` altindadir:
 *   ScanService, DeleteService, CliInventoryService,
 *   CliRemovalService, CliRepairService.
 *
 * Guvenlik modeli:
 *  - Sunucu YALNIZCA 127.0.0.1 uzerinde dinler; aga acilmaz.
 *  - Her baslatmada rastgele bir token uretilir; API cagrilari bu
 *    token olmadan reddedilir.
 *  - Istemci SILME icin yol gondermez; yalnizca kume anahtari secer.
 *    Yollar sunucudaki tarama sonucundan gelir.
 *  - Proje taramasi (root) icin istemci yalnizca TARANACAK klasoru
 *    secebilir: /api/fs/dirs salt okunur klasor listesi doner,
 *    proje taramasi report-only sonuclanir ve silme hedefi uretmez.
 *  - Silme iki asamalidir: once plan (kimlik), sonra onay. Plan
 *    10 dakika sonra duser. Orta/yuksek risk "SIL" yazili onayi
 *    olmadan yurutulmez.
 *  - Tarayici "Origin" ve "Host" basliklari dogrulanir.
 */

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT_DIR = resolve(HERE, '..', '..');
const DIST_DIR = join(ROOT_DIR, 'dist', 'web');
const WEB_INDEX = join(DIST_DIR, 'index.html');

export type BrowserChoice = 'edge' | 'default';

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
   * Hangi tarayici acilsin. Varsayilan 'default' (sistem varsayilani).
   *
   * Kullanici hangi tarayiciyi kullaniyorsa arayuz orada acilir.
   * 'edge' yalnizca ACIKCA istenirse Microsoft Edge'i zorlar; Edge
   * bulunamazsa sistem varsayilanina dusulur.
   */
  browser?: BrowserChoice;
  /**
   * Tarama sonucunu 24 saatlik disk onbellegine yaz (varsayilan true).
   * Testler false verir; kismi tarama kullanicinin onbellegini ezmesin.
   */
  persistScan?: boolean;
}

interface WebContext {
  token: string;
  opts: WebOptions;
  scan: ScanService;
  remove: DeleteService;
  inventory: CliInventoryService;
  removal: CliRemovalService;
  repair: CliRepairService;
  quarantine: CliQuarantineService;
  /** jobId -> SSE istemcileri (HTTP adaptorune ait gecici durum). */
  streams: Map<string, Set<ServerResponse>>;
}

export function createWebServer(opts: WebOptions = {}): { server: Server; token: string } {
  const token = randomBytes(24).toString('hex');
  const streams = new Map<string, Set<ServerResponse>>();

  // Servis olaylarini SSE istemcilerine yazan tek nokta. Terminal
  // olaydan sonra baglantilar kapatilir; servisler HTTP bilmez.
  const emit = (jobId: string, event: unknown, id?: number): void => {
    const clients = streams.get(jobId);
    if (!clients) return;
    for (const c of clients) sseSend(c, event, id);
    const type = (event as { type?: string }).type;
    if (type === 'done' || type === 'cancelled' || type === 'error') {
      for (const c of clients) c.end();
      streams.delete(jobId);
    }
  };

  const scan = new ScanService(emit, opts.persistScan !== false);
  const remove = new DeleteService(emit);
  const inventory = new CliInventoryService(emit);
  const removal = new CliRemovalService(inventory);
  const repair = new CliRepairService(inventory);
  const quarantine = new CliQuarantineService(inventory);

  const ctx: WebContext = {
    token,
    opts,
    scan,
    remove,
    inventory,
    removal,
    repair,
    quarantine,
    streams,
  };

  const server = createServer((req, res) => {
    handleRequest(req, res, ctx).catch((err) => {
      try {
        const status = err instanceof ServiceError ? err.status : 500;
        sendJson(res, status, { error: describeError(err) });
      } catch {
        /* yanit zaten yazilmis olabilir */
      }
    });
  });

  return { server, token };
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

  if (opts.open !== false) openBrowser(url, opts.browser ?? 'default');

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

  if (req.method === 'GET' && pathname === '/api/fs/dirs') {
    await handleListDirs(req, res);
    return;
  }

  if (route === 'GET /api/latest') {
    await ctx.scan.ensureCacheLoaded();
    const last = ctx.scan.last();
    const body: LatestResponse = { scan: last?.scan ?? null, at: last?.at ?? null };
    sendJson(res, 200, body);
    return;
  }

  if (route === 'GET /api/scan/status') {
    const body: ScanStatusResponse = await ctx.scan.status();
    sendJson(res, 200, body);
    return;
  }

  if (route === 'GET /api/findings') {
    // Birlesik gorunum: disk kumeleri + CLI envanteri. SALT OKUNUR.
    const last = ctx.scan.last();
    const inv = ctx.inventory.getLast();
    const findings = buildFindings(last?.scan ?? null, inv);
    const body: FindingsResponse = {
      findings,
      disk: findings.filter((f) => f.source === 'disk').length,
      cli: findings.filter((f) => f.source === 'cli').length,
      at: last?.at ?? null,
    };
    sendJson(res, 200, body);
    return;
  }

  if (route === 'GET /api/settings') {
    const body: SettingsResponse = await ctx.scan.settings();
    sendJson(res, 200, body);
    return;
  }

  if (route === 'PUT /api/settings' || route === 'POST /api/settings') {
    const body = await readJson<SettingsUpdateRequest>(req);
    const out = await ctx.scan.updateSettings({ scanCacheHours: Number(body.scanCacheHours) });
    sendJson(res, 200, out);
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
    const id = pathname.split('/')[3] ?? '';
    ctx.scan.cancel(id);
    sendJson(res, 202, { ok: true });
    return;
  }

  if (route === 'POST /api/plan') {
    await handleCreatePlan(req, res, ctx);
    return;
  }

  if (route === 'POST /api/execute') {
    const body = await readJson<ExecuteRequest>(req);
    const out = ctx.remove.execute(
      body.planId ?? '',
      body.phrase,
      body.acknowledgeHigh === true,
    );
    // T28/24s: silme basladi -> disk degisecek; son tarama artik guncel
    // sayilmaz. Plan gecersizse execute yukarida hata verir.
    await ctx.scan.markDirty();
    sendJson(res, 202, out);
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
    const id = pathname.split('/')[4] ?? '';
    ctx.inventory.cancel(id);
    const out: CliInventoryCancelResponse = { ok: true };
    sendJson(res, 202, out);
    return;
  }

  if (route === 'POST /api/cli/repair/plan') {
    const body = await readJson<CliRepairPlanRequest>(req);
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((x): x is string => typeof x === 'string' && x.length > 0)
      : [];
    sendJson(res, 200, await ctx.repair.plan(ids));
    return;
  }

  if (route === 'POST /api/cli/repair/execute') {
    const body = await readJson<CliRepairExecuteRequest>(req);
    const planId = typeof body.planId === 'string' ? body.planId : '';
    sendJson(res, 200, await ctx.repair.execute(planId, body.phrase));
    return;
  }

  if (route === 'POST /api/cli/quarantine/plan') {
    const body = await readJson<CliQuarantinePlanRequest>(req);
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((x): x is string => typeof x === 'string' && x.length > 0)
      : [];
    sendJson(res, 200, await ctx.quarantine.plan(ids));
    return;
  }

  if (route === 'POST /api/cli/quarantine/execute') {
    const body = await readJson<CliQuarantineExecuteRequest>(req);
    const planId = typeof body.planId === 'string' ? body.planId : '';
    sendJson(res, 200, await ctx.quarantine.execute(planId, body.phrase));
    return;
  }

  if (route === 'POST /api/cli/plan') {
    const body = await readJson<CliPlanRequest>(req);
    const commands = Array.isArray(body.commands)
      ? body.commands.filter((c): c is string => typeof c === 'string' && c.length > 0)
      : [];
    sendJson(res, 200, await ctx.removal.plan(commands, body.backup !== false));
    return;
  }

  if (route === 'POST /api/cli/execute') {
    const body = await readJson<CliExecuteRequest>(req);
    const planId = typeof body.planId === 'string' ? body.planId : '';
    sendJson(res, 200, await ctx.removal.execute(planId, body.phrase));
    return;
  }

  if (route === 'GET /api/vault') {
    const settings = await ctx.scan.settings();
    const now = Date.now();
    const entries = (await listVaultEntries()).slice(0, 500);
    const views: VaultEntryView[] = [];
    for (const e of entries) {
      const ageMs = Math.max(0, now - e.at);
      views.push({
        id: e.id,
        batchId: e.batchId,
        originalPath: e.originalPath,
        storedPath: e.storedPath,
        bytes: e.bytes,
        files: e.files,
        at: e.at,
        ageMs,
        remainingDays: Math.max(
          0,
          settings.vaultRetentionDays - Math.floor(ageMs / 86_400_000),
        ),
        originalExists: await exists(e.originalPath),
      });
    }
    const body: VaultListResponse = {
      entries: views,
      totalBytes: views.reduce((a, e) => a + e.bytes, 0),
      retentionDays: settings.vaultRetentionDays,
    };
    sendJson(res, 200, body);
    return;
  }

  if (route === 'POST /api/vault/restore') {
    const body = await readJson<VaultRestoreRequest>(req);
    const entry = await findVaultEntry(body.id ?? '');
    if (!entry) {
      sendJson(res, 404, { error: 'Kasa kaydi bulunamadi' });
      return;
    }
    const r = await restoreVaultEntry(entry);
    const out: VaultRestoreResponse = {
      ok: r.restored,
      to: r.to,
      conflict: r.conflict,
      ...(r.reason ? { error: r.reason } : {}),
    };
    sendJson(res, r.restored ? 200 : 409, out);
    return;
  }

  if (route === 'POST /api/vault/restore-all') {
    const r = await restoreAllVault();
    const out: VaultRestoreAllResponse = {
      ok: r.failed === 0,
      restored: r.restored,
      conflict: r.conflict,
      failed: r.failed,
    };
    sendJson(res, 200, out);
    return;
  }

  if (route === 'POST /api/vault/purge') {
    const body = await readJson<VaultPurgeRequest>(req);
    // Kalici islem: yazili onay sunucuda da dogrulanir (istemciye guvenilmez).
    if ((body.phrase ?? '').trim() !== 'BOŞALT') {
      sendJson(res, 400, { error: 'Onay ifadesi hatali (BOŞALT)' });
      return;
    }
    const r = await purgeVault();
    const out: VaultPurgeResponse = {
      ok: r.failed === 0,
      batches: r.batches,
      bytes: r.bytes,
      failed: r.failed,
    };
    sendJson(res, 200, out);
    return;
  }

  sendJson(res, 404, { error: 'Bilinmeyen uc nokta' });
}

// ---------------------------------------------------------------------------
// Tarama adaptoru
// ---------------------------------------------------------------------------

async function handleListDirs(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://' + (req.headers.host ?? '127.0.0.1'));
  const raw = (url.searchParams.get('path') ?? '').trim();
  const requested = resolve(raw || process.env.USERPROFILE || 'C:\\');

  let st;
  try {
    st = await stat(longPath(requested));
  } catch {
    sendJson(res, 404, { error: 'Dizin bulunamadi' });
    return;
  }
  if (!st.isDirectory()) {
    sendJson(res, 400, { error: 'Klasor degil' });
    return;
  }

  let dirs: Array<{ name: string; path: string }> = [];
  try {
    const ents = await readdir(longPath(requested), { withFileTypes: true });
    dirs = ents
      .filter((e) => e.isDirectory())
      .map((e) => ({ name: e.name, path: join(requested, e.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    dirs = [];
  }

  // Surucu koku disinda ust klasor her zaman vardir.
  const up = dirname(requested);
  const parent = up === requested ? null : up;
  sendJson(res, 200, { path: requested, parent, dirs });
}

async function handleStartScan(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: WebContext,
): Promise<void> {
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
  // Proje taramasi: istemci yalnizca klasor secer; yol sunucuda
  // normalize edilir. Bos/gecersiz deger yok sayilir.
  const rawRoot = typeof body.root === 'string' ? body.root.trim() : '';
  const root = rawRoot.length > 0 ? resolve(rawRoot) : undefined;

  try {
    const job = ctx.scan.start({ envs, profile, exclude, minAgeDays, root });
    const out: ScanStartResponse = { scanId: job.id };
    sendJson(res, 202, out);
  } catch (err) {
    // Eski davranis: 409 govdesinde calisan taramanin kimligi de doner.
    if (err instanceof ServiceError && err.status === 409) {
      sendJson(res, 409, { error: err.message, scanId: ctx.scan.activeJobId() });
      return;
    }
    throw err;
  }
}

function openScanStream(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: WebContext,
  pathname: string,
): void {
  const id = pathname.split('/')[3] ?? '';
  const job = ctx.scan.get(id);
  if (!job) {
    sendJson(res, 404, { error: 'Tarama bulunamadi' });
    return;
  }

  sseSetup(res);

  // SSE yeniden baglanma: tarayici `Last-Event-ID` gonderir. Son 2000
  // olay tutuldugu icin istemci kacirdigi olaylari tekrar alir; tampon
  // disina dustuyse asagidaki anlik gorunum (snapshot) kullanilir.
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const headerId = req.headers['last-event-id'];
  const rawId = Array.isArray(headerId) ? headerId[0] : headerId;
  const lastId = Number(rawId ?? url.searchParams.get('lastEventId') ?? 0) || 0;
  const firstId = job.events[0]?.id ?? 0;
  const canReplay = lastId > 0 && (job.events.length === 0 || lastId >= firstId - 1);
  if (canReplay) {
    for (const e of job.events) {
      if (e.id > lastId) sseSend(res, e.event, e.id);
    }
    // Biten tarama: son olay (done/cancelled/error) de gonderildi.
    if (job.status !== 'running') res.end();
    return;
  }

  sseSend(res, { type: 'progress', ...job.progress });

  // Gec baglanan istemci, taranacak alanlari ve simdiye kadar
  // bulunan kumeleri de gorur.
  if (job.status === 'running') {
    if (job.targets.length > 0) {
      sseSend(res, { type: 'targets', paths: job.targets } satisfies ScanStreamEvent);
    }
    for (const cluster of job.found) {
      // Oge kimligi kararli oldugu icin gec baglanan istemci ayni ogeyi
      // iki kez gormez; canli akista gelen guncelleme satiri tazeler.
      sseSend(res, {
        type: 'item',
        id: scanItemId(cluster),
        key: cluster.key,
        path: primaryPath(cluster),
        cluster,
        done: job.progress.done,
        total: job.progress.total,
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

  subscribe(ctx, id, req, res);
}

// ---------------------------------------------------------------------------
// Disk plan adaptoru
// ---------------------------------------------------------------------------

async function handleCreatePlan(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: WebContext,
): Promise<void> {
  const body = await readJson<PlanRequest>(req);
  await ctx.scan.ensureCacheLoaded();

  const scan = body.scanId ? ctx.scan.get(body.scanId)?.result : ctx.scan.last()?.scan;
  const keys = Array.isArray(body.keys)
    ? body.keys.filter((k): k is string => typeof k === 'string' && k.length > 0)
    : [];
  const mode = body.mode === 'purge' ? 'purge' : 'recycle';
  sendJson(res, 200, ctx.remove.createPlan(scan ?? null, keys, mode));
}

function openJobStream(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: WebContext,
  pathname: string,
): void {
  const id = pathname.split('/')[3] ?? '';
  const job = ctx.remove.getJob(id);
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

  subscribe(ctx, id, req, res);
}

// ---------------------------------------------------------------------------
// CLI envanteri adaptoru
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

  const { jobId, shared } = ctx.inventory.start(unusedDays);
  const out: CliInventoryStartResponse = shared ? { jobId, shared: true } : { jobId };
  sendJson(res, shared ? 200 : 202, out);
}

function openCliInventoryStream(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: WebContext,
  pathname: string,
): void {
  const id = pathname.split('/')[4] ?? '';
  const job = ctx.inventory.get(id);
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

  subscribe(ctx, id, req, res);
}

// ---------------------------------------------------------------------------
// SSE aboneligi
// ---------------------------------------------------------------------------

function subscribe(
  ctx: WebContext,
  jobId: string,
  req: IncomingMessage,
  res: ServerResponse,
): void {
  let clients = ctx.streams.get(jobId);
  if (!clients) {
    clients = new Set();
    ctx.streams.set(jobId, clients);
  }
  clients.add(res);
  req.on('close', () => {
    clients!.delete(res);
    if (clients!.size === 0) ctx.streams.delete(jobId);
  });
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

/**
 * Windows'ta Microsoft Edge ikilisinin bilinen konumlari. Yalnizca
 * Edge ACIKCA istendiginde kullanilir; varsayilan sistem tarayicisidir.
 */
function edgeCandidates(): string[] {
  const out: string[] = [];
  const pf86 = process.env['ProgramFiles(x86)'];
  const pf = process.env.ProgramFiles;
  const lad = process.env.LOCALAPPDATA;
  if (pf86) out.push(join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
  if (pf) out.push(join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
  if (lad) out.push(join(lad, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
  return out;
}

/**
 * Acilacak komutu cozer. Disa acik (test edilebilir): hangi tarayicinin
 * nasil acilacagini yalnizca burada belirleriz.
 *
 * Oncelik: acik secim > CLICLEANER_BROWSER ortam degiskeni.
 * Varsayilan sistem tarayicisidir; 'edge' zorlanirsa ve Edge
 * bulunamazsa yine sistem varsayilanina (cmd /c start) dusulur.
 */
export function resolveBrowserCommand(
  url: string,
  choice: BrowserChoice = 'default',
): { cmd: string; args: string[] } {
  const envChoice = (process.env.CLICLEANER_BROWSER ?? '').toLowerCase();
  const eff: BrowserChoice = envChoice === 'default' ? 'default' : envChoice === 'edge' ? 'edge' : choice;

  if (process.platform === 'win32') {
    if (eff === 'edge') {
      const edge = edgeCandidates().find((p) => {
        try {
          return existsSync(p);
        } catch {
          return false;
        }
      });
      if (edge) return { cmd: edge, args: [url] };
    }
    return { cmd: 'cmd.exe', args: ['/c', 'start', '', url] };
  }
  if (process.platform === 'darwin') return { cmd: 'open', args: [url] };
  return { cmd: 'xdg-open', args: [url] };
}

function openBrowser(url: string, choice: BrowserChoice = 'default'): void {
  try {
    const { cmd, args } = resolveBrowserCommand(url, choice);
    spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
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
      throw err;
    }
  })();
  return buildPromise;
}
