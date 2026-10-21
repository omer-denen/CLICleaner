import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
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
