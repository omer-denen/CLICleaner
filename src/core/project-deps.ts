import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { longPath } from '../util/longpath.ts';
import { walk } from './walker.ts';
import { gitTrackerFor } from './git.ts';

/**
 * Proje bagimlilik motoru.
 *
 * Hedef: `node_modules`, `.venv`, `target`, `bin/obj` gibi YENIDEN
 * URETILEBILIR klasorleri "tarif + sil, gerekince yeniden kur"
 * yaklasimiyla ele almak. Tarif (recipe) lockfile hash'i, ekosistem,
 * calisma zamani ve kurulum komutunu icerir; kimlik bilgisi SAKLANMAZ.
 *
 * Onemli: bu motor tek basina silmez. `mode` ve `regenerable` karari
 * plan katmanina girdi olur; kasa/geri yukleme yine yurütme motorundadir.
 */

export type Ecosystem =
  | 'npm'
  | 'pnpm'
  | 'yarn'
  | 'bun'
  | 'python'
  | 'python-uv'
  | 'python-poetry'
  | 'python-pipenv'
  | 'dotnet'
  | 'rust'
  | 'unknown';

export type ProjectCleanupMode = 'recipe' | 'vault' | 'cache-only';

export interface ProjectRecipe {
  version: 1;
  ecosystem: Ecosystem;
  projectRoot: string;
  /** Silinecek/degistirilecek yollar (proje koku altinda). */
  artifactPaths: string[];
  /** Silmeye dahil edilmeyen, yalnizca onbellek temizligi yollar. */
  cachePaths: string[];
  manifest: string | null;
  lockfile: string | null;
  lockfileHash: string | null;
  /** Calisma zamani adi + surumu (varsa). */
  runtime: { name: string; version: string | null; installed: boolean };
  installCommand: string;
  verifyCommand: string | null;
  createdAt: number;
}

export interface ProjectArtifact {
  projectRoot: string;
  artifactPath: string;
  artifactName: 'node_modules' | '.venv' | 'venv' | 'target' | 'bin' | 'obj' | 'packages';
  ecosystem: Ecosystem;
  packageManager: string;
  manifest: string | null;
  lockfile: string | null;
  lockfileHash: string | null;
  monorepo: boolean;
  workspaceRoot: string | null;
  patches: boolean;
  localDeps: boolean;
  lockfileTracked: boolean;
  artifactTracked: boolean;
  runtimeInstalled: boolean;
  runtime: { name: string; version: string | null; installed: boolean };
  recentlyActive: boolean;
  idleDays: number;
  processRunning: boolean;
  bytes: number;
  /** pnpm hardlink etkisi sonrasi gercekci kazanc. */
  realisticBytes: number;
  regenerable: boolean;
  risks: string[];
  recipe: ProjectRecipe;
}

export interface ProjectPlan {
  mode: ProjectCleanupMode;
  projects: ProjectArtifact[];
  totalBytes: number;
  realisticBytes: number;
  blocked: Array<{ artifactPath: string; reason: string }>;
  warnings: string[];
}

const ARTIFACT_NAMES = new Set(['node_modules', '.venv', 'venv', 'target', 'bin', 'obj', 'packages']);

async function pathStat(p: string): Promise<Awaited<ReturnType<typeof stat>> | null> {
  try {
    return await stat(longPath(p));
  } catch {
    return null;
  }
}

async function listFiles(dir: string): Promise<string[]> {
  try {
    return await readdir(longPath(dir));
  } catch {
    return [];
  }
}

export async function hashFile(file: string): Promise<string | null> {
  try {
    const buf = await readFile(longPath(file));
    return createHash('sha256').update(buf).digest('hex');
  } catch {
    return null;
  }
}

/** Proje kokunde lockfile/manifest imzasindan ekosistem secer. */
export async function detectEcosystem(root: string): Promise<{
  ecosystem: Ecosystem;
  packageManager: string;
  manifest: string | null;
  lockfile: string | null;
  workspaceRoot: string | null;
  monorepo: boolean;
}> {
  const files = new Set(await listFiles(root));
  const has = (...names: string[]) => names.some((n) => files.has(n));

  let ecosystem: Ecosystem = 'unknown';
  let packageManager = '';
  let manifest: string | null = null;
  let lockfile: string | null = null;

  if (files.has('pnpm-lock.yaml')) {
    ecosystem = 'pnpm';
    packageManager = 'pnpm';
    lockfile = 'pnpm-lock.yaml';
  } else if (has('package-lock.json', 'npm-shrinkwrap.json')) {
    ecosystem = 'npm';
    packageManager = 'npm';
    lockfile = files.has('npm-shrinkwrap.json') ? 'npm-shrinkwrap.json' : 'package-lock.json';
  } else if (files.has('yarn.lock')) {
    ecosystem = 'yarn';
    packageManager = 'yarn';
    lockfile = 'yarn.lock';
  } else if (has('bun.lock', 'bun.lockb')) {
    ecosystem = 'bun';
    packageManager = 'bun';
    lockfile = files.has('bun.lock') ? 'bun.lock' : 'bun.lockb';
  } else if (files.has('uv.lock')) {
    ecosystem = 'python-uv';
    packageManager = 'uv';
    lockfile = 'uv.lock';
  } else if (files.has('poetry.lock')) {
    ecosystem = 'python-poetry';
    packageManager = 'poetry';
    lockfile = 'poetry.lock';
  } else if (files.has('Pipfile.lock')) {
    ecosystem = 'python-pipenv';
    packageManager = 'pipenv';
    lockfile = 'Pipfile.lock';
  } else if (has('pyproject.toml', 'requirements.txt', 'setup.py', 'Pipfile')) {
    ecosystem = 'python';
    packageManager = 'pip';
    lockfile = files.has('requirements.txt') ? 'requirements.txt' : null;
  } else if (files.has('Cargo.toml')) {
    ecosystem = 'rust';
    packageManager = 'cargo';
    lockfile = files.has('Cargo.lock') ? 'Cargo.lock' : null;
  } else if (
    files.has('packages.lock.json') ||
    files.has('Directory.Build.props') ||
    files.has('global.json') ||
    [...files].some((f) => f.endsWith('.sln') || f.endsWith('.csproj'))
  ) {
    ecosystem = 'dotnet';
    packageManager = 'dotnet';
    lockfile = files.has('packages.lock.json') ? 'packages.lock.json' : null;
  }

  for (const candidate of ['package.json', 'pyproject.toml', 'requirements.txt', 'setup.py', 'Pipfile', 'Cargo.toml']) {
    if (files.has(candidate)) {
      manifest = candidate;
      break;
    }
  }
  if (!manifest) {
    const proj = [...files].find((f) => f.endsWith('.csproj'));
    if (proj) manifest = proj;
  }

  // Monorepo: package.json workspaces / pnpm-workspace.yaml / turbo.json / nx.json
  let monorepo = false;
  let workspaceRoot: string | null = null;
  if (files.has('pnpm-workspace.yaml') || files.has('turbo.json') || files.has('nx.json') || files.has('lerna.json')) {
    monorepo = true;
    workspaceRoot = root;
  } else if (files.has('package.json')) {
    try {
      const pkg = JSON.parse(await readFile(longPath(join(root, 'package.json')), 'utf8')) as {
        workspaces?: unknown;
      };
      if (pkg.workspaces !== undefined) {
        monorepo = true;
        workspaceRoot = root;
      }
    } catch {
      /* bozuk package.json: monorepo kabul edilmez */
    }
  }

  return { ecosystem, packageManager, manifest, lockfile, workspaceRoot, monorepo };
}

async function detectLocalDeps(root: string, manifest: string | null): Promise<boolean> {
  if (!manifest || manifest !== 'package.json') return false;
  try {
    const pkg = JSON.parse(await readFile(longPath(join(root, manifest)), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      resolutions?: Record<string, string>;
      overrides?: Record<string, string>;
    };
    const values = [
      ...Object.values(pkg.dependencies ?? {}),
      ...Object.values(pkg.devDependencies ?? {}),
      ...Object.values(pkg.optionalDependencies ?? {}),
      ...Object.values(pkg.peerDependencies ?? {}),
      ...Object.values(pkg.resolutions ?? {}),
      ...Object.values(pkg.overrides ?? {}),
    ];
    return values.some((v) =>
      /^(file:|link:|workspace:|portal:|git\+|github:|https?:\/\/.+\.git)/i.test(String(v)),
    );
  } catch {
    return false;
  }
}

async function hasPatches(root: string): Promise<boolean> {
  if (await pathStat(join(root, 'patches'))) return true;
  try {
    const pkg = JSON.parse(await readFile(longPath(join(root, 'package.json')), 'utf8')) as {
      pnpm?: { patchedDependencies?: unknown };
      patch?: unknown;
    };
    return pkg.pnpm?.patchedDependencies !== undefined || pkg.patch !== undefined;
  } catch {
    return false;
  }
}

/** PATH'te calistirilabilir var mi? (where.exe; dosya sistemi taramasi yapmaz) */
export function commandExists(command: string): Promise<boolean> {
  return new Promise((ok) => {
    const child = spawn('where.exe', [command], { windowsHide: true });
    child.once('error', () => ok(false));
    child.once('close', (code) => ok(code === 0));
  });
}

function runtimeFor(ecosystem: Ecosystem): { name: string; command: string } {
  switch (ecosystem) {
    case 'npm':
      return { name: 'node', command: 'node' };
    case 'pnpm':
      return { name: 'pnpm', command: 'pnpm' };
    case 'yarn':
      return { name: 'yarn', command: 'yarn' };
    case 'bun':
      return { name: 'bun', command: 'bun' };
    case 'python':
    case 'python-uv':
    case 'python-poetry':
    case 'python-pipenv':
      return { name: 'python', command: 'python' };
    case 'dotnet':
      return { name: 'dotnet', command: 'dotnet' };
    case 'rust':
      return { name: 'cargo', command: 'cargo' };
    default:
      return { name: 'unknown', command: '' };
  }
}

const versionCache = new Map<string, string | null>();

/** Calisma zamani surumunu `--version` ile okur (en fazla 2 sn). */
async function runtimeVersion(command: string): Promise<string | null> {
  if (!command) return null;
  if (command === 'node') return process.version;
  if (versionCache.has(command)) return versionCache.get(command) ?? null;
  const value = await new Promise<string | null>((ok) => {
    const child = spawn(command, ['--version'], { windowsHide: true });
    let out = '';
    const timer = setTimeout(() => {
      child.kill();
      ok(null);
    }, 2000);
    child.stdout.on('data', (b: Buffer) => {
      out += b.toString('utf8');
      if (out.length > 256) out = out.slice(0, 256);
    });
    child.once('error', () => {
      clearTimeout(timer);
      ok(null);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      const v = out.trim().split(/\r?\n/)[0]?.trim() ?? '';
      ok(code === 0 && v ? v : null);
    });
  });
  versionCache.set(command, value);
  return value;
}

function installCommandFor(ecosystem: Ecosystem, lockfile: string | null): string {
  switch (ecosystem) {
    case 'npm':
      return lockfile ? 'npm ci' : 'npm install';
    case 'pnpm':
      return lockfile ? 'pnpm install --frozen-lockfile' : 'pnpm install';
    case 'yarn':
      return lockfile ? 'yarn install --immutable' : 'yarn install';
    case 'bun':
      return lockfile ? 'bun install --frozen-lockfile' : 'bun install';
    case 'python-uv':
      return 'uv sync --frozen';
    case 'python-poetry':
      return 'poetry install --no-root';
    case 'python-pipenv':
      return 'pipenv sync --dev';
    case 'python':
      return lockfile === 'requirements.txt'
        ? 'python -m pip install -r requirements.txt'
        : 'python -m pip install -e .';
    case 'dotnet':
      return 'dotnet restore';
    case 'rust':
      return 'cargo fetch';
    default:
      return '';
  }
}

function verifyCommandFor(ecosystem: Ecosystem): string | null {
  switch (ecosystem) {
    case 'npm':
      return 'npm ls --depth=0';
    case 'pnpm':
      return 'pnpm list --depth=0';
    case 'yarn':
      return 'yarn list --depth=0';
    case 'bun':
      return 'bun pm ls';
    case 'dotnet':
      return 'dotnet build --no-restore';
    case 'rust':
      return 'cargo check';
    default:
      return null;
  }
}

async function findProjectRoot(start: string): Promise<string> {
  let cur = resolve(start);
  for (let i = 0; i < 6; i++) {
    const files = new Set(await listFiles(cur));
    if (
      [...files].some(
        (f) =>
          ['package.json', 'pyproject.toml', 'requirements.txt', 'Cargo.toml', 'Pipfile'].includes(f) ||
          f.endsWith('.csproj') ||
          f.endsWith('.sln'),
      )
    ) {
      return cur;
    }
    const up = dirname(cur);
    if (up === cur) break;
    cur = up;
  }
  return resolve(start);
}

/** Bir dizindeki (ve alt proje koklerindeki) yeniden uretilebilir klasorler. */
export async function findArtifacts(root: string, maxDepth = 3): Promise<string[]> {
  const out: string[] = [];
  const queue: Array<{ dir: string; depth: number }> = [{ dir: resolve(root), depth: 0 }];
  while (queue.length > 0) {
    const { dir, depth } = queue.shift()!;
    const entries = await readdir(longPath(dir), { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const full = join(dir, e.name);
      if (e.name === '.git') continue;
      if (ARTIFACT_NAMES.has(e.name)) {
        // .NET'te bin/obj yalnizca proje dosyasi varsa artefakttir.
        out.push(full);
        continue;
      }
      if (depth < maxDepth) queue.push({ dir: full, depth: depth + 1 });
    }
  }
  return out;
}

/** Tek proje kokunu analiz eder; silme yapmaz. */
export async function analyzeProject(
  start: string,
  opts: { now?: number; recentDays?: number; processRunning?: boolean } = {},
): Promise<ProjectArtifact[]> {
  const now = opts.now ?? Date.now();
  const recentMs = (opts.recentDays ?? 3) * 86_400_000;
  const projectRoot = await findProjectRoot(start);
  const eco = await detectEcosystem(projectRoot);
  const artifacts = await findArtifacts(projectRoot);
  const out: ProjectArtifact[] = [];
  const git = gitTrackerFor(projectRoot);

  for (const artifactPath of artifacts) {
    const name = artifactPath.split(/[\\/]/).pop() as ProjectArtifact['artifactName'];
    // .NET bin/obj disinda kalanlar ekosistemle uyumlu mu?
    if (name === 'node_modules' && !['npm', 'pnpm', 'yarn', 'bun'].includes(eco.ecosystem)) continue;
    if ((name === '.venv' || name === 'venv') && !eco.ecosystem.startsWith('python')) continue;
    if (name === 'target' && eco.ecosystem !== 'rust') continue;
    if ((name === 'bin' || name === 'obj') && eco.ecosystem !== 'dotnet') continue;

    const st = await pathStat(artifactPath);
    if (!st) continue;
    const w = await walk({ root: artifactPath, largeThreshold: Infinity, maxLarge: 0 });
    const lockfilePath = eco.lockfile ? join(projectRoot, eco.lockfile) : null;
    const lockfileHash = lockfilePath ? await hashFile(lockfilePath) : null;
    const artifactTracked = git.size > 0 && git.isTrackedAnyUnder(artifactPath);
    const lockfileTracked = eco.lockfile ? git.isTracked(join(projectRoot, eco.lockfile)) : false;
    const patches = await hasPatches(projectRoot);
    const localDeps = await detectLocalDeps(projectRoot, eco.manifest);
    const runtime = runtimeFor(eco.ecosystem);
    const runtimeInstalled = runtime.command ? await commandExists(runtime.command) : false;
    const runtimeVer = runtimeInstalled ? await runtimeVersion(runtime.command) : null;
    const idleDays =
      st.mtimeMs > 0 ? Math.max(0, Math.floor((now - Number(st.mtimeMs)) / 86_400_000)) : -1;
    const recentlyActive = idleDays >= 0 && idleDays < (opts.recentDays ?? 3);

    const risks: string[] = [];
    if (!eco.lockfile) risks.push('lockfile yok: surumler sabit degil');
    if (patches) risks.push('yamalar (patches) var: yeniden kurulum ayni sonucu vermeyebilir');
    if (localDeps) risks.push('yerel/ozel bagimlilik var: yeniden kurulum basarisiz olabilir');
    if (runtime.command && !runtimeInstalled) risks.push(`${runtime.name} kurulu degil`);
    if (recentlyActive) risks.push(`son ${opts.recentDays ?? 3} gunde kullanilmis`);
    if (opts.processRunning) risks.push('calisan surec bu klasoru kullaniyor');
    if (artifactTracked) risks.push('artifact git tarafindan takip ediliyor');
    if (!lockfileTracked && eco.lockfile) risks.push('lockfile git tarafindan izlenmiyor (yeniden uretilebilirlik zayif)');

    const regenerable =
      Boolean(eco.lockfile) &&
      Boolean(lockfileHash) &&
      !patches &&
      !localDeps &&
      !recentlyActive &&
      !opts.processRunning &&
      !artifactTracked &&
      (runtime.command === '' || runtimeInstalled);

    const recipe: ProjectRecipe = {
      version: 1,
      ecosystem: eco.ecosystem,
      projectRoot,
      artifactPaths: [artifactPath],
      cachePaths: [],
      manifest: eco.manifest ? join(projectRoot, eco.manifest) : null,
      lockfile: lockfilePath,
      lockfileHash,
      runtime: { name: runtime.name, version: runtimeVer, installed: runtimeInstalled },
      installCommand: installCommandFor(eco.ecosystem, eco.lockfile),
      verifyCommand: verifyCommandFor(eco.ecosystem),
      createdAt: now,
    };

    // pnpm: node_modules store'a hardlink'tir; silmek gercek alani
    // sanildigi kadar bosaltmaz. Gercekci tahmin ~%10.
    const realisticBytes = eco.ecosystem === 'pnpm' ? Math.round(w.bytes * 0.1) : w.bytes;

    out.push({
      projectRoot,
      artifactPath,
      artifactName: name,
      ecosystem: eco.ecosystem,
      packageManager: eco.packageManager,
      manifest: eco.manifest ? join(projectRoot, eco.manifest) : null,
      lockfile: lockfilePath,
      lockfileHash,
      monorepo: eco.monorepo,
      workspaceRoot: eco.workspaceRoot,
      patches,
      localDeps,
      lockfileTracked,
      artifactTracked,
      runtimeInstalled,
      runtime: { name: runtime.name, version: runtimeVer, installed: runtimeInstalled },
      recentlyActive,
      idleDays,
      processRunning: opts.processRunning === true,
      bytes: w.bytes,
      realisticBytes,
      regenerable,
      risks,
      recipe,
    });
  }
  return out;
}

/** Analiz sonucundan plan; riskli olanlar kasa moduna yonlendirilir. */
export function planProjectCleanup(
  projects: ProjectArtifact[],
  mode: ProjectCleanupMode = 'recipe',
): ProjectPlan {
  const blocked: ProjectPlan['blocked'] = [];
  const warnings: string[] = [];
  const planned: ProjectArtifact[] = [];

  for (const p of projects) {
    if (!p.regenerable && mode !== 'vault') {
      blocked.push({
        artifactPath: p.artifactPath,
        reason: p.risks[0] ?? 'yeniden uretilebilirlik kanitlanamadi',
      });
      continue;
    }
    planned.push(p);
  }
  if (mode === 'cache-only') {
    warnings.push('cache-only modunda yalnizca paket onbellekleri temizlenir; artifact klasorleri korunur.');
  }
  if (mode === 'vault') {
    warnings.push('vault modunda artifact klasoru kasaya TASINIR; buyuk olabilir ve once disk alani kontrol edilir.');
  }

  return {
    mode,
    projects: planned,
    totalBytes: planned.reduce((a, p) => a + p.bytes, 0),
    realisticBytes: planned.reduce((a, p) => a + p.realisticBytes, 0),
    blocked,
    warnings,
  };
}

export interface RestoreResult {
  ok: boolean;
  projectRoot: string;
  command: string;
  output: string;
  error?: string;
}

/** Tarifi calistirir: donmus lockfile modunda kurulum + dogrulama. */
export async function runProjectRecipe(
  recipe: ProjectRecipe,
  opts: { onLine?: (line: string) => void; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<RestoreResult> {
  const command = recipe.installCommand;
  if (!command) {
    return { ok: false, projectRoot: recipe.projectRoot, command, output: '', error: 'kurulum komutu bilinmiyor' };
  }
  const lines: string[] = [];
  const shell = process.env.COMSPEC ?? 'cmd.exe';
  const code = await new Promise<number | null>((resolvePromise) => {
    const child = spawn(shell, ['/d', '/s', '/c', command], {
      cwd: recipe.projectRoot,
      windowsHide: true,
      env: { ...process.env, CI: '1' },
    });
    const timeout = setTimeout(() => {
      child.kill();
      resolvePromise(null);
    }, opts.timeoutMs ?? 10 * 60_000);
    const onAbort = () => child.kill();
    opts.signal?.addEventListener('abort', onAbort, { once: true });
    const push = (buf: Buffer) => {
      const text = buf.toString('utf8');
      lines.push(text);
      for (const line of text.split(/\r?\n/)) if (line.trim()) opts.onLine?.(line);
    };
    child.stdout.on('data', push);
    child.stderr.on('data', push);
    child.once('error', (err) => {
      lines.push(String(err));
      clearTimeout(timeout);
      resolvePromise(null);
    });
    child.once('close', (c) => {
      clearTimeout(timeout);
      opts.signal?.removeEventListener('abort', onAbort);
      resolvePromise(c);
    });
  });

  const output = lines.join('');
  if (code !== 0) {
    return {
      ok: false,
      projectRoot: recipe.projectRoot,
      command,
      output,
      error: code === null ? 'kurulum baslatilamadi/zaman asimi' : `cikis kodu ${code}`,
    };
  }

  let verified = true;
  if (recipe.verifyCommand) {
    const v = await new Promise<number | null>((resolvePromise) => {
      const child = spawn(shell, ['/d', '/s', '/c', recipe.verifyCommand!], {
        cwd: recipe.projectRoot,
        windowsHide: true,
      });
      child.once('error', () => resolvePromise(null));
      child.once('close', (c) => resolvePromise(c));
    });
    verified = v === 0;
  }
  return {
    ok: verified,
    projectRoot: recipe.projectRoot,
    command,
    output,
    ...(verified ? {} : { error: 'kurulum sonrasi dogrulama basarisiz' }),
  };
}

/** Toplu geri kurulum: sinirli eszamanlilik (varsayilan 2). */
export async function restoreProjects(
  recipes: ProjectRecipe[],
  opts: { concurrency?: number; onLine?: (root: string, line: string) => void } = {},
): Promise<RestoreResult[]> {
  const queue = [...recipes];
  const out: RestoreResult[] = [];
  const workers = Array.from({ length: Math.min(opts.concurrency ?? 2, queue.length || 1) }, async () => {
    for (;;) {
      const r = queue.shift();
      if (!r) return;
      out.push(
        await runProjectRecipe(r, {
          onLine: (line) => opts.onLine?.(r.projectRoot, line),
        }),
      );
    }
  });
  await Promise.all(workers);
  return out;
}
