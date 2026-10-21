import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';

let root = '';
let server: Server;
let base = '';
let token = '';

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'residue-api-test-'));
  process.env.LOCALAPPDATA = root;
  const { createApiServer } = await import('../src/web/server.ts');
  const created = createApiServer({ persistScan: false, envs: [] });
  server = created.server;
  token = created.token;
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', () => ok()));
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');
  base = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  server.closeAllConnections?.();
  await new Promise<void>((ok) => server.close(() => ok()));
  await rm(root, { recursive: true, force: true });
});

test('health token gerektirmez', async () => {
  const r = await fetch(`${base}/api/health`);
  assert.equal(r.status, 200);
});

test('token olmadan API 401', async () => {
  const r = await fetch(`${base}/api/meta`);
  assert.equal(r.status, 401);
});

test('yeni motor uclari yanit verir', async () => {
  for (const path of ['/api/env', '/api/schedules', '/api/recover', '/api/vault', '/api/settings']) {
    const r = await fetch(`${base}${path}`, { headers: { 'x-residue-token': token } });
    assert.equal(r.status, 200, `${path} -> ${r.status}`);
  }
});

test('env plani plan kimligi dondurur', async () => {
  const r = await fetch(`${base}/api/env/plan`, {
    method: 'POST',
    headers: { 'x-residue-token': token, 'content-type': 'application/json' },
    body: JSON.stringify({ scope: 'user' }),
  });
  assert.equal(r.status, 200);
  const body = (await r.json()) as { planId?: string; plan?: unknown };
  assert.equal(typeof body.planId, 'string');
  assert.ok(body.plan);
});

test('bilinmeyen plan kimligi 404', async () => {
  const r = await fetch(`${base}/api/env/apply`, {
    method: 'POST',
    headers: { 'x-residue-token': token, 'content-type': 'application/json' },
    body: JSON.stringify({ planId: 'yok', phrase: 'TEMIZLE' }),
  });
  assert.equal(r.status, 404);
  const body = (await r.json()) as { type?: string; error?: string };
  assert.equal(body.type, 'fatal');
  assert.ok(body.error);
});

test('dashboard ve proje kesfi uclari yanit verir', async () => {
  const d = await fetch(`${base}/api/dashboard`, { headers: { 'x-residue-token': token } });
  assert.equal(d.status, 200);
  const body = (await d.json()) as {
    ledgers?: Array<{ id: string }>;
    cards?: unknown[];
    safeWins?: unknown[];
  };
  assert.ok(body.ledgers?.some((l) => l.id === 'protected'));
  assert.ok(Array.isArray(body.cards));
  assert.ok(Array.isArray(body.safeWins));

  const roots = await fetch(`${base}/api/projects/roots`, {
    headers: { 'x-residue-token': token },
  });
  assert.equal(roots.status, 200);
  const rootsBody = (await roots.json()) as { roots?: string[]; maxDepth?: number };
  assert.ok(Array.isArray(rootsBody.roots));
  assert.equal(typeof rootsBody.maxDepth, 'number');

  const projRoot = join(root, 'proj');
  await mkdir(join(projRoot, '.git'), { recursive: true });
  await writeFile(join(projRoot, 'package.json'), '{}', 'utf8');
  const p = await fetch(
    `${base}/api/projects/discover?roots=${encodeURIComponent(projRoot)}`,
    { headers: { 'x-residue-token': token } },
  );
  assert.equal(p.status, 200);
  const pb = (await p.json()) as {
    projects?: Array<{ name: string }>;
    counts?: Record<string, number>;
    summary?: { total: number; visible: number; git: number };
    tab?: string;
    sort?: string;
  };
  assert.ok(pb.projects?.some((x) => x.name === 'proj'));
  assert.equal(pb.counts?.all, 1);
  assert.equal(pb.summary?.total, 1);
  assert.equal(pb.summary?.visible, 1);
  assert.equal(pb.summary?.git, 1);
  assert.equal(pb.tab, 'all');
  assert.equal(pb.sort, 'recent');

  const filtered = await fetch(
    `${base}/api/projects/discover?roots=${encodeURIComponent(projRoot)}&tab=agent&text=yok`,
    { headers: { 'x-residue-token': token } },
  );
  assert.equal(filtered.status, 200);
  const fb = (await filtered.json()) as {
    projects?: unknown[];
    counts?: Record<string, number>;
    tab?: string;
  };
  assert.equal(fb.projects?.length, 0);
  assert.equal(fb.counts?.all, 1);
  assert.equal(fb.tab, 'agent');

  const bad = await fetch(`${base}/api/projects/discover`, {
    headers: { 'x-residue-token': token },
  });
  assert.equal(bad.status, 400);

  const missing = await fetch(
    `${base}/api/projects?path=${encodeURIComponent(join(root, 'yok-boyle-bir-proje'))}`,
    { headers: { 'x-residue-token': token } },
  );
  assert.equal(missing.status, 404);
});

test('disk gorunumu ve bilinmeyen kume', async () => {
  const d = await fetch(`${base}/api/disk`, { headers: { 'x-residue-token': token } });
  assert.equal(d.status, 200);
  const body = (await d.json()) as {
    clusters?: unknown[];
    counts?: Record<string, number>;
    selection?: { clusterCount: number };
    defaultSelectedKeys?: string[];
  };
  assert.equal(body.clusters?.length, 0);
  assert.equal(body.counts?.all, 0);
  assert.equal(body.selection?.clusterCount, 0);
  assert.deepEqual(body.defaultSelectedKeys, []);

  const c = await fetch(`${base}/api/cluster?key=yok`, {
    headers: { 'x-residue-token': token },
  });
  assert.equal(c.status, 404);
});
