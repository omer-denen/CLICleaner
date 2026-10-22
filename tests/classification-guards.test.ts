import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { kindOfFile, probeDir } from '../src/core/classifier.ts';
import {
  classifyPath,
  detectArchetype,
  dropNestedSubParts,
  logGpuVerdict,
} from '../src/core/analyze.ts';
import type { Evidence, LogSignal, SubPart } from '../src/core/types.ts';

/**
 * P1 — yanlis silme riski.
 * Kaynak: docs/residue-cleaner-analiz-ve-promptlar.md (Prompt 1).
 * Her test, bir bulgunun gercekten kapandigini kanitlar.
 */

let root = '';

before(async () => {
  // DIKKAT: %TEMP% altinda kurulum yapilamaz — her yol "temp-scratch"
  // olur ve siniflandirma testleri anlamsizlasir. Bu yuzden depo icindeki
  // (gitignore'lu) `scratch/` kullanilir.
  root = await mkdtemp(join(process.cwd(), 'scratch', 'p1-fixtures-'));
});

after(async () => {
  await rm(root, { recursive: true, force: true });
});

async function file(path: string, content = ''): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, content, 'utf8');
}

function ev(over: Partial<Evidence> = {}): Evidence {
  return { fileKinds: [], markers: [], logSignals: [], ...over };
}

function signal(line: string, means: string): LogSignal {
  return { line, means };
}

// --- C1: log satiri tek basina runtime-pool yapmaz -------------------------

test('C1: yalnizca notebook/pipe log satiri runtime-pool yapmaz', () => {
  const logs = [
    signal('INFO Notebook kernel started', 'notebook calistirma ortami'),
    signal('Pipe opened \\\\.\\pipe\\x', 'arka plan servisi (named pipe)'),
  ];
  const a = detectArchetype(ev({ logSignals: logs }), `${root}\\app`, new Map());
  assert.notEqual(a, 'runtime-pool');
});

test('C1: yapisal kanit (envs) log olmadan da runtime-pool', () => {
  const a = detectArchetype(ev({ markers: ['envs'] }), `${root}\\pool`, new Map());
  assert.equal(a, 'runtime-pool');
});

// --- C2: yalnizca GPU saglayicilari cuda-runtime ---------------------------

test('C2: CPU saglayici DLL leri cuda-runtime sayilmaz', async () => {
  const cpu = join(root, 'c2-cpu-dlls');
  await file(join(cpu, 'onnxruntime_providers_shared.dll'), 'x');
  await file(join(cpu, 'onnxruntime-genai.dll'), 'x');
  await file(join(cpu, 'onnxruntime.dll'), 'x');
  const pc = await probeDir(cpu);
  assert.ok(!pc.fileKinds.includes('cuda-runtime'));

  const gpu = join(root, 'c2-gpu-dlls');
  await file(join(gpu, 'onnxruntime_providers_cuda.dll'), 'x');
  await file(join(gpu, 'onnxruntime_providers_tensorrt.dll'), 'x');
  const pg = await probeDir(gpu);
  assert.ok(pg.fileKinds.includes('cuda-runtime'));
});

test('C2: yalniz ortak ORT DLL i iceren klasor accelerator-runtime olmaz', async () => {
  const dir = join(root, 'c2-ort-shared');
  await file(join(dir, 'onnxruntime_providers_shared.dll'), 'x');
  await file(join(dir, 'onnxruntime-genai.dll'), 'x');
  const p = await probeDir(dir);
  assert.ok(!p.fileKinds.includes('cuda-runtime'));
  assert.notEqual(detectArchetype({ ...p }, dir, new Map()), 'accelerator-runtime');
});

// --- C3/E2: "models" adi tek basina model-store kaniti degil --------------

test('C3: bos models klasoru model-store yapmaz', async () => {
  const dir = join(root, 'c3-empty-models');
  await mkdir(join(dir, 'models'), { recursive: true });
  await file(join(dir, 'models', 'data.csv'), 'a,b');
  const p = await probeDir(dir);
  assert.ok(!p.markers.includes('models'));
  assert.notEqual(detectArchetype({ ...p }, dir, new Map()), 'model-store');
});

test('C3: models icinde model agirligi varsa model-store', async () => {
  const dir = join(root, 'c3-real-models');
  await file(join(dir, 'models', 'model.onnx'), 'x');
  const p = await probeDir(dir);
  assert.ok(p.markers.includes('models'));
  assert.equal(detectArchetype({ ...p }, dir, new Map()), 'model-store');
});

test('E2: proje manifesti olan klasor models tasisa da proje kalir', () => {
  const a = detectArchetype(
    ev({ fileKinds: ['onnx-model'], markers: ['models', 'node_modules'] }),
    `${root}\\ml-project`,
    new Map(),
    { fileKinds: [], markers: [], logSignals: [], projectManifest: true },
  );
  assert.notEqual(a, 'model-store');
  assert.equal(a, 'project-workspace');
});

test('E2: ajan calisma alani model dosyasi tasisa da ajan alani kalir', () => {
  const a = detectArchetype(ev({ markers: ['models', 'skill-store'] }), `${root}\\agent`, new Map());
  assert.equal(a, 'agent-workspace');
});

// --- C4/E9: sohbet gecmisi dizin bazinda kanitlanir ------------------------

test('C4: sessions bos, chats dolu → yalniz chats hedef olur', async () => {
  const dir = join(root, 'c4-chat');
  await mkdir(join(dir, 'sessions'), { recursive: true });
  await file(join(dir, 'chats', 'thread.jsonl'), '{"role":"user"}\n');
  const p = await probeDir(dir);
  assert.ok(p.markers.includes('chat-dir:chats'));
  assert.ok(!p.markers.includes('chat-dir:sessions'));

  const c = await classifyPath(dir, 'custom', { allow: { history: true } });
  assert.ok(c, 'kume uretilmeli');
  const paths = (c.deleteTargets ?? []).map((t) => t.path.toLowerCase());
  assert.ok(paths.some((x) => x.endsWith('\\chats')));
  assert.ok(!paths.some((x) => x.endsWith('\\sessions')));
});

test('C4: bos sohbet dizinleri hedef uretmez', async () => {
  const dir = join(root, 'c4-chat-empty');
  await mkdir(join(dir, 'sessions'), { recursive: true });
  await mkdir(join(dir, 'history'), { recursive: true });
  // Bos klasorler tek basina kume uretmez; olcum icin bir dosya gerekir.
  await file(join(dir, 'notes.txt'), 'x');
  const c = await classifyPath(dir, 'custom', { allow: { history: true } });
  assert.ok(c);
  const paths = (c.deleteTargets ?? []).map((t) => t.path.toLowerCase());
  assert.ok(!paths.some((x) => x.endsWith('\\sessions')));
  assert.ok(!paths.some((x) => x.endsWith('\\history')));
});

// --- C5: olumlu GPU sinyali CPU satirini veto eder -------------------------

test('C5: Device: CPU tek basina cpuOnly', () => {
  const v = logGpuVerdict([
    signal('Device: CPU, EPs: CPUExecutionProvider', 'cihaz tipi: CPU (GPU kullanilmiyor)'),
  ]);
  assert.equal(v.gpuUsed, false);
  assert.equal(v.cpuOnly, true);
});

test('C5: GPU saglayicisi varsa CPU satiri vetoyu kaldirir', () => {
  const v = logGpuVerdict([
    signal('Device: CPU, EPs: CPUExecutionProvider', 'cihaz tipi: CPU (GPU kullanilmiyor)'),
    signal('Applied CUDAExecutionProvider', 'GPU saglayicisi kullanildi'),
  ]);
  assert.equal(v.gpuUsed, true);
  assert.equal(v.cpuOnly, false);
});

// --- C6: buyuk log dosyasinin SON satirlari kanit olur ---------------------

test('C6: 512 KB uzeri log atlanmaz, son satirlar okunur', async () => {
  const dir = join(root, 'c6-big-log');
  const filler = 'x'.repeat(1024);
  const head = Array.from({ length: 600 }, () => filler).join('\n'); // ~600 KB
  await file(join(dir, 'logs', 'app.log'), `${head}\nCUDAExecutionProvider ready\n`);
  const p = await probeDir(dir);
  const means = p.logSignals.map((s) => s.means);
  assert.ok(means.includes('GPU saglayicisi kullanildi'), '.tail okunmali');
});

test('C6: ilk satirlar kanit olmaz (guncel durum sonda)', async () => {
  const dir = join(root, 'c6-old-head');
  const filler = 'x'.repeat(1024);
  const tail = Array.from({ length: 200 }, () => filler).join('\n');
  await file(join(dir, 'logs', 'app.log'), `CUDAExecutionProvider early\n${tail}\n`);
  const p = await probeDir(dir);
  const means = p.logSignals.map((s) => s.means);
  assert.ok(!means.includes('GPU saglayicisi kullanildi'), 'eski satir kanit sayilmamali');
});

// --- E1: bozuk extensions.json butun uzantilari artik yapmaz --------------

test('E1: bozuk manifest + surum desenli klasor hedef uretmez', async () => {
  const dir = join(root, 'e1-broken-manifest');
  await file(join(dir, 'extensions.json'), '[]');
  await file(join(dir, 'extensions', 'extensions.json'), '{ broken');
  await file(join(dir, 'extensions', 'pub.ext-1.0.0', 'main.js'), 'x');
  const c = await classifyPath(dir, 'custom');
  assert.ok(c);
  assert.equal((c.subparts ?? []).length, 0);
});

test('E1: .obsolete kaydi manifest bozuk olsa da hedef olur', async () => {
  const dir = join(root, 'e1-obsolete');
  await file(join(dir, 'extensions.json'), '[]');
  await file(join(dir, 'extensions', 'extensions.json'), '{ broken');
  await file(join(dir, 'extensions', '.obsolete'), '{"pub.ext-1.0.0":true}');
  await file(join(dir, 'extensions', 'pub.ext-1.0.0', 'main.js'), 'x');
  const c = await classifyPath(dir, 'custom');
  assert.ok(c);
  assert.equal((c.subparts ?? []).length, 1);
});

test('E1: saglam manifest aktif surumu korur, eski surumu hedefler', async () => {
  const dir = join(root, 'e1-good-manifest');
  await file(join(dir, 'extensions.json'), '[]');
  await file(
    join(dir, 'extensions', 'extensions.json'),
    JSON.stringify([{ relativeLocation: 'pub.ext-2.0.0' }]),
  );
  await file(join(dir, 'extensions', 'pub.ext-2.0.0', 'main.js'), 'x');
  await file(join(dir, 'extensions', 'pub.ext-1.0.0', 'main.js'), 'x');
  const c = await classifyPath(dir, 'custom');
  assert.ok(c);
  const labels = (c.subparts ?? []).map((s) => s.path.toLowerCase());
  assert.ok(!labels.some((x) => x.endsWith('pub.ext-2.0.0')));
  assert.ok(labels.some((x) => x.endsWith('pub.ext-1.0.0')));
});

// --- E3: ic ice alt parca tek sayilir -------------------------------------

test('E3: ic ice parcalar ayiklanir, dis parca kalir', () => {
  const parts: SubPart[] = [
    { path: 'C:\\app\\models\\x-gpu', bytes: 100, label: 'a', verdictKind: 'recommend', reason: '' },
    { path: 'C:\\app\\models\\x-gpu\\cuda', bytes: 40, label: 'b', verdictKind: 'recommend', reason: '' },
    { path: 'C:\\app\\other', bytes: 10, label: 'c', verdictKind: 'recommend', reason: '' },
  ];
  const kept = dropNestedSubParts(parts).map((p) => p.path);
  assert.deepEqual(kept, ['C:\\app\\models\\x-gpu', 'C:\\app\\other']);
});

test('E3: ayni seviye kardesler korunur', () => {
  const parts: SubPart[] = [
    { path: 'C:\\app\\a', bytes: 1, label: 'a', verdictKind: 'recommend', reason: '' },
    { path: 'C:\\app\\ab', bytes: 1, label: 'b', verdictKind: 'recommend', reason: '' },
  ];
  assert.equal(dropNestedSubParts(parts).length, 2);
});
