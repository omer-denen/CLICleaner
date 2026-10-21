import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ProjectCandidateView } from '../src/core/contract.ts';
import type { ProjectArtifact, ProjectPlan, ProjectRecipe } from '../src/core/project-deps.ts';
import { ProjectAnalysis, ProjectList } from '../src/core/project-view.ts';

function candidate(
  overrides: Partial<ProjectCandidateView> & { name: string; root: string },
): ProjectCandidateView {
  return {
    markers: ['package.json'],
    git: false,
    agentWorkspace: false,
    artifacts: [],
    lockfile: null,
    lastActivityAt: null,
    ...overrides,
  };
}

const alpha = candidate({
  name: 'alpha',
  root: 'C:\\repos\\alpha',
  markers: ['git', 'package.json'],
  git: true,
  artifacts: ['node_modules'],
  lockfile: 'package-lock.json',
  lastActivityAt: 100,
});
const beta = candidate({
  name: 'beta',
  root: 'C:\\repos\\beta',
  markers: ['pyproject.toml'],
  agentWorkspace: true,
  artifacts: ['.venv'],
  lockfile: 'uv.lock',
  lastActivityAt: 300,
});
const gamma = candidate({
  name: 'gamma',
  root: 'D:\\work\\gamma',
  markers: ['Cargo.toml'],
  lastActivityAt: 200,
});

const projects = [alpha, beta, gamma];

test('proje listesi: sekme sayimlari ve filtre', () => {
  const list = new ProjectList(projects);
  assert.deepEqual(list.counts(), { all: 3, artifacts: 2, git: 1, agent: 1 });

  assert.deepEqual(
    list.view({ tab: 'artifacts' }).projects.map((p) => p.name),
    ['beta', 'alpha'],
  );
  assert.deepEqual(
    list.view({ tab: 'git' }).projects.map((p) => p.name),
    ['alpha'],
  );
  assert.deepEqual(
    list.view({ tab: 'agent' }).projects.map((p) => p.name),
    ['beta'],
  );
  assert.equal(list.view({ tab: 'all' }).projects.length, 3);
});

test('proje listesi: arama ad, yol, isaret ve lockfile kapsar', () => {
  const list = new ProjectList(projects);
  assert.deepEqual(
    list.view({ text: 'ALPHA' }).projects.map((p) => p.name),
    ['alpha'],
  );
  assert.deepEqual(
    list.view({ text: 'd:\\work' }).projects.map((p) => p.name),
    ['gamma'],
  );
  assert.deepEqual(
    list.view({ text: 'uv.lock' }).projects.map((p) => p.name),
    ['beta'],
  );
  assert.deepEqual(
    list.view({ text: 'cargo' }).projects.map((p) => p.name),
    ['gamma'],
  );
  assert.equal(list.view({ text: 'yok' }).projects.length, 0);
});

test('proje listesi: siralama ve ozet MOTORDAN gelir', () => {
  const list = new ProjectList(projects);

  assert.deepEqual(
    list.view({ sort: 'recent' }).projects.map((p) => p.name),
    ['beta', 'gamma', 'alpha'],
  );
  assert.deepEqual(
    list.view({ sort: 'name' }).projects.map((p) => p.name),
    ['alpha', 'beta', 'gamma'],
  );

  const view = list.view({ tab: 'artifacts' });
  assert.equal(view.summary.total, 3);
  assert.equal(view.summary.visible, 2);
  assert.equal(view.summary.withArtifacts, 2);
  assert.equal(view.summary.git, 1);
  assert.equal(view.summary.agentWorkspace, 1);
  assert.equal(view.summary.lockfile, 2);
  assert.equal(view.text, '');
  assert.equal(view.tab, 'artifacts');
  assert.equal(view.sort, 'recent');
});

test('bilinmeyen sekme/siralama guvenli varsayilana duser', () => {
  const view = new ProjectList(projects).view({
    tab: 'bozuk' as never,
    sort: 'bozuk' as never,
  });
  assert.equal(view.tab, 'all');
  assert.equal(view.sort, 'recent');
  assert.equal(view.projects.length, 3);
});

function artifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  const recipe: ProjectRecipe = {
    version: 1,
    ecosystem: 'npm',
    projectRoot: 'C:\\repos\\alpha',
    artifactPaths: ['C:\\repos\\alpha\\node_modules'],
    cachePaths: [],
    manifest: 'C:\\repos\\alpha\\package.json',
    lockfile: 'C:\\repos\\alpha\\package-lock.json',
    lockfileHash: 'a'.repeat(64),
    runtime: { name: 'node', version: 'v22.0.0', installed: true },
    installCommand: 'npm ci',
    verifyCommand: 'npm ls --depth=0',
    createdAt: 1,
  };
  return {
    projectRoot: 'C:\\repos\\alpha',
    artifactPath: 'C:\\repos\\alpha\\node_modules',
    artifactName: 'node_modules',
    ecosystem: 'npm',
    packageManager: 'npm',
    manifest: 'C:\\repos\\alpha\\package.json',
    lockfile: 'C:\\repos\\alpha\\package-lock.json',
    lockfileHash: 'a'.repeat(64),
    monorepo: false,
    workspaceRoot: null,
    patches: false,
    localDeps: false,
    lockfileTracked: true,
    artifactTracked: false,
    runtimeInstalled: true,
    runtime: { name: 'node', version: 'v22.0.0', installed: true },
    recentlyActive: false,
    idleDays: 10,
    processRunning: false,
    bytes: 1000,
    realisticBytes: 1000,
    regenerable: true,
    risks: [],
    recipe,
    ...overrides,
  };
}

test('proje analizi: artifact gorunumu tarif ve hash tasir', () => {
  const raw = artifact();
  const view = ProjectAnalysis.artifact(raw);
  assert.equal(view.artifactPath, raw.artifactPath);
  assert.equal(view.installCommand, 'npm ci');
  assert.equal(view.verifyCommand, 'npm ls --depth=0');
  assert.equal(view.lockfileHash, 'a'.repeat(64));
  assert.equal(view.regenerable, true);
});

test('proje analizi: plan ve ozet sayilari motordan gelir', () => {
  const first = artifact();
  const second = artifact({
    artifactPath: 'C:\\repos\\alpha\\.venv',
    artifactName: '.venv',
    ecosystem: 'python',
    packageManager: 'pip',
    bytes: 500,
    realisticBytes: 400,
    regenerable: false,
    artifactTracked: true,
    risks: ['lockfile yok: surumler sabit degil', 'lockfile git tarafindan izlenmiyor'],
  });
  const plan: ProjectPlan = {
    mode: 'recipe',
    projects: [first],
    totalBytes: 1000,
    realisticBytes: 1000,
    blocked: [{ artifactPath: second.artifactPath, reason: 'yeniden uretilebilirlik kanitlanamadi' }],
    warnings: ['cache-only modunda yalnizca paket onbellekleri temizlenir; artifact klasorleri korunur.'],
  };

  const view = ProjectAnalysis.view({
    root: 'C:\\repos\\alpha',
    name: 'alpha',
    markers: ['git', 'package.json'],
    git: true,
    agentWorkspace: false,
    artifacts: [first, second],
    plan,
  });

  assert.equal(view.artifacts.length, 2);
  assert.equal(view.summary.artifacts, 2);
  assert.equal(view.summary.regenerable, 1);
  assert.equal(view.summary.tracked, 1);
  assert.equal(view.summary.risks, 2);
  assert.equal(view.summary.totalBytes, 1500);
  assert.equal(view.summary.realisticBytes, 1400);
  assert.equal(view.plan.planned.length, 1);
  assert.equal(view.plan.blocked.length, 1);
  assert.equal(view.plan.totalBytes, plan.totalBytes);
  assert.deepEqual(view.plan.warnings, plan.warnings);
  assert.equal(view.git, true);
});
