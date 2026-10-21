import { markInterruptedOperations } from '../core/operation-journal.ts';

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', gray: '\x1b[90m',
};

/**
 * `residue recover` — yarim kalan islemleri raporlar.
 *
 * Otomatik "tamamlama" yapmaz: yarim kalan yollari ve durumlarini
 * gosterir, journal dosyasini `.crashed` olarak arsivler. Boylece
 * crash sonrasi sessiz veri kaybi izlenimi olusmaz.
 */
export async function runRecover(args: string[]): Promise<void> {
  const json = args.includes('--json');
  const interrupted = await markInterruptedOperations();
  if (json) {
    console.log(JSON.stringify(interrupted, null, 2));
    return;
  }
  console.log(`\n  ${C.bold}Residue — yarim kalan islemler${C.reset}\n`);
  if (interrupted.length === 0) {
    console.log(`  ${C.green}Yarim kalan islem yok.${C.reset}\n`);
    return;
  }
  for (const op of interrupted) {
    console.log(
      `  ${C.yellow}!${C.reset} ${new Date(op.startedAt).toLocaleString()} · ${op.mode ?? '?'} · ` +
        `${op.items.length} yarim oge`,
    );
    console.log(`    ${C.dim}${op.file}${C.reset}`);
    for (const i of op.items.slice(0, 10)) {
      console.log(`    - ${i.state}: ${i.path ?? i.itemId}${i.reason ? ` (${i.reason})` : ''}`);
    }
    if (op.items.length > 10) console.log(`    ${C.gray}... ${op.items.length - 10} daha${C.reset}`);
  }
  console.log(`\n  ${C.gray}Kasa icerigi: residue undo --restore${C.reset}\n`);
}
