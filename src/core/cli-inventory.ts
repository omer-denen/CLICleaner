import { existsSync } from 'node:fs';
import { readdir, readFile, stat, utimes } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { longPath } from '../util/longpath.ts';
import { walk } from './walker.ts';
import { daysSince } from '../util/format.ts';

/**
 * Kurulu CLI envanteri ve "atillik" kaniti.
 *
 * Bu modul HICBIR uygulama adi icermez. Yalnizca paket yoneticisi
 * yerlesimlerini (node_modules + package.json, uv-receipt.toml,
 * .store, Scripts) ve komutun kendi durum klasorlerini okur.
 *
 * Kullanim kaniti katmanlari:
 *  1. Kabuk gecmisi (PowerShell/bash/zsh/fish): komut en az bir kez
 *     calistirilmis mi? Tarih yoktur; son satira yakinligi "goreli
 *     guncellik" olarak raporlanir, kesin tarih DEGIL.
 *  2. Aracin kendi durum klasoru (or. ~/.arac, %APPDATA%\arac):
 *     son yazim zamani gercek kullanim kanitidir.
 *  3. Shim dosyalarinin son erisim zamani (atime): Windows'ta
 *     "Updates Enabled" ise anlamlidir; antivirus/indexer dokunabilir.
 *     Guven duzeyi bu yuzden acikca 'high/medium/low' olarak verilir.
 *
 * Silme karari bu modulde VERILMEZ; yalnizca kanit ve oneri uretilir.
 */

import type {
  CliDuplicates,
  CliInventory,
  CliInventoryOptions,
  CliSource,
  CliStatus,
  CliTool,
  UninstallSpec,
} from './cli-inventory-types.ts';

export type {
  CliDuplicates,
  CliInventory,
  CliInventoryOptions,
  CliSource,
  CliStatus,
  CliTool,
  UninstallSpec,
} from './cli-inventory-types.ts';

const DAY = 86_400_000;
const MAX_HISTORY_BYTES = 4 * 1024 * 1024;
const MAX_STATE_ENTRIES = 300;

/** Tabandaki calisma zamanlari: bunlar "arac" degil, platformdur. */
const BASE_COMMANDS = new Set([
  'npm', 'npx', 'node', 'corepack',
  'pip', 'pip3', 'python', 'python3', 'python3.11', 'py',
  'uv', 'uvx', 'uvw',
  'dotnet',
  'git', 'git.exe',
  'powershell', 'pwsh', 'cmd', 'bash', 'wsl',
]);

const BASE_PACKAGES = new Set(['npm', 'corepack', 'pip', 'setuptools', 'wheel', 'uv']);

interface HistoryData {
  files: string[];
  lines: string[];
  lastWrite: number;
  available: boolean;
}

interface StateEvidence {
  dirs: string[];
  lastMtime: number;
  lastAtime: number;
}

/**
 * Canli akis kancalari. `emit` her arac bulundugunda cagrilir;
 * `signal` iptal edildiginde tarama en kisa surede durur.
 */
interface ScanHooks {
  emit: (tool: CliTool) => void;
  signal?: AbortSignal;
}

/** Makinedeki tum kurulu CLI'lari kanitlariyla listeler. */
export async function scanCliInventory(opts: CliInventoryOptions = {}): Promise<CliInventory> {
  const now = opts.now ?? Date.now();
  const unusedDays = Math.max(1, opts.unusedDays ?? 21);
  const notes: string[] = [];
  const roots: string[] = [];
  const hooks: ScanHooks = { emit: opts.onTool ?? (() => {}), signal: opts.signal };

  throwIfAborted(hooks.signal);

  const atime = await detectAtimeReliability();
  if (!atime.reliable) notes.push(`Son erisim zamani guvenilir degil: ${atime.detail}`);

  const history = await loadShellHistory();
  if (!history.available) notes.push('Kabuk gecmisi bulunamadi; yalnizca atime ve durum klasorleri kullanildi.');

  const found: CliTool[] = [];

  found.push(...(await scanNpmGlobal(now, unusedDays, history, atime.reliable, roots, notes, hooks)));
  throwIfAborted(hooks.signal);
  found.push(...(await scanUvTools(now, unusedDays, history, atime.reliable, roots, notes, hooks)));
  throwIfAborted(hooks.signal);
  found.push(...(await scanDotnetTools(now, unusedDays, history, atime.reliable, roots, notes, hooks)));
  throwIfAborted(hooks.signal);
  found.push(...(await scanPythonUser(now, unusedDays, history, atime.reliable, roots, notes, hooks)));

  throwIfAborted(hooks.signal);
  const coveredShims = new Set(found.flatMap((t) => t.shims.map(normPath)));
  const standalone = await scanStandaloneShims(now, unusedDays, history, atime.reliable, coveredShims, roots, hooks);
  found.push(...standalone);

  // Ayni komut ayni shim ile iki kez gelirse tekilleştir.
  const byId = new Map<string, CliTool>();
  for (const t of found) {
    const key = t.id.toLowerCase();
    if (!byId.has(key)) byId.set(key, t);
  }

  const uniqueTools = [...byId.values()];
  const duplicates = findDuplicates(uniqueTools);
  const tools = uniqueTools.sort((a, b) => {
    const rank = statusRank(a.status) - statusRank(b.status);
    return rank !== 0 ? rank : b.totalBytes - a.totalBytes;
  });

  return { scannedAt: now, unusedDays, tools, duplicates, roots: [...new Set(roots)], notes };
}

function statusRank(s: CliStatus): number {
  return s === 'unused' ? 0 : s === 'unknown' ? 1 : s === 'recent' ? 2 : 3;
}

/**
 * Ayni komutun birden fazla kaynaktan kurulmasini bulur.
 *
 * Ornek: ayni arac hem npm global hem .local/bin'de duruyorsa,
 * PATH'te hangisinin once geldigine gore biri golgede kalir.
 * Tutulacak taraf en guclu kullanim kanitina gore secilir.
 */
function findDuplicates(tools: CliTool[]): CliDuplicates[] {
  const groups = new Map<string, CliTool[]>();
  for (const t of tools) {
    if (t.status === 'protected') continue;
    const key = t.command.toLowerCase();
    const arr = groups.get(key);
    if (arr) arr.push(t);
    else groups.set(key, [t]);
  }

  const out: CliDuplicates[] = [];
  for (const [command, arr] of groups) {
    if (arr.length < 2) continue;
    const sorted = [...arr].sort((a, b) => {
      // 0) Aktif shim: gercekten cagrilan kurulum her zaman once gelir.
      const act = Number(b.activeShim === true) - Number(a.activeShim === true);
      if (act !== 0) return act;
      // 1) en son durum/erisim kaniti, 2) gecmis, 3) surum, 4) kaynak
      const state = b.lastStateAt - a.lastStateAt;
      if (state !== 0) return state;
      const access = b.lastAccessAt - a.lastAccessAt;
      if (access !== 0) return access;
      const hist = b.historyMentions - a.historyMentions;
      if (hist !== 0) return hist;
      const ver = compareVersionStrings(b.version, a.version);
      if (ver !== 0) return ver;
      return sourcePriority(b.source) - sourcePriority(a.source);
    });
    const keep = sorted[0]!;
    const remove = sorted.slice(1);
    const active = arr.find((t) => t.activeShim === true);
    out.push({
      command,
      keepId: keep.id,
      removeIds: remove.map((t) => t.id),
      ...(active ? { activeId: active.id } : {}),
      reason:
        `Ayni komut ${arr.length} kurulumda. Aktif: ${describeTool(keep)}. ` +
        `Golgede: ${remove.map(describeTool).join(', ')}.`,
    });
  }
  return out.sort((a, b) => a.command.localeCompare(b.command)).slice(0, 50);
}

/** Kullaniciya gosterilecek kisa kurulum etiketi: paket@surum [kaynak]. */
function describeTool(t: CliTool): string {
  const v = t.version ? `@${t.version}` : '';
  return `${t.packageName}${v} [${t.source}]`;
}

function sourcePriority(s: CliSource): number {
  switch (s) {
    case 'npm-global':
      return 5;
    case 'uv-tool':
      return 4;
    case 'dotnet-tool':
      return 3;
    case 'pip-user':
      return 2;
    case 'standalone':
      return 1;
  }
}

// ---------------------------------------------------------------------------
// npm global
// ---------------------------------------------------------------------------

async function scanNpmGlobal(
  now: number,
  unusedDays: number,
  history: HistoryData,
  atimeReliable: boolean,
  roots: string[],
  notes: string[],
  hooks: ScanHooks,
): Promise<CliTool[]> {
  const env = process.env;
  const prefix = env.APPDATA ? join(env.APPDATA, 'npm') : '';
  if (!prefix) return [];
  const modules = join(prefix, 'node_modules');
  if (!(await isDirectory(modules))) return [];
  roots.push(prefix);

  const npmCli = join(prefix, 'node_modules', 'npm', 'bin', 'npm-cli.js');
  const npmProgram = existsSync(longPath(npmCli)) ? process.execPath : findOnPath('npm.cmd');
  const out: CliTool[] = [];

  for (const pkgDir of await listPackageDirs(modules)) {
    throwIfAborted(hooks.signal);
    const manifest = join(pkgDir, 'package.json');
    // Manifestin atime'i OKUMADAN once alinir (observer etkisi).
    const pre = await preStat(manifest);
    const pkg = await readJson(manifest);
    if (!pkg) continue;
    const name = typeof pkg.name === 'string' ? pkg.name : '';
    if (!name) continue;
    const version = typeof pkg.version === 'string' ? pkg.version : '';
    const commands = binCommands(pkg.bin, name);

    for (const cmd of commands) {
      if (!validCommand(cmd)) continue;
      const shims = await shimPaths(prefix, cmd);
      if (shims.length === 0) continue;

      const installedAt = pre.mtime;
      // Yalnizca SHIM'lerin atime'i kullanilir. Manifesti biz okuyoruz;
      // onun atime'i kaniti kirletir (observer etkisi).
      const lastAccessAt = await maxAtime(shims);
      const state = await findStateDirs(cmd, unscoped(name));
      const usage = usageVerdict({
        now,
        unusedDays,
        command: cmd,
        source: 'npm-global',
        packageName: name,
        installedAt,
        lastAccessAt,
        state,
        history,
        atimeReliable,
      });

      const uninstall: UninstallSpec | null =
        npmProgram === null
          ? null
          : npmProgram === process.execPath
            ? {
                kind: 'npm',
                program: process.execPath,
                args: [npmCli, 'uninstall', '-g', name],
                display: `npm uninstall -g ${name}`,
              }
            : {
                kind: 'npm',
                program: npmProgram,
                args: ['uninstall', '-g', name],
                display: `npm uninstall -g ${name}`,
              };

      const tool: CliTool = {
        // Paket adi kimlige girer: ayni komutu iki paket saglayabilir
        // (or. yeni CLI + eski CLI). Ikisi de listede kalmali ki
        // cakisma analiz edilebilsin.
        id: `npm-global:${name}:${cmd}`,
        command: cmd,
        source: 'npm-global',
        packageName: name,
        version,
        installPath: pkgDir,
        shims,
        stalePaths: [],
        stateDirs: state.dirs,
        installedAt,
        lastAccessAt,
        lastStateAt: state.lastMtime,
        historyMentions: usage.mentions,
        historyLastRatio: usage.lastRatio,
        totalBytes: await sizeOf(pkgDir),
        idleDays: usage.idleDays,
        status: usage.status,
        confidence: usage.confidence,
        evidence: usage.evidence,
        uninstall,
      };
      out.push(tool);
      hooks.emit(tool);
    }
  }

  await annotateNpmShims(out, prefix);
  if (out.length === 0) notes.push(`npm global prefix bulundu ama komut eslesmedi: ${prefix}`);
  return out;
}

/**
 * Ayni komutu birden fazla paket sagliyorsa hangisinin gercekten
 * cagrildigini shim dosyasindan okur. Ornek: guncelleme sonrasi
 * eski paket kaldirilmadan kalmis olabilir; shim yeni paketi gosterir.
 *
 * Shim okumak atime'i gunceller; bu yuzden once kaydedilir, sonra
 * geri yazilir. Aksi halde envanter kendi kanitini bozar (observer etkisi).
 */
async function annotateNpmShims(tools: CliTool[], prefix: string): Promise<void> {
  const cache = new Map<string, string | null>();
  for (const tool of tools) {
    const shim = tool.shims.find((p) => p.toLowerCase().endsWith('.cmd')) ?? tool.shims[0];
    if (!shim) continue;
    let target = cache.get(shim);
    if (target === undefined) {
      target = await readShimTarget(shim, prefix);
      cache.set(shim, target);
    }
    if (!target) continue;
    tool.shimTarget = target;
    const install = normPath(tool.installPath);
    const pointed = normPath(target);
    tool.activeShim = pointed === install || pointed.startsWith(install + '\\');
    tool.evidence.push(
      tool.activeShim
        ? 'aktif shim bu kurulumu gosteriyor'
        : 'shim baska kurulumu gosteriyor (golgede kalan eski kurulum)',
    );
  }
}

/**
 * `.cmd` / `.ps1` shim'inin hedef yolunu cikarir. npm shim'i
 * `%dp0%\node_modules\<paket>\<dosya>` bicimindedir; paket scoped
 * olabilir (`@scope\paket`).
 */
async function readShimTarget(shim: string, prefix: string): Promise<string | null> {
  const before = await stat(longPath(shim)).catch(() => null);
  try {
    const txt = await readFile(longPath(shim), 'utf8');
    const m = /node_modules[\\/]((?:@[^\\/\s"']+[\\/])?[^\\/\s"']+)[\\/]([^\s"']+)/i.exec(txt);
    if (!m?.[1] || !m[2]) return null;
    const rel = `node_modules\\${m[1]}\\${m[2]}`.replace(/[\\/]+/g, '\\');
    return join(prefix, rel);
  } catch {
    return null;
  } finally {
    // Observer etkisi: shim'i okumak atime'i gunceller; geri koy.
    if (before) {
      await utimes(longPath(shim), before.atime, before.mtime).catch(() => {
        /* geri yazilamadi; atime kaniti etkilenmis olabilir */
      });
    }
  }
}

async function listPackageDirs(modules: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await readdir(longPath(modules), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('.')) continue;
    if (e.name.startsWith('@')) {
      try {
        const scoped = await readdir(longPath(join(modules, e.name)), { withFileTypes: true });
        for (const s of scoped) {
          if (s.isDirectory()) out.push(join(modules, e.name, s.name));
        }
      } catch {
        /* okunamadi */
      }
    } else {
      out.push(join(modules, e.name));
    }
  }
  return out.sort();
}

function binCommands(bin: unknown, packageName: string): string[] {
  if (typeof bin === 'string') return [unscoped(packageName)];
  if (bin && typeof bin === 'object') {
    return Object.keys(bin as Record<string, unknown>).filter(validCommand);
  }
  return [];
}

async function shimPaths(prefix: string, cmd: string): Promise<string[]> {
  const candidates = [join(prefix, `${cmd}.cmd`), join(prefix, `${cmd}.ps1`), join(prefix, cmd), join(prefix, `${cmd}.exe`)];
  const out: string[] = [];
  for (const p of candidates) {
    try {
      const st = await stat(longPath(p));
      if (st.isFile()) out.push(p);
    } catch {
      /* yok */
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// uv araclari
// ---------------------------------------------------------------------------

async function scanUvTools(
  now: number,
  unusedDays: number,
  history: HistoryData,
  atimeReliable: boolean,
  roots: string[],
  notes: string[],
  hooks: ScanHooks,
): Promise<CliTool[]> {
  const candidates = [
    process.env.APPDATA ? join(process.env.APPDATA, 'uv', 'tools') : '',
    process.env.USERPROFILE ? join(process.env.USERPROFILE, '.local', 'share', 'uv', 'tools') : '',
  ].filter(Boolean);

  const out: CliTool[] = [];
  const uv = findOnPath('uv.exe') ?? findOnPath('uv');

  for (const root of candidates) {
    if (!(await isDirectory(root))) continue;
    roots.push(root);
    let entries;
    try {
      entries = await readdir(longPath(root), { withFileTypes: true });
    } catch {
      continue;
    }

    for (const e of entries) {
      throwIfAborted(hooks.signal);
      if (!e.isDirectory() || e.name.startsWith('.')) continue;
      const toolDir = join(root, e.name);
      const receiptPath = join(toolDir, 'uv-receipt.toml');
      const pre = await preStat(receiptPath);
      if (pre.mtime === 0) continue;
      let receipt = '';
      try {
        receipt = await readFile(longPath(receiptPath), 'utf8');
      } catch {
        continue;
      }

      const pkgName =
        /requirements\s*=\s*\[\s*\{\s*name\s*=\s*"([^"]+)"/m.exec(receipt)?.[1] ?? e.name;
      const entriesMatch = [...receipt.matchAll(/name\s*=\s*"([^"]+)"\s*,\s*install-path\s*=\s*"([^"]+)"/g)];
      const shims = entriesMatch
        .map((m) => (m[2] ?? '').replace(/\//g, '\\'))
        .filter((p) => p.length > 0 && existsSync(longPath(p)));
      const command = entriesMatch[0]?.[1] ?? pkgName;
      if (!validCommand(command)) continue;

      const installedAt = pre.mtime;
      // Yalnizca SHIM'lerin atime'i kullanilir. Manifesti biz okuyoruz;
      // onun atime'i kaniti kirletir (observer etkisi).
      const lastAccessAt = await maxAtime(shims);
      const state = await findStateDirs(command, pkgName);
      const usage = usageVerdict({
        now,
        unusedDays,
        command,
        source: 'uv-tool',
        packageName: pkgName,
        installedAt,
        lastAccessAt,
        state,
        history,
        atimeReliable,
      });

      const tool: CliTool = {
        id: `uv-tool:${pkgName}:${command}`,
        command,
        source: 'uv-tool',
        packageName: pkgName,
        version: await distVersion(toolDir, pkgName),
        installPath: toolDir,
        shims,
        stalePaths: [],
        stateDirs: state.dirs,
        installedAt,
        lastAccessAt,
        lastStateAt: state.lastMtime,
        historyMentions: usage.mentions,
        historyLastRatio: usage.lastRatio,
        totalBytes: await sizeOf(toolDir),
        idleDays: usage.idleDays,
        status: usage.status,
        confidence: usage.confidence,
        evidence: usage.evidence,
        uninstall: uv
          ? {
              kind: 'uv',
              program: uv,
              args: ['tool', 'uninstall', pkgName],
              display: `uv tool uninstall ${pkgName}`,
            }
          : null,
      };
      out.push(tool);
      hooks.emit(tool);
    }
  }

  if (out.length === 0) notes.push('uv arac deposu bulunamadi veya bos.');
  return out;
}

// ---------------------------------------------------------------------------
// .NET global araclar
// ---------------------------------------------------------------------------

async function scanDotnetTools(
  now: number,
  unusedDays: number,
  history: HistoryData,
  atimeReliable: boolean,
  roots: string[],
  notes: string[],
  hooks: ScanHooks,
): Promise<CliTool[]> {
  const home = process.env.USERPROFILE;
  if (!home) return [];
  const root = join(home, '.dotnet', 'tools');
  const store = join(root, '.store');
  if (!(await isDirectory(store))) return [];
  roots.push(root);

  const dotnet = findOnPath('dotnet.exe') ?? findOnPath('dotnet');
  const out: CliTool[] = [];

  let entries;
  try {
    entries = await readdir(longPath(store), { withFileTypes: true });
  } catch {
    return [];
  }

  for (const e of entries) {
    throwIfAborted(hooks.signal);
    if (!e.isDirectory() || e.name.startsWith('.')) continue;
    const pkgName = e.name;
    const versions = await subdirs(join(store, pkgName));
    versions.sort(compareVersionStrings);
    const version = versions[versions.length - 1] ?? '';
    const installPath = join(store, pkgName, version);
    // .store icinde kalan eski surumler: ayni aracin onceki kurulumlari.
    const stalePaths = version
      ? versions.slice(0, -1).map((v) => join(store, pkgName, v))
      : [];

    const shims = [join(root, `${pkgName}.exe`), join(root, pkgName)].filter((p) => existsSync(longPath(p)));
    if (shims.length === 0) continue;

    const installedAt = (await mtime(join(installPath, `${pkgName}.deps.json`))) || (await mtime(shims[0]!));
    const lastAccessAt = await maxAtime(shims);
    const state = await findStateDirs(pkgName, pkgName);
    const usage = usageVerdict({
      now,
      unusedDays,
      command: pkgName,
      source: 'dotnet-tool',
      packageName: pkgName,
      installedAt,
      lastAccessAt,
      state,
      history,
      atimeReliable,
    });

    const tool: CliTool = {
      id: `dotnet-tool:${pkgName}`,
      command: pkgName,
      source: 'dotnet-tool',
      packageName: pkgName,
      version,
      installPath,
      shims,
      stalePaths,
      stateDirs: state.dirs,
      installedAt,
      lastAccessAt,
      lastStateAt: state.lastMtime,
      historyMentions: usage.mentions,
      historyLastRatio: usage.lastRatio,
      totalBytes: await sizeOf(installPath),
      idleDays: usage.idleDays,
      status: usage.status,
      confidence: usage.confidence,
      evidence: usage.evidence,
      uninstall: dotnet
        ? {
            kind: 'dotnet',
            program: dotnet,
            args: ['tool', 'uninstall', '--global', pkgName],
            display: `dotnet tool uninstall --global ${pkgName}`,
          }
        : null,
    };
    out.push(tool);
    hooks.emit(tool);
  }

  if (out.length === 0) notes.push('.NET arac deposu bulundu ama arac yok.');
  return out;
}

// ---------------------------------------------------------------------------
// pip --user / Python Scripts
// ---------------------------------------------------------------------------

async function scanPythonUser(
  now: number,
  unusedDays: number,
  history: HistoryData,
  atimeReliable: boolean,
  roots: string[],
  notes: string[],
  hooks: ScanHooks,
): Promise<CliTool[]> {
  const env = process.env;
  const candidates: string[] = [];
  if (env.APPDATA) {
    candidates.push(join(env.APPDATA, 'Python', 'Scripts'));
    try {
      const dirs = await readdir(longPath(join(env.APPDATA, 'Python')), { withFileTypes: true });
      for (const d of dirs) {
        if (d.isDirectory() && /^Python\d/i.test(d.name)) candidates.push(join(env.APPDATA, 'Python', d.name, 'Scripts'));
      }
    } catch {
      /* yok */
    }
  }
  if (env.LOCALAPPDATA) {
    try {
      const dirs = await readdir(longPath(join(env.LOCALAPPDATA, 'Programs', 'Python')), { withFileTypes: true });
      for (const d of dirs) {
        if (d.isDirectory() && /^Python\d/i.test(d.name)) candidates.push(join(env.LOCALAPPDATA, 'Programs', 'Python', d.name, 'Scripts'));
      }
    } catch {
      /* yok */
    }
  }

  const out: CliTool[] = [];
  for (const scripts of candidates) {
    if (!(await isDirectory(scripts))) continue;
    roots.push(scripts);
    const pyRoot = dirname(scripts);
    const site = join(pyRoot, 'Lib', 'site-packages');
    const scriptsMap = await readEntryPoints(site);
    const python = [join(pyRoot, 'python.exe'), join(pyRoot, 'python3.exe')].find((p) => existsSync(longPath(p)));

    let entries;
    try {
      entries = await readdir(longPath(scripts), { withFileTypes: true });
    } catch {
      continue;
    }

    for (const e of entries) {
      throwIfAborted(hooks.signal);
      if (!e.isFile()) continue;
      const ext = e.name.lastIndexOf('.') >= 0 ? e.name.slice(e.name.lastIndexOf('.')).toLowerCase() : '';
      if (ext !== '.exe' && ext !== '.cmd') continue;
      const cmd = e.name.slice(0, e.name.length - ext.length);
      if (!validCommand(cmd) || BASE_COMMANDS.has(cmd.toLowerCase())) continue;
      if (/^(python|pip|wheel|setuptools|uv|idle)/i.test(cmd)) continue;

      const shim = join(scripts, e.name);
      const dist = scriptsMap.get(cmd.toLowerCase());
      const installPath = dist ? join(site, dist.distInfo) : shim;
      const installedAt = await mtime(installPath);
      const lastAccessAt = await maxAtime([shim, installPath]);
      const state = await findStateDirs(cmd, dist?.packageName ?? cmd);
      const usage = usageVerdict({
        now,
        unusedDays,
        command: cmd,
        source: 'pip-user',
        packageName: dist?.packageName ?? cmd,
        installedAt,
        lastAccessAt,
        state,
        history,
        atimeReliable,
      });

      const tool: CliTool = {
        id: `pip-user:${dist?.packageName ?? cmd}:${cmd}`,
        command: cmd,
        source: 'pip-user',
        packageName: dist?.packageName ?? cmd,
        version: dist?.version ?? '',
        installPath,
        shims: [shim],
        stalePaths: [],
        stateDirs: state.dirs,
        installedAt,
        lastAccessAt,
        lastStateAt: state.lastMtime,
        historyMentions: usage.mentions,
        historyLastRatio: usage.lastRatio,
        totalBytes: await sizeOf(installPath),
        idleDays: usage.idleDays,
        status: usage.status,
        confidence: usage.confidence,
        evidence: usage.evidence,
        uninstall:
          python && dist
            ? {
                kind: 'pip',
                program: python,
                args: ['-m', 'pip', 'uninstall', '-y', dist.packageName],
                display: `python -m pip uninstall -y ${dist.packageName}`,
              }
            : null,
      };
      out.push(tool);
      hooks.emit(tool);
    }
  }

  return out;
}

async function readEntryPoints(site: string): Promise<Map<string, { packageName: string; version: string; distInfo: string }>> {
  const map = new Map<string, { packageName: string; version: string; distInfo: string }>();
  let entries;
  try {
    entries = await readdir(longPath(site), { withFileTypes: true });
  } catch {
    return map;
  }
  for (const e of entries) {
    if (!e.isDirectory() || !e.name.endsWith('.dist-info')) continue;
    const distInfo = e.name;
    const base = distInfo.slice(0, -'.dist-info'.length);
    const dash = base.lastIndexOf('-');
    const packageName = dash > 0 ? base.slice(0, dash) : base;
    const version = dash > 0 ? base.slice(dash + 1) : '';
    let txt = '';
    try {
      txt = await readFile(longPath(join(site, distInfo, 'entry_points.txt')), 'utf8');
    } catch {
      continue;
    }
    const section = /\[console_scripts\]([\s\S]*?)(?:\n\[|$)/.exec(txt)?.[1] ?? '';
    for (const line of section.split(/\r?\n/)) {
      const m = /^([^=#]+?)\s*=\s*/.exec(line.trim());
      if (m?.[1]) map.set(m[1].trim().toLowerCase(), { packageName, version, distInfo });
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Bagimsiz shim'ler (.local\bin, .cargo\bin, go\bin, .bun\bin)
// ---------------------------------------------------------------------------

async function scanStandaloneShims(
  now: number,
  unusedDays: number,
  history: HistoryData,
  atimeReliable: boolean,
  covered: Set<string>,
  roots: string[],
  hooks: ScanHooks,
): Promise<CliTool[]> {
  const home = process.env.USERPROFILE;
  if (!home) return [];
  const dirs = [
    join(home, '.local', 'bin'),
    join(home, '.cargo', 'bin'),
    join(home, 'go', 'bin'),
    join(home, '.bun', 'bin'),
  ];

  const out: CliTool[] = [];
  for (const dir of dirs) {
    if (!(await isDirectory(dir))) continue;
    roots.push(dir);
    let entries;
    try {
      entries = await readdir(longPath(dir), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      throwIfAborted(hooks.signal);
      if (!e.isFile()) continue;
      const p = join(dir, e.name);
      if (covered.has(normPath(p))) continue;
      const cmd = stripExe(e.name);
      if (!validCommand(cmd) || BASE_COMMANDS.has(cmd.toLowerCase())) continue;
      if (/^(python|pip|uv|uvx|uvw|node|npm|npx|corepack|dotnet)/i.test(cmd)) continue;

      const installedAt = await mtime(p);
      const lastAccessAt = await atimeOf(p);
      const state = await findStateDirs(cmd, cmd);
      const usage = usageVerdict({
        now,
        unusedDays,
        command: cmd,
        source: 'standalone',
        packageName: cmd,
        installedAt,
        lastAccessAt,
        state,
        history,
        atimeReliable,
      });

      const tool: CliTool = {
        id: `standalone:${cmd}`,
        command: cmd,
        source: 'standalone',
        packageName: cmd,
        version: '',
        installPath: p,
        shims: [p],
        stalePaths: [],
        stateDirs: state.dirs,
        installedAt,
        lastAccessAt,
        lastStateAt: state.lastMtime,
        historyMentions: usage.mentions,
        historyLastRatio: usage.lastRatio,
        totalBytes: (await sizeOfFile(p)) ?? 0,
        idleDays: usage.idleDays,
        status: usage.status,
        confidence: usage.confidence,
        evidence: usage.evidence,
        uninstall: null,
      };
      out.push(tool);
      hooks.emit(tool);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Kullanim kaniti
// ---------------------------------------------------------------------------

interface UsageInput {
  now: number;
  unusedDays: number;
  command: string;
  source: CliSource;
  packageName: string;
  installedAt: number;
  lastAccessAt: number;
  state: StateEvidence;
  history: HistoryData;
  atimeReliable: boolean;
}

function usageVerdict(input: UsageInput): {
  mentions: number;
  lastRatio: number;
  idleDays: number;
  status: CliStatus;
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
} {
  const { now, unusedDays, command } = input;
  const usage = findHistoryMentions(input.history, command);
  const lastStateAt = input.state.lastMtime;
  const lastSignal = Math.max(input.lastAccessAt, lastStateAt);
  const reference = lastSignal > 0 ? lastSignal : input.installedAt;
  const idleDays = reference > 0 ? daysSince(reference, now) : Number.POSITIVE_INFINITY;
  const unusedMs = unusedDays * DAY;

  const stateRecent = lastStateAt > 0 && now - lastStateAt < unusedMs;
  const historyRecent = usage.mentions > 0 && usage.lastRatio >= 0.6;
  const accessRecent = input.lastAccessAt > 0 && now - input.lastAccessAt < unusedMs;
  const protectedCmd = BASE_COMMANDS.has(command.toLowerCase()) || BASE_PACKAGES.has(input.packageName.toLowerCase());

  let status: CliStatus;
  let confidence: 'high' | 'medium' | 'low';

  if (protectedCmd) {
    status = 'protected';
    confidence = 'high';
  } else if (stateRecent || historyRecent) {
    status = 'recent';
    confidence = stateRecent ? 'high' : 'medium';
  } else if (usage.mentions > 0) {
    status = idleDays >= unusedDays ? 'unknown' : 'recent';
    confidence = 'medium';
  } else if (accessRecent && input.atimeReliable) {
    status = 'recent';
    confidence = 'medium';
  } else if (idleDays >= unusedDays) {
    status = 'unused';
    confidence =
      input.atimeReliable && input.lastAccessAt > 0
        ? lastStateAt > 0
          ? 'high'
          : 'medium'
        : lastStateAt > 0
          ? 'medium'
          : 'low';
  } else {
    status = 'unknown';
    confidence = 'low';
  }

  const evidence: string[] = [];
  if (input.installedAt > 0) evidence.push(`kurulum: ${fmtDate(input.installedAt)}`);
  if (input.lastAccessAt > 0) evidence.push(`shim son erisim: ${fmtDate(input.lastAccessAt)}`);
  if (lastStateAt > 0) evidence.push(`durum klasoru son yazim: ${fmtDate(lastStateAt)}`);
  if (usage.mentions > 0) {
    evidence.push(`kabuk gecmisinde ${usage.mentions} kez (son bahis sira %${Math.round(usage.lastRatio * 100)})`);
  } else if (input.history.available) {
    evidence.push('kabuk gecmisinde hic gecmiyor');
  }
  if (!input.atimeReliable) evidence.push('atime guvenilmez; karar durum klasoru/gecmise dayali');
  if (idleDays !== Number.POSITIVE_INFINITY && idleDays < 3650) evidence.push(`son sinyalden ${Math.floor(idleDays)} gun gecti`);

  return { mentions: usage.mentions, lastRatio: usage.lastRatio, idleDays, status, confidence, evidence };
}

async function loadShellHistory(): Promise<HistoryData> {
  const env = process.env;
  const files: string[] = [];
  const psDir = env.APPDATA ? join(env.APPDATA, 'Microsoft', 'Windows', 'PowerShell', 'PSReadLine') : '';
  if (psDir) {
    try {
      const ents = await readdir(longPath(psDir), { withFileTypes: true });
      for (const e of ents) {
        if (e.isFile() && /history\.txt$/i.test(e.name)) files.push(join(psDir, e.name));
      }
    } catch {
      /* yok */
    }
  }
  const home = env.USERPROFILE;
  if (home) {
    for (const f of ['.bash_history', '.zsh_history', join('.local', 'share', 'fish', 'fish_history')]) {
      const p = join(home, f);
      if (existsSync(longPath(p))) files.push(p);
    }
  }

  const lines: string[] = [];
  let lastWrite = 0;
  for (const f of files) {
    try {
      const st = await stat(longPath(f));
      if (st.size > MAX_HISTORY_BYTES) continue;
      lastWrite = Math.max(lastWrite, st.mtimeMs);
      const txt = await readFile(longPath(f), 'utf8');
      for (const raw of txt.split(/\r?\n/)) {
        const line = raw.replace(/^- cmd:\s*/, '').trim();
        if (line) lines.push(line);
      }
    } catch {
      /* okunamadi */
    }
  }
  return { files, lines, lastWrite, available: files.length > 0 };
}

function findHistoryMentions(history: HistoryData, command: string): { mentions: number; lastRatio: number } {
  if (history.lines.length === 0) return { mentions: 0, lastRatio: 0 };
  const esc = command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:^|[;&|]\\s*)(?:sudo\\s+)?(?:&\\s*)?(?:\\.[\\\\/])?${esc}(?:\\.exe)?(?:\\s|$)`, 'i');
  let mentions = 0;
  let last = -1;
  for (let i = 0; i < history.lines.length; i++) {
    if (re.test(history.lines[i]!)) {
      mentions++;
      last = i;
    }
  }
  return { mentions, lastRatio: last >= 0 ? (last + 1) / history.lines.length : 0 };
}

async function findStateDirs(command: string, packageBase: string): Promise<StateEvidence> {
  const env = process.env;
  const home = env.USERPROFILE;
  const appData = env.APPDATA;
  const local = env.LOCALAPPDATA;
  if (!home) return { dirs: [], lastMtime: 0, lastAtime: 0 };

  const names = [...new Set([command, packageBase, packageBase.split('/').pop() ?? packageBase])]
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && validCommand(s) && !s.includes('\\') && !s.includes('/'));

  const candidates: string[] = [];
  for (const n of names) {
    candidates.push(join(home, `.${n}`));
    candidates.push(join(home, '.config', n));
    if (appData) candidates.push(join(appData, n));
    if (local) candidates.push(join(local, n), join(local, 'Programs', n));
  }

  const dirs: string[] = [];
  let lastMtime = 0;
  let lastAtime = 0;
  const seen = new Set<string>();
  for (const dir of candidates) {
    const key = normPath(dir);
    if (seen.has(key)) continue;
    seen.add(key);
    if (!(await isDirectory(dir))) continue;
    dirs.push(dir);
    const s = await boundedStats(dir);
    lastMtime = Math.max(lastMtime, s.lastMtime);
    lastAtime = Math.max(lastAtime, s.lastAtime);
  }
  return { dirs, lastMtime, lastAtime };
}

async function boundedStats(root: string): Promise<{ lastMtime: number; lastAtime: number }> {
  let lastMtime = 0;
  let lastAtime = 0;
  let seen = 0;
  const stack = [root];
  while (stack.length > 0 && seen < MAX_STATE_ENTRIES) {
    const dir = stack.pop()!;
    let ents;
    try {
      ents = await readdir(longPath(dir), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of ents) {
      if (seen++ >= MAX_STATE_ENTRIES) break;
      const p = join(dir, e.name);
      try {
        const st = await stat(longPath(p));
        lastMtime = Math.max(lastMtime, st.mtimeMs);
        lastAtime = Math.max(lastAtime, st.atimeMs);
      } catch {
        /* yok */
      }
      if (e.isDirectory()) stack.push(p);
    }
  }
  return { lastMtime, lastAtime };
}

async function detectAtimeReliability(): Promise<{ reliable: boolean; detail: string }> {
  try {
    const exec = promisify(execFile);
    const { stdout } = await exec('fsutil.exe', ['behavior', 'query', 'disablelastaccess'], {
      timeout: 10_000,
      windowsHide: true,
    });
    // 0 = User Managed, Updates Enabled
    // 1 = User Managed, Updates Disabled
    // 2 = System Managed, Updates Enabled
    // 3 = System Managed, Updates Disabled
    const m = /DisableLastAccess\s*=\s*([0-3])/i.exec(stdout);
    const v = m?.[1] ? Number(m[1]) : -1;
    const reliable = v === 0 || v === 2 || v === -1;
    return {
      reliable,
      detail: `fsutil DisableLastAccess=${m?.[1] ?? 'bilinmiyor'} (${reliable ? 'etkin' : 'kapali'})`,
    };
  } catch {
    return { reliable: false, detail: 'fsutil okunamadi' };
  }
}

// ---------------------------------------------------------------------------
// Kucuk yardimcilar
// ---------------------------------------------------------------------------

async function isDirectory(p: string): Promise<boolean> {
  try {
    const st = await stat(longPath(p));
    return st.isDirectory();
  } catch {
    return false;
  }
}

/**
 * OKUMADAN ONCE alinan stat. Kritik: bir dosyayi readFile ile acmak
 * Windows'ta son erisim zamanini GUNCELLER. Envanter kendi kanitini
 * bozmasin diye manifestin atime'i okumadan once kaydedilir.
 */
interface PreStat {
  mtime: number;
  atime: number;
}

async function preStat(p: string): Promise<PreStat> {
  try {
    const st = await stat(longPath(p));
    return { mtime: st.mtimeMs, atime: st.atimeMs };
  } catch {
    return { mtime: 0, atime: 0 };
  }
}

async function readJson(p: string): Promise<Record<string, unknown> | null> {
  try {
    const st = await stat(longPath(p));
    if (!st.isFile() || st.size > 256 * 1024) return null;
    return JSON.parse(await readFile(longPath(p), 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function mtime(p: string): Promise<number> {
  try {
    return (await stat(longPath(p))).mtimeMs;
  } catch {
    return 0;
  }
}

async function atimeOf(p: string): Promise<number> {
  try {
    return (await stat(longPath(p))).atimeMs;
  } catch {
    return 0;
  }
}

async function maxAtime(paths: string[]): Promise<number> {
  let max = 0;
  for (const p of paths) max = Math.max(max, await atimeOf(p));
  return max;
}

async function sizeOf(p: string): Promise<number> {
  try {
    const st = await stat(longPath(p));
    if (st.isFile()) return st.size;
  } catch {
    return 0;
  }
  try {
    const w = await walk({ root: p, largeThreshold: Infinity, maxLarge: 0 });
    return w.bytes;
  } catch {
    return 0;
  }
}

async function sizeOfFile(p: string): Promise<number> {
  try {
    return (await stat(longPath(p))).size;
  } catch {
    return 0;
  }
}

async function subdirs(p: string): Promise<string[]> {
  try {
    const ents = await readdir(longPath(p), { withFileTypes: true });
    return ents.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

async function distVersion(toolDir: string, pkgName: string): Promise<string> {
  const sp = join(toolDir, 'Lib', 'site-packages');
  const norm = pkgName.toLowerCase().replace(/[-_.]+/g, '_');
  try {
    const ents = await readdir(longPath(sp), { withFileTypes: true });
    for (const e of ents) {
      if (!e.isDirectory() || !e.name.endsWith('.dist-info')) continue;
      const base = e.name.slice(0, -'.dist-info'.length);
      const m = /^(.+)-(\d[^-]*)$/.exec(base);
      if (!m?.[1] || !m[2]) continue;
      if (m[1].toLowerCase().replace(/[-_.]+/g, '_') === norm) return m[2];
    }
  } catch {
    /* yok */
  }
  return '';
}

function findOnPath(exe: string): string | null {
  const path = process.env.PATH ?? '';
  for (const dir of path.split(';')) {
    if (!dir) continue;
    const p = join(dir, exe);
    if (existsSync(longPath(p))) return p;
  }
  return null;
}

function compareVersionStrings(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((s) => Number(s) || 0);
  const pb = b.split(/[.-]/).map((s) => Number(s) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

function unscoped(name: string): string {
  const i = name.lastIndexOf('/');
  return i >= 0 ? name.slice(i + 1) : name;
}

function stripExe(name: string): string {
  return name.replace(/\.(exe|cmd|ps1|bat)$/i, '');
}

function validCommand(cmd: string): boolean {
  return /^[a-z0-9][a-z0-9._@-]*$/i.test(cmd) && cmd.length <= 80;
}

function normPath(p: string): string {
  return p.replace(/\//g, '\\').toLowerCase();
}

/**
 * Iptal sinyali geldiyse AbortError firlatir. Donguler bunu her
 * aracdan once cagirir; boylece iptal, suren bir boyut olcumunun
 * bitmesini beklemek zorunda kalmadan en kisa surede etkili olur.
 */
function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  const err = new Error('Envanter taramasi iptal edildi');
  err.name = 'AbortError';
  throw err;
}

function fmtDate(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
