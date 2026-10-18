import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { scanCliInventory } from '../core/cli-inventory.ts';
import {
  executeCliQuarantine,
  planCliQuarantine,
} from '../actions/cli-quarantine.ts';
import { formatBytes } from '../util/format.ts';

const C = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

/**
 * Karantina: paket yoneticisi olmayan bagimsiz bir araci silmek yerine
 * kasaya tasir. Shim PATH'ten duser, durum klasorleri kopyalanir,
 * RESTORE.md ile geri donus yolu kalir.
 *
 * SALT OKUNUR tarama + yazili "KARANTINA" onayi; --yes bypass edemez.
 */
export async function runQuarantine(args: string[]): Promise<void> {
  const dryRun = args.includes('--dry-run');
  const names = args.filter((a) => !a.startsWith('-')).map((n) => n.toLowerCase());

  if (names.length === 0) {
    console.error('Kullanim: clicleaner quarantine <ad> [<ad>...] [--dry-run]');
    console.error('Yalnizca paket yoneticisi olmayan bagimsiz (standalone) araclar.');
    process.exitCode = 1;
    return;
  }

  console.log(`${C.gray}CLI envanteri taraniyor...${C.reset}`);
  const inv = await scanCliInventory({ unusedDays: 21 });

  const tools = inv.tools.filter(
    (t) =>
      t.source === 'standalone' &&
      (names.includes(t.command.toLowerCase()) || names.includes(t.id.toLowerCase())),
  );

  if (tools.length === 0) {
    console.error(
      `${C.red}Bagimsiz (standalone) arac bulunamadi.${C.reset} Yalnizca paket yoneticisi olmayan shimler karantinaya alinabilir.`,
    );
    process.exitCode = 1;
    return;
  }

  const plan = await planCliQuarantine(tools);
  if (plan.items.length === 0) {
    console.error(`${C.red}Karantina plani bos.${C.reset}`);
    process.exitCode = 1;
    return;
  }

  console.log(`\n${C.bold}KARANTINA PLANI${C.reset} ${C.gray}(${plan.items.length} arac · ${formatBytes(plan.totalBytes)})${C.reset}`);
  console.log(`${C.gray}${'─'.repeat(70)}${C.reset}`);
  for (const item of plan.items) {
    const idle = Number.isFinite(item.tool.idleDays)
      ? `${Math.max(0, Math.floor(item.tool.idleDays))} gun`
      : '?';
    console.log(
      `  ${C.yellow}${item.tool.command}${C.reset} ${C.gray}(${item.tool.status}, son sinyal ${idle}, ${formatBytes(item.totalBytes)})${C.reset}`,
    );
    for (const s of item.shims) console.log(`     ${C.cyan}shim${C.reset} ${s} ${C.dim}-> kasaya tasinir${C.reset}`);
    for (const d of item.stateDirs) console.log(`     ${C.cyan}durum${C.reset} ${d} ${C.dim}-> kasaya kopyalanir${C.reset}`);
    console.log(`     ${C.dim}kasa: ${item.vaultDir}${C.reset}`);
    for (const e of item.tool.evidence) console.log(`     ${C.gray}kanit: ${e}${C.reset}`);
  }
  console.log('');

  if (dryRun) {
    console.log(`${C.bold}DRY-RUN${C.reset} — hicbir sey tasinmadi.`);
    return;
  }

  stdout.write('  Yazili onay gerekli. Geri alinabilir ama arac PATH\'ten duser.\n');
  const rl = createInterface({ input: stdin, output: stdout });
  const ans = await rl.question('  Onaylamak icin "KARANTINA" yaz: ');
  rl.close();

  if (ans.trim() !== 'KARANTINA') {
    console.log(`${C.yellow}Vazgecildi; hicbir sey tasinmadi.${C.reset}`);
    process.exitCode = 1;
    return;
  }

  const results = await executeCliQuarantine(plan);
  console.log('');
  let failed = 0;
  for (const r of results) {
    if (r.ok) {
      console.log(
        `${C.green}OK${C.reset}  ${r.command} — ${r.movedShims.length} shim tasindi, ${r.copiedState.length} durum klasoru kopyalandi`,
      );
    } else {
      failed++;
      console.log(`${C.red}HATA${C.reset} ${r.command}${r.error ? ` — ${r.error}` : ''}`);
    }
    console.log(`     ${C.dim}kasa: ${r.vaultDir}${C.reset}`);
  }
  console.log(
    `\n${C.gray}Geri almak icin kasadaki RESTORE.md adimlarini izle; paket yoneticisi gerekmez.${C.reset}\n`,
  );
  if (failed > 0) process.exitCode = 1;
}
