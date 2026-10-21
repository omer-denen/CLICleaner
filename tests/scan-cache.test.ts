import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { ScanResult } from '../src/core/types.ts';

let root = '';
let cache: typeof import('../src/store/scan-cache.ts');

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'residue-cache-test-'));
  process.env.LOCALAPPDATA = root;
  cache = await import('../src/store/scan-cache.ts');
});

after(async () => {
  await rm(root, { recursive: true, force: true });
});

function result(finishedAt: number): ScanResult {
  return {
    startedAt: finishedAt - 1000,
    finishedAt,
    clusters: [],
    stats: { rootsScanned: 1, dirsVisited: 1, filesSeen: 0, bytesSeen: 0, denied: 0, longPathErrors: 0 },
    skipped: [],
  };
}

test('v2 zarfi atomik yazilir ve okunur', async () => {
  const now = Date.now();
  await cache.saveScanCache(result(now));
  const raw = JSON.parse(await readFile(cache.scanCachePath(), 'utf8'));
  assert.equal(raw.version, 2);
  assert.ok(raw.scan);
  const loaded = await cache.loadScanCache(now, 60_000);
  assert.ok(loaded);
  assert.equal(loaded!.at, now);
});

test('eski dogrudan ScanResult bicimi de okunur', async () => {
  const now = Date.now();
  const file = cache.scanCachePath();
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(result(now)), 'utf8');
  const loaded = await cache.loadScanCache(now, 60_000);
  assert.ok(loaded);
  assert.equal(loaded!.scan.finishedAt, now);
});

test('TTL disi sonuc donmez', async () => {
  const now = Date.now();
  await cache.saveScanCache(result(now - 2 * 86_400_000));
  const loaded = await cache.loadScanCache(now, 86_400_000);
  assert.equal(loaded, null);
});
