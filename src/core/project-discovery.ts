import { readdir, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { longPath } from '../util/longpath.ts';
import type { ProjectCandidateView, ProjectDiscoverResponse } from './contract.ts';

/**
 * PROJE KESFI — SALT OKUNUR.
 *
 * Verilen kokler altinda proje depolarini KANITTAN tanir: `.git`,
 * `package.json`, `pyproject.toml`, `Cargo.toml`, `*.sln`, `go.mod` ...
 * Uygulama adi ARANMAZ. Hicbir yol silinmez, hedef uretilmez.
 *
 * Agir analiz (artifact boyutu, lockfile hash'i) BURADA yapilmaz; kart
 * detayi `ProjectService.analyze()` ile istenir. Boylece "projelerim"
 * listesi saniyeler degil, milisaniyeler icinde acilir.
 */

const PROJECT_MARKERS = new Set([
  'package.json',
  'pyproject.toml',
  'requirements.txt',
  'setup.py',
  'Pipfile',
  'Cargo.toml',
  'go.mod',
  'composer.json',
  'Gemfile',
]);

const DOTNET_RE = /\.(sln|csproj|fsproj|vbproj)$/i;

const LOCKFILES = [
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
  'uv.lock',
  'poetry.lock',
  'Pipfile.lock',
  'packages.lock.json',
  'Cargo.lock',
  'go.sum',
  'composer.lock',
  'Gemfile.lock',
];

/** Kesif sirasinda ICINE GIRILMEYEN klasorler (artifact / VCS / ajan). */
const SKIP_DIRS = new Set([
  'node_modules',
  '.venv',
  'venv',
  'target',
  'dist',
  'build',
  'obj',
  'bin',
  '.git',
  '.next',
  '.turbo',
  '.cache',
  '.pnpm-store',
  'skills',
]);

export interface ProjectDiscoveryOptions {
  /** Kokten kac seviye derine inilir (varsayilan 3). */
  maxDepth?: number;
  /** Toplam proje siniri (varsayilan 200). */
  maxProjects?: number;
  /** Ek olarak atlanacak mutlak yollar. */
  exclude?: string[];
}

interface Entry {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
}

async function listDir(dir: string): Promise<Entry[] | null> {
  try {
    const entries = await readdir(longPath(dir), { withFileTypes: true });
    return entries.map((e) => ({
      name: e.name,
      isDirectory: e.isDirectory(),
      isFile: e.isFile(),
    }));
  } catch {
    return null;
  }
}

function markersOf(names: Set<string>): string[] {
  const out: string[] = [];
  if (names.has('.git')) out.push('git');
  for (const m of PROJECT_MARKERS) {
    if (names.has(m)) out.push(m);
  }
  for (const n of names) {
    if (DOTNET_RE.test(n)) {
      out.push('.NET');
      break;
    }
  }
  return out;
}

async function hasSkillFile(dir: string): Promise<boolean> {
  const entries = await listDir(join(dir, 'skills'));
  if (!entries) return false;
  for (const e of entries) {
    if (!e.isDirectory) continue;
    const inner = await listDir(join(dir, 'skills', e.name));
    if (inner?.some((x) => x.isFile && x.name === 'SKILL.md')) return true;
  }
  return false;
}

async function lastActivity(paths: string[]): Promise<number | null> {
  let max: number | null = null;
  for (const p of paths.slice(0, 12)) {
    try {
      const s = await stat(longPath(p));
      if (max === null || s.mtimeMs > max) max = s.mtimeMs;
    } catch {
      /* yol yok; digerlerine bak */
    }
  }
  return max;
}

async function candidate(dir: string, entries: Entry[]): Promise<ProjectCandidateView> {
  const names = new Set(entries.map((e) => e.name));
  const markers = markersOf(names);
  const artifacts: string[] = [];
  for (const a of ['node_modules', '.venv', 'venv', 'target']) {
    if (names.has(a)) artifacts.push(a);
  }
  if (markers.includes('.NET')) {
    for (const a of ['bin', 'obj', 'packages']) if (names.has(a)) artifacts.push(a);
  }

  const lockfile = LOCKFILES.find((l) => names.has(l)) ?? null;
  const agentWorkspace =
    names.has('.skill-lock.json') ||
    names.has('SKILL.md') ||
    (names.has('skills') && (await hasSkillFile(dir)));

  const markerPaths = markers
    .filter((m) => m !== 'git' && m !== '.NET')
    .map((m) => join(dir, m));
  const activity = await lastActivity([
    ...markerPaths,
    ...(lockfile ? [join(dir, lockfile)] : []),
    ...artifacts.map((a) => join(dir, a)),
    join(dir, '.git'),
  ]);

  return {
    root: dir,
    name: basename(dir),
    markers,
    git: names.has('.git'),
    agentWorkspace,
    artifacts,
    lockfile,
    lastActivityAt: activity,
  };
}

/**
 * Kokler altindaki proje adaylarini bulur.
 *
 * Bir klasor proje isareti tasiyorsa **orada durulur**: monorepo alt
 * paketleri ayri kart olmaz; onlari `analyzeProject()` cozer. Boylece
 * `node_modules/foo` gibi binlerce sahte "proje" olusmaz.
 */
export async function discoverProjects(
  roots: string[],
  opts: ProjectDiscoveryOptions = {},
): Promise<ProjectDiscoverResponse> {
  const maxDepth = Math.max(0, opts.maxDepth ?? 3);
  const maxProjects = Math.max(1, opts.maxProjects ?? 200);
  const exclude = new Set((opts.exclude ?? []).map((p) => resolve(p)));
  const seen = new Set<string>();
  const projects: ProjectCandidateView[] = [];
  let skipped = 0;
  let truncated = false;

  const walk = async (dir: string, depth: number): Promise<void> => {
    if (truncated || projects.length >= maxProjects) {
      truncated = true;
      return;
    }
    const key = resolve(dir).toLowerCase();
    if (seen.has(key) || exclude.has(resolve(dir))) return;
    seen.add(key);

    const entries = await listDir(dir);
    if (!entries) {
      skipped++;
      return;
    }

    const names = new Set(entries.map((e) => e.name));
    const markers = markersOf(names);
    const isProject = markers.length > 0;

    if (isProject) {
      if (projects.length >= maxProjects) {
        truncated = true;
        return;
      }
      projects.push(await candidate(dir, entries));
      return;
    }

    if (depth >= maxDepth) return;

    for (const e of entries) {
      if (!e.isDirectory) continue;
      if (SKIP_DIRS.has(e.name)) continue;
      if (e.name.startsWith('.')) continue;
      await walk(join(dir, e.name), depth + 1);
      if (truncated) return;
    }
  };

  for (const root of roots) {
    await walk(resolve(root), 0);
    if (truncated) break;
  }

  projects.sort(
    (a, b) => (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0) || a.name.localeCompare(b.name),
  );

  return {
    roots: roots.map((r) => resolve(r)),
    projects,
    truncated,
    skipped,
  };
}
