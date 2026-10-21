#!/usr/bin/env node
/**
 * M5 headless smoke: `ui --web` kabugunu gercek HTTP uzerinden dogrular.
 *
 *   npm run smoke                 # sunucuyu baslatir, kontrol eder, kapatir
 *   npm run smoke -- --base=http://127.0.0.1:4399   # calisan sunucu
 *
 * Kontroller: cerez token (HttpOnly/SameSite), HTML'de token YOK, statik
 * varlik, tum GET uclari 200, tokensiz API 401, yabanci Host 403 ve yazili
 * onay kapilari (400/409). Hicbir silme/yazma islemi yapilmaz.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { request } from 'node:http';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const baseArg = process.argv.slice(2).find((a) => a.startsWith('--base='));
const providedBase = baseArg ? baseArg.slice('--base='.length).replace(/\/$/, '') : null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let failures = 0;
function check(name, ok, detail = '') {
  const line = `${ok ? 'OK  ' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`;
  console.log(line);
  if (!ok) failures += 1;
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
      /* sunucu henuz dinlemiyor */
    }
    await sleep(150);
  }
  return false;
}

function rawGet(base, path, hostHeader) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, base);
    const req = request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: 'GET',
        headers: { Host: hostHeader },
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  let child = null;
  let base = providedBase;
  let logs = '';

  if (!base) {
    if (!existsSync(join(root, 'dist', 'web', 'index.html'))) {
      console.error('dist/web yok. Once derleyin: npm run build:web');
      process.exit(1);
    }
    const port = await freePort();
    base = `http://127.0.0.1:${port}`;
    child = spawn(
      process.execPath,
      [join(root, 'bin', 'residue.mjs'), 'ui', '--web', '--no-browser', '--port', String(port)],
      { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    child.stdout.on('data', (chunk) => {
      logs += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      logs += String(chunk);
    });
    if (!(await waitHealth(base, 30_000))) {
      console.error('Sunucu 30 sn icinde acilmadi.');
      console.error(logs.slice(-2000));
      child.kill();
      process.exit(1);
    }
  }

  try {
    const health = await fetch(`${base}/api/health`);
    check('GET /api/health', health.status === 200, String(health.status));

    const index = await fetch(`${base}/`);
    const html = await index.text();
    const cookies = index.headers.getSetCookie?.() ?? [];
    const cookie = cookies.map((c) => c.split(';')[0]).find((c) => c.startsWith('residue_token='));
    const htmlType = index.headers.get('content-type') ?? '';
    check('GET /', index.status === 200, String(index.status));
    check('GET / icerik html', htmlType.includes('text/html'), htmlType);
    check('GET / kabuk (div#root)', html.includes('id="root"'));
    check('cerez HttpOnly', cookies.some((c) => /HttpOnly/i.test(c)));
    check('cerez SameSite=Strict', cookies.some((c) => /SameSite=Strict/i.test(c)));
    check('HTML icinde token YOK', !html.includes('residue_token') && !html.includes('token='));
    check('cerez alindi', Boolean(cookie));

    const assetMatch = html.match(/src="(\/assets\/[^"]+\.js)"/);
    if (assetMatch) {
      const asset = await fetch(`${base}${assetMatch[1]}`, { headers: { cookie } });
      check('GET statik JS', asset.status === 200, String(asset.status));
    } else {
      check('GET statik JS', false, 'derlenmis kabukta assets bulunamadi');
    }

    const unauthorized = await fetch(`${base}/api/meta`);
    check('tokensiz /api/meta 401', unauthorized.status === 401, String(unauthorized.status));

    const badHost = await rawGet(base, '/api/meta', 'evil.example');
    check('yabanci Host 403', badHost === 403, String(badHost));

    const reads = [
      '/api/meta',
      '/api/dashboard',
      '/api/disk',
      '/api/latest',
      '/api/update',
      '/api/scan/status',
      '/api/findings',
      '/api/settings',
      '/api/env',
      '/api/projects/roots',
      '/api/graph',
      '/api/schedules',
      '/api/schedules/catchup',
      '/api/schedules/history',
      '/api/recover',
      '/api/vault',
      '/api/cli/view',
    ];

    for (const path of reads) {
      const res = await fetch(`${base}${path}`, { headers: { cookie } });
      const type = res.headers.get('content-type') ?? '';
      check(`GET ${path}`, res.status === 200 && type.includes('application/json'), String(res.status));
    }

    // Kok verilmezse kesif 400 ile REDDEDER (yol uydurulmaz).
    const discover = await fetch(`${base}/api/projects/discover`, { headers: { cookie } });
    const discoverBody = await discover.json().catch(() => ({}));
    check(
      'GET /api/projects/discover (koksuz 400)',
      discover.status === 400 && String(discoverBody.error ?? '').includes('kok'),
      String(discover.status),
    );

    const post = async (path, body) => {
      const res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json', origin: base },
        body: JSON.stringify(body),
      });
      await res.arrayBuffer();
      return res.status;
    };

    check('plan (bos secim) 400', (await post('/api/plan', {})) === 400);
    check('schedule onaysiz 400', (await post('/api/schedules', {})) === 400);
    check('kasaya kalici silme onaysiz 400', (await post('/api/vault/purge', { phrase: 'yanlis' })) === 400);
    check('env uygulama plansiz 404', (await post('/api/env/apply', {})) === 404);
    check('execute gecersiz plan 4xx', (await post('/api/execute', {})) >= 400);
  } finally {
    if (child) {
      child.kill();
      await sleep(400);
      if (!child.killed) child.kill('SIGKILL');
    }
  }

  console.log(failures === 0 ? '\nSMOKE TEMIZ' : `\nSMOKE BASARISIZ (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

await main();
