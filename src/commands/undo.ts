import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { longPath } from '../util/longpath.ts';
import { formatBytes, formatDateTime } from '../util/format.ts';
import { prettyPath } from '../util/longpath.ts';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { recycleRestore, exists } from '../actions/restore.ts';

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m',
  cyan: '\x1b[36m', gray: '\x1b[90m',
};

interface Entry {
  at: number;
  mode: 'recycle' | 'purge';
  action: 'deleted' | 'skipped' | 'failed';
  path: string;
  bytes: number;
  reason?: string;
}

/** Son calistirmalarin gunluklerini bulur ve geri alma secenegi sunar. */
export async function runUndo(allowPurge: boolean): Promise<void> {
  const dir = join(process.env.LOCALAPPDATA ?? '.', 'clicleaner', 'journals');
  const journals = await listJournals(dir);

  if (journals.length === 0) {
    console.log(`${C.yellow}Silme gunlugu bulunamadi.${C.reset}`);
    console.log(`${C.dim}Gunluk konumu: ${prettyPath(dir)}${C.reset}`);
    return;
  }

  // En son gecerli gunlugu sec
  const all: Entry[] = [];
  for (const j of journals) {
    try {
      const txt = await readFile(longPath(j.path), 'utf8');
      const arr = JSON.parse(txt) as Entry[];
      for (const e of arr) all.push({ ...e, path: e.path, at: e.at });
    } catch {
      /* bozuk gunlugu atla */
    }
  }

  const deleted = all.filter((e) => e.action === 'deleted');
  if (deleted.length === 0) {
    console.log(`${C.yellow}Gecerli silme kaydi yok.${C.reset}`);
    return;
  }

  // Ayni yollari tekillestir (en son kayit gecerli)
  const seen = new Map<string, Entry>();
  for (const e of deleted) seen.set(e.path.toLowerCase(), e);
  const targets = [...seen.values()].sort((a, b) => b.at - a.at);

  const recycleOnly = targets.filter((e) => e.mode === 'recycle');
  const purged = targets.filter((e) => e.mode === 'purge');

  console.log(`\n${C.bold}CLICleaner — geri alma${C.reset}\n`);
  console.log(`  ${C.green}Geri donusum kutusunda (geri alinabilir):${C.reset} ${recycleOnly.length} kayit, ${formatBytes(recycleOnly.reduce((a, b) => a + b.bytes, 0))}`);
  console.log(`  ${C.red}Kalici silinen (geri alinamaz):${C.reset} ${C.yellow}${purged.length} kayit, ${formatBytes(purged.reduce((a, b) => a + b.bytes, 0))}${C.reset}`);

  console.log(`\n${C.bold}Son silinen yollar:${C.reset}`);
  for (const e of targets.slice(0, 12)) {
    const alive = await exists(e.path);
    const st = alive ? `${C.green} (diskte hala var)${C.reset}` : `${C.dim} (silinmis)${C.reset}`;
    console.log(`  ${e.mode === 'purge' ? C.red + '[purge]' + C.reset : C.green + '[rb]' + C.reset} ${prettyPath(e.path)} ${C.gray}${formatBytes(e.bytes)}${C.reset} ${C.gray}${formatDateTime(e.at)}${C.reset}${st}`);
  }
  if (targets.length > 12) console.log(`  ${C.dim}... +${targets.length - 12} kayit daha${C.reset}`);

  if (recycleOnly.length === 0) {
    console.log(`\n${C.yellow}Geri donusum kutusundan geri alinacak kayit yok.${C.reset}`);
    console.log(`${C.dim}Kalici silinen dosyalar geri getirilemez; uygulama yeniden indirmelidir.${C.reset}\n`);
    return;
  }

  console.log(`\n${C.gray}Geri donusum kutusundaki kayitlar Windows Gosterim/Recycle Bin ekranindan${C.reset}`);
  console.log(`${C.gray}veya PowerShell ile geri alinabilir:${C.reset}`);
  console.log(`\n  ${C.cyan}clicleaner undo --restore${C.reset}\n`);

  if (!allowPurge) return;

  const rl = createInterface({ input: stdin, output: stdout });
  const ans = await rl.question(`${C.yellow}Geri donusum kutusundaki tum kayitlari geri almak icin 'evet': ${C.reset}`);
  rl.close();

  if (!/^evet|^e$|^yes|^y$/i.test(ans.trim())) {
    console.log(`${C.yellow}Iptal.${C.reset}`);
    return;
  }

  const r = await recycleRestore(recycleOnly.map((e) => e.path));
  console.log(`\n${C.green}Geri alindi: ${r.restored} yol${C.reset}`);
  if (r.failed > 0) console.log(`${C.red}Basarisiz: ${r.failed}${C.reset}`);
  console.log('');
}

async function listJournals(dir: string): Promise<Array<{ path: string; at: number }>> {
  const out: Array<{ path: string; at: number }> = [];
  try {
    const ents = await readdir(longPath(dir), { withFileTypes: true });
    for (const e of ents) {
      if (!e.isFile() || !e.name.endsWith('.json')) continue;
      const p = join(dir, e.name);
      let at = 0;
      try {
        const st = await stat(longPath(p));
        at = st.mtimeMs;
      } catch {
        /* yoksay */
      }
      out.push({ path: p, at });
    }
  } catch {
    /* dizin yok */
  }
  return out.sort((a, b) => b.at - a.at);
}