#!/usr/bin/env node
/**
 * M5 paket smoke: `npm pack` -> bos klasore kur -> arayuzu ac -> dogrula.
 *
 *   npm run smoke:package
 *
 * Kurulum gecici bir klasorde yapilir (agdan yalnizca bagimliliklar gelir);
 * repo ve kullanici verisi degismez. Sunucu test sonunda kapatilir.
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const npmCli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
const useNodeNpm = existsSync(npmCli);
const npm = useNodeNpm ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npmArgs = (args) => (useNodeNpm ? [npmCli, ...args] : args);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function run(args, cwd) {
  return execFileSync(npm, npmArgs(args), {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitHealth(base, timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return true;
    } catch {
      /* henuz acilmadi */
    }
    await sleep(200);
  }
  return false;
}

const work = mkdtempSync(join(tmpdir(), 'residue-smoke-'));
let child = null;

try {
  if (!existsSync(join(root, 'dist', 'web', 'index.html'))) {
    console.error('dist/web yok. Once derleyin: npm run build:web');
    process.exit(1);
  }

  console.log('1/4  npm pack');
  const packed = JSON.parse(
    run(['pack', '--json', '--pack-destination', work], root),
  );
  const tarball = join(work, packed[0].filename);
  console.log(`     ${packed[0].filename} (${packed[0].size} bayt)`);

  console.log('2/4  gecici klasore kurulum');
  writeFileSync(
    join(work, 'package.json'),
    JSON.stringify({ name: 'residue-smoke', private: true, version: '0.0.0' }, null, 2),
  );
  run(['install', tarball, '--no-audit', '--no-fund', '--loglevel=error'], work);

  const cli = join(work, 'node_modules', 'residue-cleaner', 'bin', 'residue.mjs');
  if (!existsSync(cli)) throw new Error('Paket icinde bin/residue.mjs yok');

  console.log('3/4  paketlenmis arayuzu baslat');
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [cli, 'ui', '--web', '--no-browser', '--port', String(port)], {
    cwd: work,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', (chunk) => {
    logs += String(chunk);
  });
  child.stderr.on('data', (chunk) => {
    logs += String(chunk);
  });

  if (!(await waitHealth(base, 40_000))) {
    console.error(logs.slice(-2000));
    throw new Error('Paketlenmis sunucu acilmadi');
  }

  console.log('4/4  smoke (cerez + uclar)');
  execFileSync(process.execPath, [join(root, 'scripts', 'smoke-web.mjs'), `--base=${base}`], {
    stdio: 'inherit',
  });
  console.log('\nPAKET SMOKE TEMIZ');
} finally {
  if (child) {
    child.kill();
    await sleep(400);
    if (!child.killed) child.kill('SIGKILL');
  }
  rmSync(work, { recursive: true, force: true });
}
