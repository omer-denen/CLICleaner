import { scanCliInventory, type CliTool } from '../core/cli-inventory.ts';
import { SOURCE_LABEL, renderInventoryMarkdown } from '../core/cli-inventory-report.ts';
import { formatBytes } from '../util/format.ts';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m',
  cyan: '\x1b[36m', gray: '\x1b[90m', magenta: '\x1b[35m',
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
  let reportFile: string | null = null;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === undefined) continue;
    if (a === '--unused') {
      const n = Number(args[i + 1]);
      if (Number.isFinite(n) && n > 0) unusedDays = Math.floor(n);
    }
    if (a === '--report' || a.startsWith('--report=')) {
      const inline = a.startsWith('--report=') ? a.slice('--report='.length) : '';
      const val = inline || args[i + 1] || '';
      if (!val || (!inline && val.startsWith('--'))) {
        console.error('Kullanim: residue inventory --report <dosya.md>');
        process.exitCode = 1;
        return;
      }
      reportFile = val;
    }
  }

  const inv = await scanCliInventory({ unusedDays });

  if (reportFile) {
    const target = resolve(reportFile);
    try {
      await writeFile(target, renderInventoryMarkdown(inv), 'utf8');
    } catch (err) {
      console.error(`Rapor yazilamadi: ${(err as Error).message}`);
      process.exitCode = 1;
      return;
    }
    const unusedCount = inv.tools.filter((t) => t.status === 'unused').length;
    console.log(`${C.bold}Rapor yazildi:${C.reset} ${target}`);
    console.log(
      `${C.gray}${inv.tools.length} arac · ${unusedCount} atil · atillik esigi ${inv.unusedDays} gun · SALT OKUNUR${C.reset}\n`,
    );
    return;
  }

  if (json) {
    console.log(JSON.stringify(inv, null, 2));
    return;
  }

  console.log(`\n${C.bold}Residue — CLI envanteri${C.reset}`);
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

  if (inv.shimIssues.length > 0) {
    console.log(`${C.yellow}${C.bold}SHIM SORUNLARI${C.reset}`);
    console.log(`${C.gray}${'─'.repeat(70)}${C.reset}`);
    for (const s of inv.shimIssues) {
      const kind =
        s.kind === 'orphan-shim' ? 'oksuz shim' : s.kind === 'missing-shim' ? 'shim yok' : 'bos scope';
      console.log(`  ${C.yellow}${kind.padEnd(11)}${C.reset} ${s.path}`);
      console.log(`              ${C.dim}${s.detail}${C.reset}`);
    }
    console.log(`${C.dim}  SALT OKUNUR: shim sorunlari silinmez; once raporlayin.${C.reset}`);
    console.log('');
  }

  const nr = inv.nodeRuntimes;
  if (nr && nr.copies.length >= 2) {
    console.log(`${C.magenta}${C.bold}NODE SURUM KOPYALARI${C.reset}`);
    console.log(`${C.gray}${'─'.repeat(70)}${C.reset}`);
    console.log(
      `  ${C.gray}kok: ${nr.roots.map((r) => `${r.path} (${r.kind})`).join(' · ') || '-'}${C.reset}`,
    );
    console.log(
      `  ${C.gray}aktif: ${nr.activeVersion ? `v${nr.activeVersion}` : 'belirlenemedi'}${C.reset}`,
    );
    for (const c of nr.copies) {
      const tag = c.active
        ? `${C.green}AKTIF ${C.reset}`
        : c.review
          ? `${C.yellow}INCELE${C.reset}`
          : `${C.dim}atil  ${C.reset}`;
      console.log(`  ${tag} v${c.version.padEnd(12)} ${C.dim}${c.nodeExe}${C.reset}`);
      if (c.globalModules) {
        console.log(
          `          ${C.gray}global paket: ${c.globalPackageCount}${C.reset}`,
        );
      }
    }
    console.log(
      `${C.dim}  SALT OKUNUR: eski surumler otomatik secilmez; kaldirma o surumun npm'i ile yapilir.${C.reset}`,
    );
    console.log('');
  }

  const pc = inv.pathChannels;
  if (pc && (pc.duplicates.length > 0 || pc.missing.length > 0)) {
    console.log(`${C.magenta}${C.bold}PATH KAYNAKLARI (User / Machine)${C.reset}`);
    console.log(`${C.gray}${'─'.repeat(70)}${C.reset}`);
    console.log(
      `  ${C.gray}User ${pc.userDirs.length} dizin · Machine ${pc.machineDirs.length} dizin · birlesik ${pc.mergedDirs} tekil${C.reset}`,
    );
    for (const d of pc.duplicates) {
      console.log(`  ${C.magenta}cakisma${C.reset}  ${d.path}`);
      console.log(`            ${C.dim}${d.detail} (${d.sources.join(' + ')})${C.reset}`);
    }
    for (const m of pc.missing.slice(0, 10)) {
      console.log(
        `  ${C.yellow}diskte yok${C.reset} ${m.path} ${C.dim}(${m.source === 'user' ? 'User' : 'Machine'})${C.reset}`,
      );
    }
    console.log(`${C.dim}  SALT OKUNUR: PATH degistirilmez, kayit defterine yazilmaz.${C.reset}`);
    console.log('');
  }

  if (inv.pathShadows.length > 0) {
    console.log(`${C.magenta}${C.bold}PATH GOLGELEME${C.reset}`);
    console.log(`${C.gray}${'─'.repeat(70)}${C.reset}`);
    for (const s of inv.pathShadows) {
      console.log(`  ${C.magenta}${s.command}${C.reset} — ${s.detail}`);
      s.entries.forEach((e, i) => {
        const tag = i === 0 ? `${C.green}calisir${C.reset}` : `${C.dim}golgede${C.reset}`;
        console.log(`     ${tag}  ${e.path} ${C.dim}[${e.label}]${C.reset}`);
      });
    }
    console.log('');
  }

  console.log(`${C.gray}${'─'.repeat(70)}${C.reset}`);
  console.log(
    `${C.bold}  Atil: ${unused.length}${C.reset}${C.gray} · dogrulama: ${unknown.length} · yakin: ${recent.length} · korunan: ${protectedTools.length} · shim sorunu: ${inv.shimIssues.length} · PATH cakismasi: ${inv.pathChannels?.duplicates.length ?? 0}${C.reset}`,
  );
  console.log(`${C.dim}  Bu komut SALT OKUNUR; hicbir sey silinmedi.${C.reset}`);
  console.log(`${C.dim}  Kaldirma icin: residue cli-remove <ad> (gelecek surum)${C.reset}\n`);
}

export type { CliTool };
