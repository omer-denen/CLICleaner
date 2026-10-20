import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { formatBytes, formatDateTime } from '../util/format.ts';
import { prettyPath } from '../util/longpath.ts';
import { listVaultEntries, restoreAllVault } from '../actions/vault.ts';

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m',
  cyan: '\x1b[36m', gray: '\x1b[90m',
};

/**
 * Geri alma: Windows Geri Donusum Kutusu yerine aracin KENDI kasasi.
 *
 * Kaynak: `%LOCALAPPDATA%\clicleaner\vault\<batch>\manifest.json`.
 * Kalici silinen (purge) kayitlar geri getirilemez.
 */
export async function runUndo(allowPurge: boolean): Promise<void> {
  const entries = await listVaultEntries();

  console.log(`\n${C.bold}CLICleaner — kasa / geri alma${C.reset}\n`);
  if (entries.length === 0) {
    console.log(`${C.yellow}Kasada geri alinacak kayit yok.${C.reset}`);
    console.log(`${C.dim}Kalici silinen dosyalar geri getirilemez.${C.reset}\n`);
    return;
  }

  const total = entries.reduce((a, e) => a + e.bytes, 0);
  console.log(
    `  ${C.green}Kasada (geri alinabilir):${C.reset} ${entries.length} kayit, ${formatBytes(total)}`,
  );
  console.log(`\n${C.bold}Son kasaya alinanlar:${C.reset}`);
  for (const e of entries.slice(0, 12)) {
    console.log(
      `  ${C.green}[kasa]${C.reset} ${prettyPath(e.originalPath)} ${C.gray}${formatBytes(e.bytes)}${C.reset} ${C.gray}${formatDateTime(e.at)}${C.reset}`,
    );
  }
  if (entries.length > 12) {
    console.log(`  ${C.dim}... +${entries.length - 12} kayit daha${C.reset}`);
  }

  if (!allowPurge) {
    console.log(`\n${C.gray}Geri yuklemek icin:${C.reset} ${C.cyan}clicleaner undo --restore${C.reset}\n`);
    return;
  }

  const rl = createInterface({ input: stdin, output: stdout });
  const ans = await rl.question(`${C.yellow}Kasayi geri yuklemek icin 'evet': ${C.reset}`);
  rl.close();

  if (!/^evet|^e$|^yes|^y$/i.test(ans.trim())) {
    console.log(`${C.yellow}Iptal.${C.reset}`);
    return;
  }

  const r = await restoreAllVault();
  console.log(`\n${C.green}Geri yuklendi: ${r.restored} kayit${C.reset}`);
  if (r.conflict > 0) {
    console.log(
      `${C.yellow}Cakisma: ${r.conflict} kayit orijinal yol dolu oldugu icin ".restored-<zaman>" olarak geri kondu.${C.reset}`,
    );
  }
  if (r.failed > 0) console.log(`${C.red}Basarisiz: ${r.failed}${C.reset}`);
  console.log('');
}
