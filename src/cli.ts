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
import { runRepair } from './commands/repair.ts';
import { runQuarantine } from './commands/quarantine.ts';
import { ENVS, BUILTIN_PROFILES } from './core/discover.ts';
import type { Env, ScanResult } from './core/types.ts';

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m', gray: '\x1b[90m',
};

function printHelp(): void {
  console.log(`
${C.bold}CLICleaner${C.reset} — disk artiklarini kanitlarla listeler, secimini sen onaylarsin

${C.bold}Baslamak icin${C.reset}
  ${C.cyan}clicleaner${C.reset}                  Tarayici arayuzunu ac (onerilen)
  ${C.cyan}clicleaner scan${C.reset}             Terminalde tara ve listele
  ${C.cyan}clicleaner clean --dry-run${C.reset}  Plani goster; hicbir sey silme

${C.bold}Gelismis${C.reset}
  clicleaner ui --tui             Terminal arayuzu (Ink)
  clicleaner clean                Iki asamali onay + geri donusum kutusu
  clicleaner inventory [...]      Kurulu CLI envanteri (salt okunur)
  clicleaner repair [--only <ad>] Bozuk / yarim kurulumlari onar (ONAR onayi)
  clicleaner quarantine <ad>     Bagimsiz araci kasaya tasi (KARANTINA onayi, geri alinabilir)
  clicleaner explain <ad>         Bir kumenin karar gerekcesi
  clicleaner undo [--restore]     Son silmeyi geri al
  clicleaner log [--summary]      Gunluk
  clicleaner doctor               Ortam kontrolu
  clicleaner rules                Kural listesi
  clicleaner status               Proje durumu (gelistirici)

${C.bold}Ortam secimi${C.reset}  ${C.gray}(--env ile birden fazla)${C.reset}
${ENVS.map((e) => `  ${C.cyan}${e.id.padEnd(16)}${C.reset}${e.label.padEnd(26)}${C.gray}${e.description}${C.reset}`).join('\n')}

${C.bold}Profiller${C.reset}
${Object.values(BUILTIN_PROFILES).map((p) => `  ${C.cyan}${p.name.padEnd(16)}${C.reset}${p.description}`).join('\n')}

${C.bold}Secenekler${C.reset}
  --env <ad>         Ortam filtresi (tekrar edilebilir). Varsayilan: tumu
  --profile <ad>     Kayitli profil kullan (lean, audit, full)
  --min-age <gun>    Bu yastan eskiyse sadece raporla
  --exclude <ad>     Haric tut (nokta klasoru veya AppData adi)
  --root <dir>       Proje ici artiklar: yalnizca bu dizinin alt klasorleri
                     taranir; sonuclar report-only olur (silme hedefi yok)
  --all              Tum kumeleri goster (varsayilan ilk 25)
  --json             Makine okunur JSON
  --quiet            Ilerleme cubugu gosterme
  -h, --help         Bu yardim

${C.bold}Sadece clean icin${C.reset}
  --purge            Geri donusum kutusu yerine KALICI sil
  --only <ad>        Sadece bu kume/anahtari temizle (tekrar edilebilir)
  --dry-run          Sadece plani goster, hicbir sey silme
  -y, --yes          Onay sormadan calistir

${C.bold}Hassas siniflar (yalnizca acikca istenirse)${C.reset}
  --clear-history    Sohbet/oturum gecmisi klasorlerini plana dahil et
  --nuke-models      TUM model depolarini plana dahil et (DANGER)
  --reset-rules      Kural dosyalarini plana dahil et (rules/*.rules)
  ${C.gray}Not: bu bayraklar risk sinifini DEGISTIRMEZ; iki asamali onay korunur.${C.reset}

${C.bold}Web arayuzu icin${C.reset}
  --port <n>         Sabit port (varsayilan: bos port otomatik secilir)
  --browser <ad>     Acilacak tarayici: default (varsayilan) | edge
  --no-open          Tarayiciyi otomatik acma, yalnizca adresi yaz
  --tui              Terminal arayuzunu kullan (varsayilan: tarayici)

${C.bold}Sadece inventory icin${C.reset}
  --unused <gun>     Atillik esigi (varsayilan: 21 gun)
  --all              Yakin/korunan araclari da listele
  --verbose          Kanitlari ve kaldirma komutlarini goster
  --json             Makine okunur JSON
  --report <dosya.md>  Paylasilabilir Markdown raporu yaz

${C.bold}Ornekler${C.reset}
  clicleaner
  clicleaner scan --env pkgcache
  clicleaner clean --env pkgcache
  clicleaner clean --only nuget --purge
  clicleaner inventory --unused 21 --verbose
  clicleaner inventory --report envanter.md
  clicleaner scan --profile audit --json
  clicleaner scan --root C:\\projeler\\uygulamam    Proje ici artiklari tara (rapor)
`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  // Komut verilmezse web arayuzu acilir: asil urun budur; terminal
  // komutlari (scan/clean) bilincli olarak secilir.
  const cmd = argv[0] && !argv[0].startsWith('-') ? argv[0] : 'ui';
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
    let root: string | undefined;

    for (let i = 0; i < rest.length; i++) {
      const a = rest[i];
      if (a === '--env') envs.push(rest[++i] as Env);
      else if (a === '--profile') profile = rest[++i];
      else if (a === '--min-age') minAgeDays = Number(rest[++i]);
      else if (a === '--exclude') exclude.push(rest[++i]!);
      else if (a === '--root') {
        const v = rest[++i];
        // Eksik deger sessizce tam taramaya donusmemeli: kullanici
        // proje taramasi beklerken tum diski taramis olurdu.
        if (!v || v.startsWith('-')) {
          throw new Error('--root bir dizin yolu ister. Ornek: clicleaner scan --root C:\\proje');
        }
        root = v;
      } else if (a === '--json') json = true;
      else if (a === '--all') showAll = true;
      else if (a === '--quiet') quiet = true;
    }

    const result = await runScan({ envs, profile, minAgeDays, json, includeBytes: true, exclude, quiet, root });

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
    const allow: { history?: boolean; models?: boolean; rules?: boolean } = {};

    for (let i = 0; i < rest.length; i++) {
      const a = rest[i];
      if (a === '--env') envs.push(rest[++i] as Env);
      else if (a === '--profile') profile = rest[++i];
      else if (a === '--exclude') exclude.push(rest[++i]!);
      else if (a === '--only') only.push(rest[++i]!);
      else if (a === '--purge') purge = true;
      else if (a === '--yes' || a === '-y') yes = true;
      else if (a === '--dry-run') dryRun = true;
      else if (a === '--clear-history') allow.history = true;
      else if (a === '--nuke-models') allow.models = true;
      else if (a === '--reset-rules') allow.rules = true;
    }

    await runClean({ envs, profile, purge, yes, only, exclude, dryRun, allow });
    return;
  }

  if (cmd === 'ui') {
    const envs: Env[] = [];
    const exclude: string[] = [];
    let profile: string | undefined;
    let purge = false;
    let tui = false;
    let port = 0;
    let open = true;
    let browser: 'edge' | 'default' = 'default';

    for (let i = 0; i < rest.length; i++) {
      const a = rest[i];
      if (a === '--env') envs.push(rest[++i] as Env);
      else if (a === '--profile') profile = rest[++i];
      else if (a === '--exclude') exclude.push(rest[++i]!);
      else if (a === '--purge') purge = true;
      else if (a === '--tui') tui = true;
      // Geriye uyumluluk: eski `ui --web` hala web arayuzunu acar.
      else if (a === '--web') tui = false;
      else if (a === '--port') {
        const n = Number(rest[++i]);
        if (Number.isInteger(n) && n >= 0 && n <= 65535) port = n;
      } else if (a === '--browser') {
        const v = (rest[++i] ?? '').toLowerCase();
        if (v === 'edge' || v === 'default') browser = v;
      } else if (a === '--no-open') open = false;
    }

    if (!tui) {
      const { runWeb } = await import('./web/server.ts');
      await runWeb({ envs, profile, exclude, port, open, browser });
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

  if (cmd === 'repair') {
    await runRepair(rest);
    return;
  }

  if (cmd === 'quarantine') {
    await runQuarantine(rest);
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
      // Silme hedefleri ve alt parcalar da makine okunur ciktida
      // bulunmali; aksi halde "onerilen ama hedefsiz" gibi gorunur.
      deleteTargets: (c.deleteTargets ?? []).map((t) => ({
        path: t.path,
        kind: t.kind,
        bytes: t.bytes,
        label: t.label,
        minAgeDays: t.minAgeDays,
      })),
      subparts: (c.subparts ?? []).map((s) => ({
        path: s.path,
        label: s.label,
        bytes: s.bytes,
        verdictKind: s.verdictKind,
        reason: s.reason,
      })),
    })),
  };
}

main().catch((err) => {
  console.error(`${C.red}Hata:${C.reset} ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});