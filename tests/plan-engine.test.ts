import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dueNow,
  missedRuns,
  nextRunAt,
  previewRule,
  selectClusters,
  type ScheduleRule,
} from '../src/core/plan-engine.ts';
import { cluster, verdict } from './helpers.ts';

function rule(over: Partial<ScheduleRule> = {}): ScheduleRule {
  return {
    id: 'r1',
    name: 'test',
    frequency: 'daily',
    hour: 3,
    minute: 0,
    selector: { maxRisk: 'safe', maxItems: 10 },
    mode: 'vault',
    enabled: true,
    createdAt: new Date(2026, 0, 1, 2, 0, 0).getTime(),
    compensateMissed: true,
    ...over,
  };
}

test('gunluk sonraki calisma', () => {
  const r = rule();
  const from = new Date(2026, 0, 5, 4, 0, 0).getTime();
  const next = nextRunAt(r, from);
  assert.equal(new Date(next!).getHours(), 3);
  assert.equal(new Date(next!).getDate(), 6);
});

test('gunluk due: olusturulduktan sonraki ilk zaman', () => {
  const r = rule();
  const beforeFirst = new Date(2026, 0, 1, 2, 30, 0).getTime();
  const afterFirst = new Date(2026, 0, 1, 4, 0, 0).getTime();
  assert.equal(dueNow(r, beforeFirst), false);
  assert.equal(dueNow(r, afterFirst), true);
});

test('kacirilan calisma sayisi', () => {
  const now = new Date(2026, 0, 10, 4, 0, 0).getTime();
  const r = rule({ lastRunAt: new Date(2026, 0, 7, 3, 0, 0).getTime() });
  assert.equal(missedRuns(r, now), 3);
});

test('secici yalnizca safe + regenerable seceler', () => {
  const r = rule();
  const clusters = [
    cluster({ key: 'safe', verdict: verdict() }),
    cluster({ key: 'medium', verdict: verdict({ risk: 'medium' }) }),
    cluster({ key: 'user', verdict: verdict({ regenerability: 'user-data' }) }),
    cluster({ key: 'lowconf', verdict: verdict({ confidence: 'low' }) }),
    cluster({ key: 'ask', verdict: verdict({ kind: 'ask' }) }),
  ];
  const selected = selectClusters(r, clusters);
  assert.deepEqual(selected.map((c) => c.key), ['safe']);
});

test('maxItems uygulanir', () => {
  const r = rule({ selector: { maxRisk: 'safe', maxItems: 2 } });
  const clusters = ['a', 'b', 'c'].map((k) => cluster({ key: k }));
  assert.equal(selectClusters(r, clusters).length, 2);
});

test('onizleme salt okunur ozet', () => {
  const r = rule();
  const p = previewRule(r, [cluster({ key: 'safe' })]);
  assert.equal(p.ruleId, 'r1');
  assert.equal(p.mode, 'vault');
  assert.equal(p.items.length, 1);
  assert.deepEqual(p.envChanges, []);
});

test('once plani gecmisse next null', () => {
  const r = rule({
    frequency: 'once',
    runAt: new Date(2026, 0, 1).getTime(),
  });
  assert.equal(nextRunAt(r, new Date(2026, 0, 2).getTime()), null);
});
