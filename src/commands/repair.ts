import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { scanCliInventory, type CliTool } from '../core/cli-inventory.ts';

/**
 * `clicleaner repair` — bozuk / yarim kurulumlari terminalde gosterir
 * ve onarir.
 *
 * Onarim komutu calisirken stdout/stderr ANLIK olarak terminale akar;
 * kullanici paket yoneticisinin ne yaptigini gorur. Onay yazilidir
 * (ONAR); install betikleri calisabilecegi icin sessiz calistirma yok.
 */

const REPAIR_TIMEOUT_MS = 5 * 60_000;

export async function runRepair(args: string[]): Promise<void> {
  const only: string[] = [];
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--only') only.push(args[++i] ?? '');
    else if (a === '--dry-run') dryRun = true;
  }

  console.log('  CLI envanteri taranıyor...');
  const inv = await scanCliInventory({ unusedDays: 21 });
  const broken = uniqueBroken(inv.tools.filter((t) => t.health === 'broken'));

  if (broken.length === 0) {
    console.log('  Bozuk veya yarım kurulum bulunamadı.');
    return;
  }

  const selected = only.length
    ? broken.filter((t) => only.some((o) => matches(t, o)))
    : broken;

  if (selected.length === 0) {
    console.log(`  --only ile eşleşen bozuk araç yok. Mevcut: ${broken.map((t) => t.id).join(', ')}`);
    process.exitCode = 1;
    return;
  }

  console.log(`\n  Bozuk / yarım kurulum: ${selected.length}\n`);
  for (const t of selected) {
    console.log(`  ${t.command}  ${t.packageName}@${t.version}  [${t.source}]`);
    for (const e of t.healthEvidence ?? []) console.log(`    - ${e}`);
    console.log(`    onarım: ${t.repair?.display ?? 'paket yöneticisi yok; elle onarılmalı'}`);
    console.log('');
  }

  if (dryRun) {
    console.log('  (--dry-run: hiçbir şey çalıştırılmadı.)');
    return;
  }

  const repairable = selected.filter((t) => t.repair);
  if (repairable.length === 0) {
    console.log('  Onarılabilir araç yok (standalone araçlar elle onarılır).');
    process.exitCode = 1;
    return;
  }

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = (await rl.question('  Onaylamak için ONAR yaz: ')).trim();
    if (answer !== 'ONAR') {
      console.log('  İptal edildi.');
      return;
    }
  } finally {
    rl.close();
  }

  for (const tool of repairable) {
    const spec = tool.repair!;
    console.log(`\n  > ${spec.display}\n`);
    const r = await runStreaming(spec.program, spec.args, REPAIR_TIMEOUT_MS);
    if (r.code === 0) {
      console.log('\n  tamam');
    } else {
      console.log(`\n  hata (çıkış ${r.code ?? '?'}${r.timedOut ? ' · zaman aşımı' : ''})`);
      process.exitCode = 1;
    }
  }

  console.log('\n  Doğrulama için yeniden taranıyor...');
  const after = await scanCliInventory({ unusedDays: 21 });
  for (const tool of repairable) {
    const now = after.tools.find(
      (x) => x.id === tool.id || (x.packageName === tool.packageName && x.command === tool.command),
    );
    const state = !now ? 'bulunamadı' : now.health === 'broken' ? 'HÂLÂ BOZUK' : 'sağlıklı';
    console.log(`  ${tool.command}: ${state}`);
    if (now?.health === 'broken') process.exitCode = 1;
  }
}

/** Ayni paketin birden fazla komutu varsa tek kayit goster. */
function uniqueBroken(tools: CliTool[]): CliTool[] {
  const seen = new Map<string, CliTool>();
  for (const t of tools) {
    const key = `${t.source}:${t.packageName.toLowerCase()}`;
    if (!seen.has(key)) seen.set(key, t);
  }
  return [...seen.values()];
}

function matches(t: CliTool, query: string): boolean {
  const q = query.toLowerCase();
  return (
    t.id.toLowerCase() === q ||
    t.command.toLowerCase() === q ||
    t.packageName.toLowerCase() === q
  );
}

/** Paket yoneticisinin ciktisini canli olarak terminale akitir. */
function runStreaming(
  program: string,
  args: string[],
  timeoutMs: number,
): Promise<{ code: number | null; timedOut: boolean }> {
  return new Promise((resolve) => {
    let timedOut = false;
    let child;
    try {
      child = spawn(program, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        shell: false,
      });
    } catch (err) {
      console.error(`  ${err instanceof Error ? err.message : String(err)}`);
      resolve({ code: null, timedOut: false });
      return;
    }

    child.stdout?.on('data', (c: Buffer | string) => process.stdout.write(c));
    child.stderr?.on('data', (c: Buffer | string) => process.stderr.write(c));

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      console.error(`  ${err.message}`);
      resolve({ code: null, timedOut });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, timedOut });
    });
  });
}
