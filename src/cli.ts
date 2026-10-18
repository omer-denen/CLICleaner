#!/usr/bin/env node
import { runScan, renderReport } from './commands/scan.ts';
import { runClean } from './commands/clean.ts';
import { runExplain } from './commands/explain.ts';
import { runDoctor } from './commands/doctor.ts';
import { runUndo } from './commands/undo.ts';
import { runRules } from './commands/rules.ts';
import { runLog, runLogSummary } from './commands/log.ts';
import { runStatus } from './commands/status.ts';
import { runInventory } from './commands/inventory.ts';
import { ENVS, BUILTIN_PROFILES } from './core/discover.ts';
import type { Env, ScanResult } from './core/types.ts';

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m', gray: '\x1b[90m',
};

function printHelp(): void {
  console.log(`
${C.bold}CLICleaner${C.reset} — disk artiklarini kanitlarla listeler, secimini sen onaylarsin

${C.bold}Kullanim${C.reset}
  clicleaner scan [secenekler]        Tarama yap ve listele (varsayilan)
  clicleaner clean [secenekler]       Tarama yap, onay iste, secileni sil
  clicleaner ui [--web]               Terminal TUI; --web ile tarayici arayuzu
  clicleaner inventory [secenekler]   Kurulu CLI'lari ve atillik kanitlarini listele
  clicleaner explain <ad>             Bir kumenin neden oyle karar verdigini goster
  clicleaner rules                    Kural listesini goster
  clicleaner doctor                   Ortam kontrolu
  clicleaner undo [--restore]      Son silme islemlerini listele, geri al
  clicleaner log [secenekler]      Gunluk: karar gerekceleri, uyarilar, hatalar
  clicleaner status [secenekler]  Proje durumu: nereye kadar gelindi, acik hatalar

${C.bold}Ortam secimi${C.reset}  ${C.gray}(--env ile birden fazla)${C.reset}
${ENVS.map((e) => `  ${C.cyan}${e.id.padEnd(16)}${C.reset}${e.label.padEnd(26)}${C.gray}${e.description}${C.reset}`).join('\n')}

${C.bold}Profiller${C.reset}
${Object.values(BUILTIN_PROFILES).map((p) => `  ${C.cyan}${p.name.padEnd(16)}${C.reset}${p.description}`).join('\n')}

${C.bold}Secenekler${C.reset}
  --env <ad>         Ortam filtresi (tekrar edilebilir). Varsayilan: tumu
  --profile <ad>     Kayitli profil kullan (lean, audit, full)
  --min-age <gun>    Bu yastan eskiyse sadece raporla
  --exclude <ad>     Haric tut (nokta klasoru veya AppData adi)
  --all              Tum kumeleri goster (varsayilan ilk 25)
  --json             Makine okunur JSON
  --quiet            Ilerleme cubugu gosterme
  -h, --help         Bu yardim

${C.bold}Sadece clean icin${C.reset}
  --purge            Geri donusum kutusu yerine KALICI sil
  --only <ad>        Sadece bu kume/anahtari temizle (tekrar edilebilir)
  --dry-run          Sadece plani goster, hicbir sey silme
  -y, --yes          Onay sormadan calistir

${C.bold}Sadece ui --web icin${C.reset}
  --port <n>         Sabit port (varsayilan: bos port otomatik secilir)
  --no-open          Tarayiciyi otomatik acma, yalnizca adresi yaz

${C.bold}Sadece inventory icin${C.reset}
  --unused <gun>     Atillik esigi (varsayilan: 21 gun)
  --all              Yakin/korunan araclari da listele
  --verbose          Kanitlari ve kaldirma komutlarini goster
  --json             Makine okunur JSON

${C.bold}Ornekler${C.reset}
  clicleaner scan --env pkgcache
  clicleaner clean --env pkgcache
  clicleaner clean --only nuget --purge
  clicleaner ui --web
  clicleaner inventory --unused 21 --verbose
  clicleaner scan --profile audit --json
  clicleaner scan --env agent --min-age 30
`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const cmd = argv[0] && !argv[0].startsWith('-') ? argv[0] : 'scan';
  const rest = argv[0] && !argv[0].startsWith('-') ? argv.slice(1) : argv;

  if (cmd === '-h' || cmd === '--help' || cmd === 'help') {
    printHelp();
    return;
  }

  if (cmd === 'scan') {
    const envs: Env[] = [];
    let profile: string | undefined;
    let minAgeDays = 0;
    let json = false;
    let showAll = false;
    let quiet = false;
    const exclude: string[] = [];

    for (let i = 0; i < rest.length; i++) {
      const a = rest[i];
      if (a === '--env') envs.push(rest[++i] as Env);
      else if (a === '--profile') profile = rest[++i];
      else if (a === '--min-age') minAgeDays = Number(rest[++i]);
      else if (a === '--exclude') exclude.push(rest[++i]!);
      else if (a === '--json') json = true;
      else if (a === '--all') showAll = true;
      else if (a === '--quiet') quiet = true;
    }

    const result = await runScan({ envs, profile, minAgeDays, json, includeBytes: true, exclude, quiet });

    if (json) {
      console.log(JSON.stringify(toJson(result), null, 2));
    } else {
      renderReport(result, showAll);
    }
    return;
  }

  if (cmd === 'clean') {
    const envs: Env[] = [];
    const only: string[] = [];
    const exclude: string[] = [];
    let profile: string | undefined;
    let purge = false;
    let yes = false;
    let dryRun = false;

    for (let i = 0; i < rest.length; i++) {
      const a = rest[i];
      if (a === '--env') envs.push(rest[++i] as Env);
      else if (a === '--profile') profile = rest[++i];
      else if (a === '--exclude') exclude.push(rest[++i]!);
      else if (a === '--only') only.push(rest[++i]!);
      else if (a === '--purge') purge = true;
      else if (a === '--yes' || a === '-y') yes = true;
      else if (a === '--dry-run') dryRun = true;
    }

    await runClean({ envs, profile, purge, yes, only, exclude, dryRun });
    return;
  }

  if (cmd === 'ui') {
    const envs: Env[] = [];
    const exclude: string[] = [];
    let profile: string | undefined;
    let purge = false;
    let web = false;
    let port = 0;
    let open = true;

    for (let i = 0; i < rest.length; i++) {
      const a = rest[i];
      if (a === '--env') envs.push(rest[++i] as Env);
      else if (a === '--profile') profile = rest[++i];
      else if (a === '--exclude') exclude.push(rest[++i]!);
      else if (a === '--purge') purge = true;
      else if (a === '--web') web = true;
      else if (a === '--port') {
        const n = Number(rest[++i]);
        if (Number.isInteger(n) && n >= 0 && n <= 65535) port = n;
      } else if (a === '--no-open') open = false;
    }

    if (web) {
      const { runWeb } = await import('./web/server.ts');
      await runWeb({ envs, profile, exclude, port, open });
      return;
    }

    const { runTui } = await import('./commands/tui.ts');
    await runTui({ envs, profile, exclude, mode: purge ? 'purge' : 'recycle' });
    return;
  }

  if (cmd === 'inventory') {
    await runInventory(rest);
    return;
  }

  if (cmd === 'status') {
    await runStatus(rest);
    return;
  }

  if (cmd === 'log') {
    if (rest.includes('--summary')) {
      await runLogSummary();
    } else {
      await runLog(rest);
    }
    return;
  }

  if (cmd === 'explain') {
    await runExplain(rest[0], { json: rest.includes('--json') });
    return;
  }

  if (cmd === 'doctor') {
    await runDoctor();
    return;
  }

  if (cmd === 'undo') {
    await runUndo(rest.includes('--restore'));
    return;
  }

  if (cmd === 'rules') {
    runRules();
    return;
  }

  console.log(`Komut henuz uygulanmadi: ${cmd}`);
  console.log(`Simdilik 'scan' ve 'clean' calisiyor. --help icin: clicleaner --help`);
}

function toJson(r: Awaited<ReturnType<typeof runScan>>) {
  return {
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    stats: r.stats,
    clusters: r.clusters.map((c) => ({
      key: c.key,
      title: c.title,
      archetype: c.archetype,
      totalBytes: c.totalBytes,
      reclaimableBytes: c.reclaimableBytes,
      lastTouched: c.lastTouched,
      verdict: c.verdict,
      evidence: c.evidence,
      parts: c.parts.map((p) => ({
        path: p.path,
        bytes: p.bytes,
        files: p.files,
        origin: p.origin,
      })),
    })),
  };
}

main().catch((err) => {
  console.error(`${C.red}Hata:${C.reset} ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});