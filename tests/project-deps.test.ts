import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  analyzeProject,
  detectEcosystem,
  findArtifacts,
  hashFile,
  planProjectCleanup,
} from '../src/core/project-deps.ts';

async function fixture(kind: 'npm' | 'pnpm'): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `residue-project-${kind}-`));
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({ name: 'fixture', version: '1.0.0', dependencies: { left: '^1.0.0' } }),
  );
  await writeFile(join(root, kind === 'pnpm' ? 'pnpm-lock.yaml' : 'package-lock.json'), 'lockfile');
  await mkdir(join(root, 'node_modules', 'left'), { recursive: true });
  await writeFile(join(root, 'node_modules', 'left', 'index.js'), 'x'.repeat(1000));
  return root;
}

test('npm projesi ve lockfile tespiti', async () => {
  const root = await fixture('npm');
  try {
    const eco = await detectEcosystem(root);
    assert.equal(eco.ecosystem, 'npm');
    assert.equal(eco.lockfile, 'package-lock.json');
    const artifacts = await analyzeProject(root, { recentDays: 0 });
    assert.equal(artifacts.length, 1);
    assert.equal(artifacts[0]!.artifactName, 'node_modules');
    assert.ok(artifacts[0]!.recipe.installCommand.includes('npm ci'));
    assert.ok(artifacts[0]!.lockfileHash);
    assert.equal(artifacts[0]!.regenerable, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('pnpm gercekci kazanc tahmini', async () => {
  const root = await fixture('pnpm');
  try {
    const artifacts = await analyzeProject(root, { recentDays: 0 });
    assert.equal(artifacts[0]!.ecosystem, 'pnpm');
    assert.ok(artifacts[0]!.realisticBytes < artifacts[0]!.bytes);
    assert.ok(artifacts[0]!.recipe.installCommand.includes('--frozen-lockfile'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('yamali proje plana alinmaz', async () => {
  const root = await fixture('npm');
  try {
    await mkdir(join(root, 'patches'));
    const artifacts = await analyzeProject(root, { recentDays: 0 });
    assert.equal(artifacts[0]!.regenerable, false);
    const plan = planProjectCleanup(artifacts, 'recipe');
    assert.equal(plan.projects.length, 0);
    assert.equal(plan.blocked.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('alt klasorlerde artifact bulunur', async () => {
  const root = await mkdtemp(join(tmpdir(), 'residue-artifacts-'));
  try {
    await mkdir(join(root, 'pkg', 'node_modules'), { recursive: true });
    const found = await findArtifacts(root);
    assert.ok(found.some((p) => p.endsWith(join('pkg', 'node_modules'))));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('hashFile ayni icerik icin ayni hash', async () => {
  const root = await mkdtemp(join(tmpdir(), 'residue-hash-'));
  try {
    const f = join(root, 'x');
    await writeFile(f, 'abc');
    assert.equal(await hashFile(f), await hashFile(f));
    assert.equal((await hashFile(f))?.length, 64);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
