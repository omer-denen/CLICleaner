import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { link, mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { walk } from '../src/core/walker.ts';
import { classifyPath, estimateReclaimable } from '../src/core/analyze.ts';

/**
 * P2 — olcum dogrulugu.
 * Kaynak: docs/residue-cleaner-analiz-ve-promptlar.md (Prompt 2).
 *
 * Fixture koku `%TEMP%` ALTINDA olabilir: bu dosyadaki tek amac olcumdur
 * (siniflandirma testleri degil). `temp-scratch` testi zaten %TEMP% ister.
 */

let root = '';

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'residue-p2-'));
});

after(async () => {
  await rm(root, { recursive: true, force: true });
});

async function file(path: string, content = ''): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, content);
}

async function sized(path: string, bytes: number): Promise<void> {
  await file(path, 'x'.repeat(bytes));
}

const MB = 1024 * 1024;

// --- W1: "en buyuk N" ilk bulunan N degil --------------------------------

test('W1: largeFiles en buyuk N dosyayi tutar', async () => {
  const dir = join(root, 'w1-large');
  await sized(join(dir, 'a.bin'), 1 * MB);
  await sized(join(dir, 'b.bin'), 5 * MB);
  await sized(join(dir, 'c.bin'), 2 * MB);
  await sized(join(dir, 'd.bin'), 4 * MB);
  await sized(join(dir, 'e.bin'), 3 * MB);

  const w = await walk({ root: dir, largeThreshold: 0, maxLarge: 3 });
  const sizes = w.largeFiles.map((f) => f.bytes);
  assert.deepEqual(sizes, [5 * MB, 4 * MB, 3 * MB]);
  assert.equal(w.bytes, 15 * MB);
  assert.equal(w.files, 5);
});

test('W1: maxLarge 0 iken liste bos kalir (alt parca olcumu)', async () => {
  const dir = join(root, 'w1-none');
  await sized(join(dir, 'a.bin'), 2 * MB);
  const w = await walk({ root: dir, largeThreshold: 0, maxLarge: 0 });
  assert.equal(w.largeFiles.length, 0);
});

// --- W2: inode anahtari bigint (hassasiyet kaybi yok) --------------------

test('W2: cok sayida kardes klasor link-loop sayilmaz', async () => {
  const dir = join(root, 'w2-many-dirs');
  for (let i = 0; i < 60; i++) {
    await file(join(dir, `d${i}`, 'f.txt'), 'x');
  }
  const w = await walk({ root: dir, largeThreshold: Infinity, maxLarge: 0 });
  assert.equal(w.dirs, 60);
  assert.equal(w.files, 60);
  assert.equal(w.skipped.filter((s) => s.reason === 'link-loop').length, 0);
});

// --- W3: ilerleme bildirimi dosya basina degil ---------------------------

test('W3: onProgress dosya basina cagrilmaz', async () => {
  const dir = join(root, 'w3-progress');
  for (let i = 0; i < 40; i++) await file(join(dir, `f${i}.txt`), 'x');
  let calls = 0;
  await walk({ root: dir, largeThreshold: Infinity, maxLarge: 0, onProgress: () => calls++ });
  assert.ok(calls <= 3, `cok fazla ilerleme cagrisi: ${calls}`);
  assert.ok(calls >= 1, 'en az bir ilerleme bildirimi beklenir');
});

// --- W4: hardlink iki kez sayilmaz ---------------------------------------

test('W4: hardlink bayt olarak bir kez sayilir, raporda ayri gorunur', async () => {
  const dir = join(root, 'w4-hardlink');
  const a = join(dir, 'a.bin');
  await sized(a, 4096);
  await link(a, join(dir, 'b.bin'));

  const w = await walk({ root: dir, largeThreshold: Infinity, maxLarge: 0 });
  assert.equal(w.files, 2, 'iki dosya adi var');
  assert.equal(w.bytes, 4096, 'bayt bir kez');
  assert.equal(w.hardlinkedBytes, 4096, 'ikinci ad ayri raporlanir');
});

// --- E4: tahmin = hedef toplami ------------------------------------------

test('E4: os-user-data ve unknown icin tahmin 0', () => {
  const ext = new Map([['log', 10], ['db', 5]]);
  assert.equal(estimateReclaimable('os-user-data', 1000, ext), 0);
  assert.equal(estimateReclaimable('unknown', 1000, ext), 0);
  assert.equal(estimateReclaimable('electron-app-data', 1000, ext), 0);
});

test('E4: temp-scratch ve runtime-pool yas kirilimindan hesaplanir', () => {
  const older = new Map([[3, 700], [90, 200]]);
  assert.equal(estimateReclaimable('temp-scratch', 1000, new Map(), older), 700);
  assert.equal(estimateReclaimable('runtime-pool', 1000, new Map(), older), 200);
  // Kirilim yoksa "tamami" denmez.
  assert.equal(estimateReclaimable('temp-scratch', 1000, new Map()), 0);
  assert.equal(estimateReclaimable('runtime-pool', 1000, new Map()), 0);
});

test('E4: temp hedefi yalnizca 3 gunden eski dosyalarin baytini tasir', async () => {
  const dir = join(root, 'e4-temp', 'nested');
  await mkdir(dir, { recursive: true });
  await sized(join(dir, 'old.bin'), 1000);
  await sized(join(dir, 'new.bin'), 500);
  const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000);
  await utimes(join(dir, 'old.bin'), tenDaysAgo, tenDaysAgo);

  const c = await classifyPath(dir, 'custom');
  assert.ok(c);
  assert.equal(c.archetype, 'temp-scratch');
  const targets = c.deleteTargets ?? [];
  assert.equal(targets.length, 1);
  assert.equal(targets[0]!.kind, 'older');
  assert.equal(targets[0]!.bytes, 1000, 'hedef bayti yalniz eski dosya');
  assert.equal(c.reclaimableBytes, 1000, 'geri kazanilabilir = hedef toplami');
  assert.equal(c.totalBytes, 1500);
});

test('E4: yasli dosya yoksa temp hedefi uretilmez', async () => {
  const dir = join(root, 'e4-temp-fresh');
  await mkdir(dir, { recursive: true });
  await sized(join(dir, 'new.bin'), 500);
  const c = await classifyPath(dir, 'custom');
  assert.ok(c);
  assert.equal(c.archetype, 'temp-scratch');
  assert.equal((c.deleteTargets ?? []).length, 0, 'silinecek eski dosya yok');
  assert.equal(c.reclaimableBytes, 0);
});
