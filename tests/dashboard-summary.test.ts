import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DashboardSummary, type DashboardFacts } from '../src/core/dashboard-summary.ts';
import { cluster, verdict } from './helpers.ts';

function facts(over: Partial<DashboardFacts> = {}): DashboardFacts {
  return {
    now: 1_000,
    scan: {
      state: 'current',
      at: 900,
      ageMs: 100,
      scanning: false,
      clusters: [],
    },
    inventory: {
      diskBytes: 0,
      diskCount: 0,
      cliBytes: 0,
      cliCount: 0,
      brokenInstalls: 0,
    },
    env: null,
    graph: null,
    recover: { interrupted: 0 },
    vault: { entries: 0, bytes: 0, expired: 0 },
    schedules: { rules: 0, due: 0, missed: 0 },
    ...over,
  };
}

test('iki defter: korunan = toplam - geri kazanilabilir', () => {
  const view = new DashboardSummary(
    facts({
      scan: {
        state: 'current',
        at: 900,
        ageMs: 100,
        scanning: false,
        clusters: [
          cluster({ key: 'a', totalBytes: 1000, reclaimableBytes: 400 }),
          cluster({ key: 'b', totalBytes: 2000, reclaimableBytes: 0 }),
        ],
      },
      vault: { entries: 2, bytes: 500, expired: 1 },
      inventory: {
        diskBytes: 3000,
        diskCount: 2,
        cliBytes: 700,
        cliCount: 3,
        brokenInstalls: 0,
      },
    }),
  ).view();

  const ledgers = Object.fromEntries(view.ledgers.map((l) => [l.id, l.bytes]));
  assert.equal(ledgers.protected, 2600);
  assert.equal(ledgers.reclaimable, 400);
  assert.equal(ledgers.vault, 500);
  assert.equal(ledgers.cli, 700);
});

test('guvenli kazanimlar yalnizca DefaultSelection kuralini gecenler', () => {
  const clusters = [
    cluster({ key: 'safe-big', reclaimableBytes: 900, totalBytes: 900 }),
    cluster({ key: 'safe-small', reclaimableBytes: 100, totalBytes: 100 }),
    cluster({ key: 'ask', verdict: verdict({ kind: 'ask', risk: 'medium' }) }),
    cluster({ key: 'keep', verdict: verdict({ kind: 'keep' }) }),
    cluster({ key: 'user-data', verdict: verdict({ regenerability: 'user-data' }) }),
    cluster({ key: 'no-target', deleteTargets: [] }),
  ];
  const view = new DashboardSummary(
    facts({
      scan: { state: 'current', at: 900, ageMs: 100, scanning: false, clusters },
    }),
  ).view();

  assert.deepEqual(
    view.safeWins.map((w) => w.clusterKey),
    ['safe-big', 'safe-small'],
  );
  assert.equal(view.safeWins[0]?.category, 'unused');
  assert.equal(view.safeWins[0]?.regenerability, 'regenerable');
});

test('kartlar: tarama, ortam, kurtarma, kasa ve planlar', () => {
  const view = new DashboardSummary(
    facts({
      scan: { state: 'stale', at: 900, ageMs: 100, scanning: false, clusters: [] },
      inventory: {
        diskBytes: 0,
        diskCount: 0,
        cliBytes: 0,
        cliCount: 0,
        brokenInstalls: 2,
      },
      env: { pathIssues: 3, orphanVars: 1, shadowedCommands: 4 },
      graph: { broken: 1, critical: 0, shadowed: 2 },
      recover: { interrupted: 1 },
      vault: { entries: 0, bytes: 0, expired: 3 },
      schedules: { rules: 2, due: 1, missed: 2 },
    }),
  ).view();

  assert.deepEqual(
    view.cards.map((c) => c.id),
    [
      'scan-stale',
      'broken-installs',
      'broken-dependencies',
      'path-issues',
      'shadowed-commands',
      'orphan-vars',
      'interrupted',
      'vault-expired',
      'schedule-missed',
      'schedule-due',
    ],
  );
  assert.equal(view.cards.find((c) => c.id === 'path-issues')?.count, 3);
  assert.equal(view.cards.find((c) => c.id === 'interrupted')?.tone, 'danger');
});

test('tarama hic yapilmadiysa bilgi karti cikar, sayilar sifir', () => {
  const view = new DashboardSummary(
    facts({ scan: { state: 'never', at: null, ageMs: null, scanning: false, clusters: [] } }),
  ).view();

  assert.deepEqual(
    view.cards.map((c) => c.id),
    ['scan-missing'],
  );
  assert.equal(view.scan.clusters, 0);
  assert.equal(view.totals.clusters, 0);
});

test('gorunum yalniz kimlik + sayi tasir (metin yok)', () => {
  const view = new DashboardSummary(facts()).view();
  const text = JSON.stringify(view);
  assert.equal(text.includes('Korunan'), false);
  assert.equal(text.includes('Geri kazan'), false);
  assert.equal(typeof view.generatedAt, 'number');
});
