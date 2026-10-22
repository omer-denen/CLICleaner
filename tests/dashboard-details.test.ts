import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DashboardDetails } from '../src/core/dashboard-details.ts';
import type { EnvFinding } from '../src/core/env-engine.ts';
import { cluster } from './helpers.ts';

function envFinding(over: Partial<EnvFinding> = {}): EnvFinding {
  return {
    id: 'f1',
    kind: 'missing-path',
    scope: 'user',
    variable: 'PATH',
    value: 'C:\\yok',
    reason: 'dizin yok',
    severity: 'warning',
    ...over,
  };
}

function input(over: Partial<ConstructorParameters<typeof DashboardDetails>[0]> = {}) {
  return {
    clusters: [],
    envFindings: null,
    commandShadows: null,
    brokenTools: null,
    brokenEdges: null,
    interrupted: [],
    expiredVault: [],
    vaultItems: [],
    cliItems: null,
    schedules: [],
    ...over,
  };
}

test('env yoksa env detay satirlari bos kalir', () => {
  const views = new DashboardDetails(input()).views();
  const byId = Object.fromEntries(views.map((v) => [v.id, v]));
  assert.equal(byId.paths?.rows.length, 0);
  assert.equal(byId.vars?.rows.length, 0);
  assert.equal(byId.commands?.rows.length, 0);
  // tarama detayi her zaman var
  assert.equal(byId.scan !== undefined, true);
});

test('yol satiri: sol yol, sag gerekce (degisken adi "Path" degil)', () => {
  const views = new DashboardDetails(
    input({
      envFindings: [
        envFinding({
          kind: 'missing-path',
          variable: 'Path',
          value: 'C:\\yok',
          reason: 'PATH girdisi diskte yok; komut bulunamaz.',
        }),
      ],
    }),
  ).views();
  const paths = views.find((v) => v.id === 'paths');
  assert.equal(paths?.rows[0]?.label, 'C:\\yok');
  assert.equal(paths?.rows[0]?.value, 'PATH girdisi diskte yok; komut bulunamaz.');
});

test('golgede kalan komut: sol komut adi', () => {
  const views = new DashboardDetails(
    input({
      commandShadows: [
        { command: 'klist', winner: 'C:\\jdk\\bin', shadowed: ['C:\\Windows\\system32'] },
      ],
    }),
  ).views();
  const commands = views.find((v) => v.id === 'commands');
  assert.equal(commands?.rows[0]?.label, 'klist');
  assert.equal(commands?.rows[0]?.value, 'C:\\jdk\\bin → C:\\Windows\\system32');
});

test('env bulgulari turlerine gore dagilir', () => {
  const views = new DashboardDetails(
    input({
      envFindings: [
        envFinding({ id: 'a', kind: 'missing-path' }),
        envFinding({ id: 'b', kind: 'duplicate-path' }),
        envFinding({ id: 'c', kind: 'orphan-variable', variable: 'OLD_PATH' }),
      ],
      commandShadows: [
        { command: 'npm', winner: 'C:\\a', shadowed: ['C:\\b'] },
      ],
    }),
  ).views();

  const byId = Object.fromEntries(views.map((v) => [v.id, v]));
  assert.equal(byId.paths?.rows.length, 2);
  assert.equal(byId.vars?.rows.length, 1);
  assert.equal(byId.commands?.rows.length, 1);
  assert.equal(byId.vars?.rows[0]?.label, 'OLD_PATH');
});

test('uyari tonu bulgu gecerligine tasinir', () => {
  const views = new DashboardDetails(
    input({ envFindings: [envFinding({ severity: 'warning' })] }),
  ).views();
  const paths = views.find((v) => v.id === 'paths');
  assert.equal(paths?.rows[0]?.tone, 'warn');
});

test('arac/graf detaylari yalniz veri varsa uretilir', () => {
  const views = new DashboardDetails(
    input({
      brokenTools: [{ id: 't1', label: '9router', value: 'C:\\x', tone: 'danger' }],
      brokenEdges: [{ id: 'e1', label: 'a → b', value: 'shim', tone: 'danger' }],
    }),
  ).views();
  const byId = Object.fromEntries(views.map((v) => [v.id, v]));
  assert.equal(byId.installs?.rows[0]?.label, '9router');
  assert.equal(byId.deps?.rows[0]?.label, 'a → b');
  assert.equal(byId.deps?.target, 'graph');
});

test('detay listesi butun kartlari kapsar ve hedefleri dogru', () => {
  const views = new DashboardDetails(input()).views();
  const byId = Object.fromEntries(views.map((v) => [v.id, v]));
  assert.equal(byId.scan?.target, 'disk');
  assert.equal(byId.recover?.target, null);
  assert.equal(byId.vault?.target, 'vault');
  assert.equal(byId.schedules?.target, 'schedules');
});

test('defter detaylari: korunan, geri kazanilabilir, kasa, araclar', () => {
  const views = new DashboardDetails(
    input({
      clusters: [
        cluster({ key: 'a', title: 'A', totalBytes: 1000, reclaimableBytes: 400 }),
        cluster({ key: 'b', title: 'B', totalBytes: 2000, reclaimableBytes: 0 }),
      ],
      vaultItems: [
        { id: 'v1', label: 'C:\\kasa', value: '', valueKind: 'bytes', amount: 500 },
      ],
      cliItems: [
        {
          id: 'c1',
          label: 'opencode · npm-global',
          value: '',
          valueKind: 'bytes',
          amount: 700,
        },
      ],
    }),
  ).views();
  const byId = Object.fromEntries(views.map((v) => [v.id, v]));

  const protectedRows = byId['ledger-protected']?.rows ?? [];
  assert.equal(protectedRows.length, 2);
  assert.equal(
    protectedRows.reduce((sum, r) => sum + (r.amount ?? 0), 0),
    2600,
  );
  assert.equal(byId['ledger-reclaimable']?.rows[0]?.amount, 400);
  assert.equal(byId['ledger-vault']?.rows[0]?.amount, 500);
  assert.equal(byId['ledger-cli']?.rows[0]?.label, 'opencode · npm-global');
  assert.equal(byId['ledger-cli']?.rows[0]?.amount, 700);
  assert.equal(byId['ledger-cli']?.noteId, undefined);
});

test('envanter yoksa araclar defteri not tasir', () => {
  const views = new DashboardDetails(input({ cliItems: null })).views();
  const cli = views.find((v) => v.id === 'ledger-cli');
  assert.equal(cli?.rows.length, 0);
  assert.equal(cli?.noteId, 'ledger-cli-empty');
});

test('detay turu: tarama ozel, digerleri satir listesi', () => {
  const views = new DashboardDetails(input()).views();
  const byId = Object.fromEntries(views.map((v) => [v.id, v]));
  assert.equal(byId.scan?.kind, 'scan');
  assert.equal(byId.paths?.kind, 'rows');
  assert.equal(byId.recover?.kind, 'rows');
});

test('sabit metinler metin degil kimlik + sayi tasir', () => {
  const views = new DashboardDetails(
    input({
      envFindings: [envFinding({ kind: 'missing-path' })],
      interrupted: [
        {
          id: 'op1',
          label: '',
          labelId: 'operation-vault',
          value: '',
          valueId: 'interrupted-items',
          amount: 2,
          tone: 'warn',
        },
      ],
      expiredVault: [
        { id: 'v1', label: 'C:\\x', value: '', valueKind: 'bytes', amount: 1024, tone: 'warn' },
      ],
      schedules: [
        {
          id: 's1',
          label: 'plan',
          value: '',
          valueId: 'schedule-missed',
          amount: 3,
          tone: 'warn',
        },
      ],
    }),
  ).views();
  const byId = Object.fromEntries(views.map((v) => [v.id, v]));

  assert.equal(byId.paths?.rows[0]?.valueId, 'missing-path');
  assert.equal(byId.recover?.rows[0]?.labelId, 'operation-vault');
  assert.equal(byId.recover?.rows[0]?.valueId, 'interrupted-items');
  assert.equal(byId.recover?.rows[0]?.amount, 2);
  assert.equal(byId.vault?.rows[0]?.valueKind, 'bytes');
  assert.equal(byId.vault?.rows[0]?.amount, 1024);
  assert.equal(byId.schedules?.rows[0]?.valueId, 'schedule-missed');
  assert.equal(byId.schedules?.rows[0]?.amount, 3);
});
