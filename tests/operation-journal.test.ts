import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let root = '';
let journal: typeof import('../src/core/operation-journal.ts');

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'residue-journal-test-'));
  process.env.LOCALAPPDATA = root;
  journal = await import('../src/core/operation-journal.ts');
});

after(async () => {
  await rm(root, { recursive: true, force: true });
});

test('journal-first: yarim kalan islem bulunur', async () => {
  const j = await journal.OperationJournal.create('op-1', { mode: 'recycle', planId: 'p1' });
  await j.pending('t-0', 'C:\\dummy', 100);
  await j.inProgress('t-0');
  await j.done('t-1', 50);
  // kapatilmadi: crash senaryosu

  const interrupted = await journal.interruptedOperations();
  assert.equal(interrupted.length, 1);
  assert.equal(interrupted[0]!.operationId, 'op-1');
  assert.equal(interrupted[0]!.items.length, 1);
  assert.equal(interrupted[0]!.items[0]!.state, 'in-progress');
});

test('markInterrupted isaretler ve arsivler', async () => {
  const found = await journal.markInterruptedOperations();
  assert.equal(found.length, 1);
  const files = await readdir(journal.journalsDir());
  assert.ok(files.some((f) => f.endsWith('.crashed')));
  const again = await journal.interruptedOperations();
  assert.equal(again.length, 0);
});
