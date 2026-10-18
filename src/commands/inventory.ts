import { scanCliInventory, type CliTool } from '../core/cli-inventory.ts';
import { formatBytes } from '../util/format.ts';

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m',
  cyan: '\x1b[36m', gray: '\x1b[90m', magenta: '\x1b[35m',
};

const SOURCE_LABEL: Record<string, string> = {
  'npm-global': 'npm -g',
  'uv-tool': 'uv tool',
  'dotnet-tool': 'dotnet tool',
  'pip-user': 'pip --user',
  standalone: 'bagimsiz',
};

/**
 * CLI envanteri.
 *
 * SALT OKUNUR: hicbir sey silinmez, hicbir sey kurulmaz. Amac
 * "hangi komut kurulu, en son ne zaman kullanildi, kaldirmak icin
 * hangi komut gerekir" sorusunu kanitlariyla cevaplamaktir.
 */
export async function runInventory(args: string[]): Promise<void> {
  const json = args.includes('--json');
  const all = args.includes('--all');
  const verbose = args.includes('--verbose') || args.includes('-v');
  let unusedDays = 21;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--unused') {
      const n = Number(args[i + 1]);
      if (Number.isFinite(n) && n > 0) unusedDays = Math.floor(n);
    }
  }

  const inv = await scanCliInventory({ unusedDays });

  if (json) {
    console.log(JSON.stringify(inv, null, 2));
    return;
  }

  console.log(`\n${C.bold}CLICleaner — CLI envanteri${C.reset}`);
  console.log(
    `${C.gray}${inv.tools.length} arac · ${inv.roots.length} depo · atillik esigi: ${inv.unusedDays} gun${C.reset}`,
  );
  if (inv.notes.length > 0) {
    for (const n of inv.notes) console.log(`${C.dim}  not: ${n}${C.reset}`);
  }
  console.log('');

  const show = (t: CliTool) => {
    const idle = Number.isFinite(t.idleDays) ? `${Math.max(0, Math.floor(t.idleDays))}g` : '?';
    const status =
      t.status === 'unused'
        ? `${C.red}${C.bold}ATIL${C.reset}`
        : t.status === 'unknown'
          ? `${C.yellow}?   ${C.reset}`
          : t.status === 'recent'
            ? `${C.green}OK  ${C.reset}`
            : `${C.cyan}KORU${C.reset}`;
    const src = (SOURCE_LABEL[t.source] ?? t.source).padEnd(12);
    console.log(
      `  ${status} ${t.command.padEnd(18)} ${C.gray}${src}${C.reset} ${(t.version || '-').padEnd(13)} ${C.gray}son sinyal ${idle.padStart(5)}${C.reset}  ${formatBytes(t.totalBytes)}`,
    );
    console.log(`        ${C.dim}${t.installPath}${C.reset}`);
  };

  const unused = inv.tools.filter((t) => t.status === 'unused');
  const unknown = inv.tools.filter((t) => t.status === 'unknown');
  const recent = inv.tools.filter((t) => t.status === 'recent');
  const protectedTools = inv.tools.filter((t) => t.status === 'protected');

  if (unused.length > 0) {
    console.log(`${C.red}${C.bold}ATIL ARACLAR (${inv.unusedDays}+ gun sinyal yok)${C.reset}`);
    console.log(`${C.gray}${'─'.repeat(70)}${C.reset}`);
    for (const t of unused) {
      show(t);
      for (const e of t.evidence) console.log(`        ${C.gray}· ${e}${C.reset}`);
      if (t.uninstall) console.log(`        ${C.cyan}$ ${t.uninstall.display}${C.reset}`);
      console.log('');
    }
  }

  if (unknown.length > 0 && (all || verbose)) {
    console.log(`${C.yellow}DOGRULAMA GEREKIYOR (gecmiste kullanilmis, guncelligi belirsiz)${C.reset}`);
    console.log(`${C.gray}${'─'.repeat(70)}${C.reset}`);
    for (const t of unknown) {
      show(t);
      for (const e of t.evidence) console.log(`        ${C.gray}· ${e}${C.reset}`);
      if (t.uninstall) console.log(`        ${C.cyan}$ ${t.uninstall.display}${C.reset}`);
      console.log('');
    }
  }

  if (recent.length > 0 && (all || verbose)) {
    console.log(`${C.green}YAKINDA KULLANILDI${C.reset}`);
    console.log(`${C.gray}${'─'.repeat(70)}${C.reset}`);
    for (const t of recent) show(t);
    console.log('');
  }

  if (protectedTools.length > 0 && (all || verbose)) {
    console.log(`${C.cyan}KORUNAN TABAN ARACLARI${C.reset}`);
    console.log(`${C.gray}${'─'.repeat(70)}${C.reset}`);
    for (const t of protectedTools) show(t);
    console.log('');
  }

  if (inv.duplicates.length > 0) {
    console.log(`${C.magenta}${C.bold}COKLU KURULUM (birlestirme adaylari)${C.reset}`);
    console.log(`${C.gray}${'─'.repeat(70)}${C.reset}`);
    for (const d of inv.duplicates) {
      const keep = inv.tools.find((t) => t.id === d.keepId);
      console.log(`  ${C.magenta}${d.command}${C.reset} — tut: ${keep ? `${keep.source} (${keep.id})` : d.keepId}`);
      console.log(`     ${C.gray}${d.reason}${C.reset}`);
      for (const rid of d.removeIds) {
        const r = inv.tools.find((t) => t.id === rid);
        if (r?.uninstall) console.log(`     ${C.dim}kaldir: $ ${r.uninstall.display}${C.reset}`);
      }
      console.log('');
    }
  }

  const stale = inv.tools.flatMap((t) => t.stalePaths.map((p) => ({ tool: t, path: p })));
  if (stale.length > 0) {
    console.log(`${C.yellow}${C.bold}ESKI SURUM KALINTILARI${C.reset}`);
    console.log(`${C.gray}${'─'.repeat(70)}${C.reset}`);
    for (const s of stale) console.log(`  ${C.yellow}${s.tool.command}${C.reset}  ${C.dim}${s.path}${C.reset}`);
    console.log('');
  }

  console.log(`${C.gray}${'─'.repeat(70)}${C.reset}`);
  console.log(
    `${C.bold}  Atil: ${unused.length}${C.reset}${C.gray} · dogrulama: ${unknown.length} · yakin: ${recent.length} · korunan: ${protectedTools.length}${C.reset}`,
  );
  console.log(`${C.dim}  Bu komut SALT OKUNUR; hicbir sey silinmedi.${C.reset}`);
  console.log(`${C.dim}  Kaldirma icin: clicleaner cli-remove <ad> (gelecek surum)${C.reset}\n`);
}

export type { CliTool };
