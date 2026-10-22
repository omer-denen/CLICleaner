import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DashboardDetails } from '../src/core/dashboard-details.ts';
import type { EnvFinding } from '../src/core/env-engine.ts';

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
    envFindings: null,
    commandShadows: null,
    brokenTools: null,
    brokenEdges: null,
    interrupted: [],
    expiredVault: [],
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
