import { readLog, clearLog, logDir } from '../util/log.ts';
import { prettyPath } from '../util/longpath.ts';
import { formatDateTime } from '../util/format.ts';
import type { Level } from '../util/log.ts';

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m',
  cyan: '\x1b[36m', gray: '\x1b[90m',
};

const LEVEL_COLOR: Record<Level, string> = {
  info: C.cyan,
  warn: C.yellow,
  error: C.red,
  debug: C.gray,
};

/**
 * Gunluk komutu.
 *
 * Amac: "bu arac neden oyle karar verdi" sorusunun cevabini
 * programdan cikabilmek. Ozellikle siniflandirma gerekceleri ve
 * silme hatalari burada gorulur.
 */
export async function runLog(args: string[]): Promise<void> {
  const wants = (f: string) => args.includes(f);

  if (wants('--clear')) {
    await clearLog();
    console.log(`${C.green}Gunluk temizlendi.${C.reset}`);
    return;
  }

  const levelArg = args.find((a) => a.startsWith('--level='))?.split('=')[1] as Level | undefined;
  const limitArg = args.find((a) => a.startsWith('--n='))?.split('=')[1];
  const limit = limitArg ? Number(limitArg) : wants('--all') ? undefined : 80;
  const sinceArg = args.find((a) => a.startsWith('--since='))?.split('=')[1];

  let since: number | undefined;
  if (sinceArg) {
    const h = Number(sinceArg);
    since = Date.now() - (h > 48 ? h : h * 3600_000);
  }

  const entries = await readLog({ level: levelArg, since, limit });

  if (entries.length === 0) {
    console.log(`${C.gray}Gunluk bos veya filtreye uyan kayit yok.${C.reset}`);
    console.log(`${C.dim}Konum: ${prettyPath(logDir())}${C.reset}\n`);
    return;
  }

  console.log(`\n${C.bold}CLICleaner gunlugu${C.reset} ${C.gray}(${entries.length} kayit)${C.reset}`);
  console.log(`${C.gray}${'─'.repeat(78)}${C.reset}\n`);

  for (const e of entries) {
    const lc = LEVEL_COLOR[e.level] ?? C.gray;
    const tag =
      e.level === 'error' ? `${lc}HATA${C.reset}` : e.level === 'warn' ? `${lc}UYARI${C.reset}` : `${lc}${e.level.toUpperCase().padEnd(5)}${C.reset}`;
    console.log(`${C.gray}${formatDateTime(Date.parse(e.at))}${C.reset} ${tag} ${e.msg}`);

    if (e.data) {
      const d = e.data;
      // En bilgilendirici alanlari one al
      const keys = Object.keys(d);
      const parts: string[] = [];
      for (const k of keys.slice(0, 8)) {
        const v = d[k];
        if (v === undefined || v === null) continue;
        if (Array.isArray(v)) {
          parts.push(`${k}=[${v.length}]${v.length && typeof v[0] === 'string' ? ' ' + v.slice(0, 3).join(',') : ''}`);
        } else if (typeof v === 'object') {
          parts.push(`${k}=${JSON.stringify(v).slice(0, 90)}`);
        } else {
          parts.push(`${k}=${String(v).slice(0, 70)}`);
        }
      }
      if (parts.length) console.log(`       ${C.dim}${parts.join('  ')}${C.reset}`);
    }
  }

  console.log(`\n${C.gray}Konum: ${prettyPath(logDir())}${C.reset}`);
  console.log(`${C.dim}Filtre: --level=error --since=24 --n=200 --clear${C.reset}\n`);
}

/** Ozet rapor: ne oldu, ne hata var. */
export async function runLogSummary(): Promise<void> {
  const all = await readLog({ since: Date.now() - 3600_000 });
  const errors = all.filter((e) => e.level === 'error');
  const warns = all.filter((e) => e.level === 'warn');
  const classifies = all.filter((e) => e.msg === 'siniflandirma');

  console.log(`\n${C.bold}Son 1 saat ozeti${C.reset}\n`);
  console.log(`  ${C.gray}siniflandirma :${C.reset} ${classifies.length}`);
  console.log(`  ${C.yellow}uyari         :${C.reset} ${warns.length}`);
  console.log(`  ${C.red}hata          :${C.reset} ${errors.length}`);

  if (errors.length > 0) {
    console.log(`\n${C.bold}Hatalar:${C.reset}`);
    const seen = new Set<string>();
    for (const e of errors.slice(-20)) {
      const key = e.msg;
      if (seen.has(key)) continue;
      seen.add(key);
      console.log(`  ${C.red}*${C.reset} ${e.msg}`);
      if (e.data?.err) console.log(`    ${C.dim}${String(e.data.err).slice(0, 100)}${C.reset}`);
    }
  }

  if (warns.length > 0) {
    const byMsg = new Map<string, number>();
    for (const w of warns) byMsg.set(w.msg, (byMsg.get(w.msg) ?? 0) + 1);
    console.log(`\n${C.bold}Uyari turleri:${C.reset}`);
    for (const [m, n] of [...byMsg].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
      console.log(`  ${C.yellow}!${C.reset} ${m} ${C.gray}(${n} kez)${C.reset}`);
    }
  }
  console.log('');
}