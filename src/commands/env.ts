import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import {
  ENV_CLEAN_PHRASE,
  analyzeEnvironment,
  applyEnvPlan,
  buildEnvCleanupPlan,
  readEnvironmentSnapshot,
  restoreEnvironmentBackup,
  type EnvScope,
  type PathCleanupOptions,
} from '../core/env-engine.ts';

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m', gray: '\x1b[90m',
};

/**
 * `residue env` — Windows ortam degiskenleri ve PATH analizi.
 *
 * Varsayilan SALT OKUNUR. `--clean --apply` yazili onay ister; once
 * yedek alinir. Machine (HKLM) degisikligi yonetici hakki ister.
 */
export async function runEnv(args: string[]): Promise<void> {
  const json = args.includes('--json');
  const clean = args.includes('--clean');
  const apply = args.includes('--apply');
  const restoreIdx = args.indexOf('--restore');
  const restoreFile = restoreIdx >= 0 ? args[restoreIdx + 1] : undefined;
  const scopeArg = valueOf(args, '--scope') ?? 'user';
  const scope: EnvScope | 'both' =
    scopeArg === 'machine' || scopeArg === 'both' ? scopeArg : 'user';

  if (restoreFile) {
    const r = await restoreEnvironmentBackup(restoreFile);
    if (json) {
      console.log(JSON.stringify(r, null, 2));
      return;
    }
    console.log(`\n  ${r.ok ? 'Geri yuklendi' : 'Geri yukleme basarisiz'} — ${r.applied} degisken`);
    for (const e of r.errors) console.log(`  ${C.red}!${C.reset} ${e.scope}/${e.name}: ${e.reason}`);
    return;
  }

  if (!clean) {
    const snapshot = await readEnvironmentSnapshot();
    const analysis = analyzeEnvironment(snapshot);
    if (json) {
      console.log(
        JSON.stringify(
          {
            note: snapshot.note,
            user: snapshot.user.map((v) => ({ name: v.name, type: v.type, value: v.display })),
            machine: snapshot.machine.map((v) => ({ name: v.name, type: v.type, value: v.display })),
            path: analysis.pathEntries,
            commandShadows: analysis.commandShadows,
            orphanVariables: analysis.orphanVariables.map((v) => ({
              name: v.name,
              scope: v.scope,
              value: v.display,
            })),
            findings: analysis.findings,
          },
          null,
          2,
        ),
      );
      return;
    }
    printEnvReport(analysis);
    return;
  }

  const opts: PathCleanupOptions = {
    scope,
    removeMissing: !args.includes('--keep-missing'),
    removeDuplicates: !args.includes('--keep-duplicates'),
  };
  const { analysis, plan } = await buildEnvCleanupPlan(opts);

  if (json && !apply) {
    console.log(JSON.stringify({ plan, findings: analysis.findings }, null, 2));
    return;
  }
  if (!json) printEnvReport(analysis);
  if (plan.empty) {
    console.log(`\n  ${C.green}Temizlenecek PATH girdisi yok.${C.reset}\n`);
    return;
  }

  console.log(`\n  ${C.bold}Ortam plani${C.reset}`);
  for (const ch of plan.changes) {
    console.log(`\n  ${C.cyan}${ch.scope} / ${ch.name}${C.reset} (${ch.reason})`);
    console.log(`    ${C.dim}once :${C.reset} ${ch.before ?? '(yok)'}`);
    console.log(`    ${C.dim}sonra:${C.reset} ${ch.after ?? '(silinecek)'}`);
  }
  for (const w of plan.warnings) console.log(`\n  ${C.yellow}!${C.reset} ${w}`);
  console.log('');

  if (!apply) {
    console.log(`  ${C.gray}Uygulamak icin: residue env --clean --apply${C.reset}\n`);
    return;
  }

  let phrase = valueOf(args, '--phrase') ?? '';
  if (!phrase && stdin.isTTY) {
    const rl = createInterface({ input: stdin, output: stdout });
    phrase = await rl.question(`  Onaylamak icin "${ENV_CLEAN_PHRASE}" yaz: `);
    rl.close();
  }
  const result = await applyEnvPlan(plan, { phrase, reason: 'residue env --clean' });
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(
    `\n  ${result.ok ? C.green : C.red}${result.ok ? 'Tamam' : 'Basarisiz'}${C.reset} — ` +
      `${result.applied} uygulandi, ${result.failed} hata`,
  );
  if (result.backupFile) console.log(`  ${C.dim}Yedek: ${result.backupFile}${C.reset}`);
  for (const e of result.errors) console.log(`  ${C.red}!${C.reset} ${e.scope}/${e.name}: ${e.reason}`);
  console.log('');
}

function valueOf(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

function printEnvReport(analysis: ReturnType<typeof analyzeEnvironment>): void {
  console.log(`\n  ${C.bold}Residue — ortam degiskenleri${C.reset}\n`);
  if (analysis.snapshot.note) console.log(`  ${C.yellow}!${C.reset} ${analysis.snapshot.note}\n`);

  const counts = new Map<string, number>();
  for (const f of analysis.findings) counts.set(f.kind, (counts.get(f.kind) ?? 0) + 1);

  console.log(`  PATH girdisi     : ${analysis.pathEntries.length}`);
  console.log(`  Bulunan komut    : ${analysis.commandShadows.length} golgelenen komut`);
  console.log(`  Yetim degisken   : ${analysis.orphanVariables.length}`);
  console.log(`  Bulgular         : ${analysis.findings.length}`);
  for (const [kind, n] of counts) console.log(`    ${C.gray}${kind}: ${n}${C.reset}`);
  console.log('');

  for (const f of analysis.findings.slice(0, 40)) {
    const sev = f.severity === 'warning' ? `${C.yellow}UYARI${C.reset}` : `${C.gray}bilgi${C.reset}`;
    console.log(`  [${sev}] ${f.scope}/${f.variable}: ${f.reason}`);
    if (f.value) console.log(`          ${C.dim}${f.value}${C.reset}`);
  }
  if (analysis.findings.length > 40) {
    console.log(`  ${C.gray}... ${analysis.findings.length - 40} bulgu daha${C.reset}`);
  }
  console.log('');
}
