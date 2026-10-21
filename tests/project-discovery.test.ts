import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverProjects } from '../src/core/project-discovery.ts';

let root = '';

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'residue-discovery-'));
});

after(async () => {
  await rm(root, { recursive: true, force: true });
});

async function file(path: string, content = ''): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, content, 'utf8');
}

test('proje kokleri kanittan bulunur, artifact icine inilmez', async () => {
  const nodeRepo = join(root, 'repo-a');
  await mkdir(join(nodeRepo, '.git'), { recursive: true });
  await file(join(nodeRepo, 'package.json'), '{"name":"a"}');
  await file(join(nodeRepo, 'package-lock.json'), '{}');
  await mkdir(join(nodeRepo, 'node_modules', 'fake-pkg'), { recursive: true });
  await file(join(nodeRepo, 'node_modules', 'fake-pkg', 'package.json'), '{"name":"fake"}');

  const pyRepo = join(root, 'repo-b');
  await file(join(pyRepo, 'pyproject.toml'), '[project]\nname="b"');
  await file(join(pyRepo, 'uv.lock'), '');
  await mkdir(join(pyRepo, '.venv'), { recursive: true });
  await file(join(pyRepo, 'skills', 'demo', 'SKILL.md'), '# skill');

  await mkdir(join(root, 'not-a-project'), { recursive: true });
  await file(join(root, 'not-a-project', 'README.md'), 'x');

  const result = await discoverProjects([root], { maxDepth: 2 });

  assert.equal(result.projects.length, 2);
  const byName = Object.fromEntries(result.projects.map((p) => [p.name, p]));
  assert.equal(byName['repo-a']?.git, true);
  assert.ok(byName['repo-a']?.markers.includes('package.json'));
  assert.deepEqual(byName['repo-a']?.artifacts, ['node_modules']);
  assert.equal(byName['repo-a']?.lockfile, 'package-lock.json');
  assert.equal(byName['repo-b']?.agentWorkspace, true);
  assert.deepEqual(byName['repo-b']?.artifacts, ['.venv']);
  assert.equal(byName['repo-b']?.lockfile, 'uv.lock');
  assert.equal(result.projects.some((p) => p.root.includes('node_modules')), false);
});

test('maxProjects siniri ve truncated bayragi', async () => {
  const many = join(root, 'many');
  for (let i = 0; i < 4; i++) {
    await file(join(many, `p${i}`, 'package.json'), '{}');
  }
  const result = await discoverProjects([many], { maxDepth: 1, maxProjects: 2 });
  assert.equal(result.projects.length, 2);
  assert.equal(result.truncated, true);
});

test('olmayan kok atlanir, hata firlatmaz', async () => {
  const result = await discoverProjects([join(root, 'yok-boyle-bir-yer')]);
  assert.equal(result.projects.length, 0);
  assert.equal(result.skipped, 1);
});
