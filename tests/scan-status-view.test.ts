import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanStatusView } from '../src/core/scan-status-view.ts';
import type { ScanStatusFacts } from '../src/core/contract.ts';

const TTL = 86_400_000;

function facts(over: Partial<ScanStatusFacts> = {}): ScanStatusFacts {
  return {
    state: 'current',
    lastScanAt: 900,
    ageMs: 100,
    ttlMs: TTL,
    nextRecommendedAt: 900 + TTL,
    dirty: false,
    scanning: false,
    clusters: 42,
    disk: {
      drive: 'C:\\',
      totalBytes: 301_203_451_904,
      freeBytes: 129_563_222_016,
      usedRatio: 0.5698,
    },
    ...over,
  };
}

test('guncel tarama: kind=current, eylem yok', () => {
  const view = scanStatusView(facts());
  assert.equal(view.kind, 'current');
  assert.equal(view.tone, 'ok');
  assert.deepEqual(view.reasons, ['fresh']);
  assert.equal(view.action, 'none');
  assert.equal(view.showAge, true);
  assert.deepEqual(view.header, { kind: 'age', ageMs: 100 });
});

test('TTL asildi: expired, uyari tonu, "tarama eski" sebebi', () => {
  const view = scanStatusView(facts({ ageMs: TTL + 1 }));
  assert.equal(view.kind, 'expired');
  assert.equal(view.tone, 'warn');
  assert.deepEqual(view.reasons, ['expired']);
  assert.equal(view.action, 'scan');
});

test('disk degisti: dirty, "expired" DEGIL ayri bir sebep', () => {
  const view = scanStatusView(facts({ dirty: true }));
  assert.equal(view.kind, 'dirty');
  assert.equal(view.tone, 'danger');
  assert.deepEqual(view.reasons, ['dirty']);
  assert.equal(view.action, 'scan');
});

test('disk degisti VE eski: dirty-expired, en guclu sebep once, tehlike tonu', () => {
  const view = scanStatusView(facts({ dirty: true, ageMs: TTL + 1 }));
  assert.equal(view.kind, 'dirty-expired');
  assert.equal(view.tone, 'danger');
  assert.deepEqual(view.reasons, ['dirty', 'expired']);
});

test('hic taranmadiysa: never, yas gosterilmez', () => {
  const view = scanStatusView(
    facts({ state: 'never', lastScanAt: null, ageMs: null, nextRecommendedAt: null }),
  );
  assert.equal(view.kind, 'never');
  assert.equal(view.tone, 'info');
  assert.deepEqual(view.reasons, ['never-scanned']);
  assert.equal(view.showAge, false);
  assert.deepEqual(view.header, { kind: 'none', ageMs: null });
});

test('tarama surerken: scanning, eylem yok', () => {
  const view = scanStatusView(facts({ scanning: true, state: 'scanning' }));
  assert.equal(view.kind, 'scanning');
  assert.equal(view.tone, 'info');
  assert.deepEqual(view.reasons, ['scanning']);
  assert.equal(view.action, 'none');
  assert.deepEqual(view.header, { kind: 'scanning', ageMs: null });
});

test('ust cubuk: yas, taraniyor veya yok', () => {
  assert.equal(scanStatusView(facts()).header.kind, 'age');
  assert.equal(scanStatusView(facts({ scanning: true, state: 'scanning' })).header.kind, 'scanning');
  assert.equal(
    scanStatusView(facts({ lastScanAt: null, ageMs: null })).header.kind,
    'none',
  );
});

test('rapor satirlari: deger turu motorun karari', () => {
  const view = scanStatusView(facts());
  const byId = Object.fromEntries(view.rows.map((r) => [r.id, r]));

  assert.equal(byId.lastScan?.unit, 'timestamp');
  assert.equal(byId.lastScan?.amount, 900);
  assert.equal(byId.age?.unit, 'duration');
  assert.equal(byId.ttl?.amount, TTL);
  assert.equal(byId.nextRecommended?.amount, 900 + TTL);
  assert.equal(byId.scope?.unit, 'count');
  assert.equal(byId.scope?.amount, 42);
  assert.equal(byId.diskDrive?.text, 'C:\\');
  assert.equal(byId.diskTotal?.unit, 'bytes');
  assert.equal(byId.diskFree?.unit, 'bytes');
  assert.equal(byId.diskUsed?.unit, 'ratio');
});

test('disk bilgisi yoksa ilgili satirlar hic uretilmez', () => {
  const view = scanStatusView(facts({ disk: null }));
  const ids = view.rows.map((r) => r.id);
  assert.equal(ids.includes('diskTotal'), false);
  assert.equal(ids.includes('diskUsed'), false);
});

test('gorunum metin icermez: yalniz kimlik, sayi ve tur', () => {
  const view = scanStatusView(facts());
  const text = JSON.stringify(view);
  assert.equal(text.includes('Eski'), false);
  assert.equal(text.includes('Disk'), false);
});
