import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DiskView, toClusterDetail } from '../src/core/disk-view.ts';
import { cluster, verdict } from './helpers.ts';

function sample() {
  return [
    cluster({
      key: 'safe',
      title: 'Safe big',
      archetype: 'pkg-manager-cache',
      totalBytes: 1000,
      reclaimableBytes: 1000,
      lastTouched: Date.now() - 10 * 86_400_000,
    }),
    cluster({
      key: 'ask',
      title: 'Ask medium',
      archetype: 'model-store',
      totalBytes: 500,
      reclaimableBytes: 500,
      verdict: verdict({ kind: 'ask', risk: 'medium', regenerability: 'unknown' }),
    }),
    cluster({
      key: 'keep',
      title: 'Keep me',
      totalBytes: 300,
      reclaimableBytes: 0,
      verdict: verdict({ kind: 'keep', regenerability: 'user-data' }),
    }),
    cluster({
      key: 'report',
      title: 'Report only',
      totalBytes: 200,
      reclaimableBytes: 0,
      verdict: verdict({ kind: 'report-only' }),
      evidence: { markers: ['chat-history'] },
    }),
    cluster({
      key: 'git',
      title: 'Tracked',
      totalBytes: 400,
      reclaimableBytes: 400,
      evidence: { markers: ['git-tracked'] },
    }),
  ];
}

test('sayimlar: karar turleri ve git', () => {
  const view = new DiskView(sample()).view();
  assert.deepEqual(view.counts, {
    all: 5,
    recommend: 2,
    ask: 1,
    'report-only': 1,
    keep: 1,
    git: 1,
  });
  assert.equal(view.totals.clusters, 5);
  assert.equal(view.totals.reclaimableBytes, 1900);
});

test('varsayilan secim yalnizca T34 kuralini gecenler', () => {
  const view = new DiskView(sample()).view();
  assert.deepEqual(view.defaultSelectedKeys, ['safe', 'git']);
});

test('filtre ve siralama motorda: recommend + size', () => {
  const view = new DiskView(sample()).view({ kind: 'recommend', sort: 'size' });
  assert.deepEqual(
    view.clusters.map((c) => c.key),
    ['safe', 'git'],
  );
  const byName = new DiskView(sample()).view({ sort: 'name' });
  assert.deepEqual(
    byName.clusters.map((c) => c.title),
    ['Ask medium', 'Keep me', 'Report only', 'Safe big', 'Tracked'],
  );
});

test('secim ozeti yalnizca plana alinabilenleri sayar', () => {
  const view = new DiskView(sample(), ['safe', 'ask', 'keep', 'report', 'yok']).view();
  assert.deepEqual(view.selection, {
    clusterCount: 2,
    bytes: 1500,
    targetCount: 2,
  });
  assert.deepEqual(view.selectableKeys.sort(), ['ask', 'git', 'keep', 'safe']);
  assert.deepEqual(view.plannableKeys.sort(), ['ask', 'git', 'safe']);
});

test('kategori filtresi ve kategori ozeti', () => {
  const view = new DiskView(sample()).view({ category: 'ai-debris' });
  assert.deepEqual(
    view.clusters.map((c) => c.key),
    ['ask'],
  );
  const aiCat = view.categories.find((c) => c.key === 'ai-debris');
  assert.equal(aiCat?.count, 1);
  const protectedCat = view.categories.find((c) => c.key === 'protected');
  assert.equal(protectedCat?.count, 2);
});

test('ayrinti gorunumu karar bayraklarini tasir', () => {
  const c = sample()[1]!;
  const detail = toClusterDetail(c);
  assert.equal(detail.category, 'ai-debris');
  assert.equal(detail.risk, 'medium');
  assert.equal(detail.selectable, true);
  assert.equal(detail.plannable, true);
  assert.equal(detail.defaultSelected, false);
});
