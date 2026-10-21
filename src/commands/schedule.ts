import { ScheduleService, type ScheduleInput, type ScheduleView } from '../services/schedule-service.ts';
import { ScanService } from '../services/scan-service.ts';
import { DeleteService } from '../services/delete-service.ts';
import type { CategoryKey } from '../core/categories.ts';

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m', gray: '\x1b[90m',
};

/**
 * `residue schedule` — planli kasa temizligi.
 *
 * Planlar yalnizca sunucu/CLI calisirken ve yalnizca kasaya tasir.
 * Kalici silme ve ortam degisikligi otomatik yapilmaz.
 */
export async function runSchedule(args: string[]): Promise<void> {
  const json = args.includes('--json');
  const sub = args.find((a) => !a.startsWith('-')) ?? 'list';
  const rest = args.filter((a) => a !== sub && !a.startsWith('--') && !isFlagValue(args, a));

  const scan = new ScanService(() => {}, false);
  const del = new DeleteService(() => {});
  const svc = new ScheduleService(scan, del);

  if (sub === 'list') {
    const list = await svc.list();
    if (json) {
      console.log(JSON.stringify(list, null, 2));
      return;
    }
    console.log(`\n  ${C.bold}Residue — planlar${C.reset}\n`);
    if (list.length === 0) {
      console.log(`  ${C.gray}Plan yok. Eklemek icin: residue schedule add --name "..." --at 03:00${C.reset}\n`);
      return;
    }
    for (const v of list) printRule(v);
    console.log('');
    return;
  }

  if (sub === 'catchup') {
    const catchUp = await svc.catchUp();
    if (json) {
      console.log(JSON.stringify(catchUp, null, 2));
      return;
    }
    console.log(`\n  ${C.bold}Kacirilan planlar${C.reset}\n`);
    if (catchUp.length === 0) console.log(`  ${C.gray}Yok.${C.reset}\n`);
    for (const c of catchUp) console.log(`  ${C.yellow}!${C.reset} ${c.rule.name}: ${c.message}`);
    console.log('');
    return;
  }

  if (sub === 'history') {
    const runs = await svc.history();
    if (json) {
      console.log(JSON.stringify(runs, null, 2));
      return;
    }
    console.log(`\n  ${C.bold}Plan calisma gecmisi${C.reset}\n`);
    for (const r of runs.slice(0, 50)) {
      console.log(
        `  ${r.status.padEnd(9)} ${new Date(r.startedAt ?? r.plannedAt).toLocaleString()} · ` +
          `${r.itemCount} oge · ${formatBytes(r.bytes)}${r.error ? ` · ${r.error}` : ''}`,
      );
    }
    console.log('');
    return;
  }

  if (sub === 'add') {
    const at = valueOf(args, '--at') ?? '03:00';
    const [hh, mm] = at.split(':').map((x) => Number(x));
    const input: ScheduleInput = {
      name: valueOf(args, '--name') ?? 'Planli temizlik',
      frequency: (valueOf(args, '--frequency') ?? 'daily') as ScheduleInput['frequency'],
      hour: Number.isFinite(hh) ? hh : 3,
      minute: Number.isFinite(mm) ? mm : 0,
      weekday: numberFlag(args, '--weekday'),
      selector: {
        ...(valueOf(args, '--keys')
          ? { keys: splitCsv(valueOf(args, '--keys')!) }
          : {}),
        ...(valueOf(args, '--category')
          ? { categories: splitCsv(valueOf(args, '--category')!) as CategoryKey[] }
          : {}),
        ...(valueOf(args, '--max-risk')
          ? { maxRisk: valueOf(args, '--max-risk') as 'safe' | 'low' }
          : {}),
        minIdleDays: numberFlag(args, '--min-idle'),
        maxItems: numberFlag(args, '--max-items'),
      },
    };
    if (input.frequency === 'once') {
      const minutes = numberFlag(args, '--in') ?? 60;
      input.runAt = Date.now() + Math.max(1, minutes) * 60_000;
    }
    const rule = await svc.create(input);
    if (json) {
      console.log(JSON.stringify(rule, null, 2));
      return;
    }
    console.log(`\n  ${C.green}Plan olusturuldu${C.reset}\n`);
    printRule(rule);
    console.log('');
    return;
  }

  if (sub === 'remove' || sub === 'delete') {
    const id = rest[0];
    if (!id) throw new Error('Kullanim: residue schedule remove <id>');
    await svc.remove(id);
    console.log(`  ${C.green}Plan silindi:${C.reset} ${id}`);
    return;
  }

  if (sub === 'preview') {
    const id = rest[0];
    if (!id) throw new Error('Kullanim: residue schedule preview <id>');
    const p = await svc.preview(id);
    if (json) {
      console.log(JSON.stringify(p, null, 2));
      return;
    }
    console.log(`\n  ${C.bold}Plan onizleme${C.reset} (${p.items.length} oge, ${formatBytes(p.totalBytes)})`);
    for (const i of p.items) {
      console.log(`  ${C.cyan}${i.title}${C.reset} · ${formatBytes(i.bytes)} · ${i.category}/${i.risk}`);
    }
    console.log('');
    return;
  }

  if (sub === 'run') {
    const id = rest[0];
    if (!id) throw new Error('Kullanim: residue schedule run <id>');
    console.log(`  ${C.gray}Plan calisiyor; kasaya tasima bitene kadar bekleniyor...${C.reset}`);
    const run = await svc.run(id);
    if (json) {
      console.log(JSON.stringify(run, null, 2));
      return;
    }
    console.log(
      `\n  ${run.status === 'done' ? C.green : C.red}${run.status}${C.reset} · ` +
        `${run.itemCount} oge · ${formatBytes(run.bytes)}`,
    );
    if (run.journalPath) console.log(`  ${C.dim}Journal: ${run.journalPath}${C.reset}`);
    if (run.error) console.log(`  ${C.red}!${C.reset} ${run.error}`);
    console.log('');
    return;
  }

  console.log('  Kullanim: residue schedule [list|add|remove|preview|run|history|catchup] [--json]');
}

function printRule(v: ScheduleView): void {
  const when =
    v.frequency === 'once'
      ? new Date(v.runAt ?? 0).toLocaleString()
      : `${v.frequency} ${String(v.hour).padStart(2, '0')}:${String(v.minute).padStart(2, '0')}` +
        (v.frequency === 'weekly' ? ` (gun ${v.weekday})` : '');
  const next = v.nextRunAt ? new Date(v.nextRunAt).toLocaleString() : '-';
  const sel = v.selector;
  console.log(
    `  ${v.enabled ? C.green + 'acik ' : C.gray + 'kapali'}${C.reset} ${C.cyan}${v.name}${C.reset} · ${when}`,
  );
  console.log(
    `    ${C.dim}id: ${v.id} · sonraki: ${next}` +
      ` · kategori: ${(sel.categories ?? ['(tumu)']).join(',')}` +
      ` · maxRisk: ${sel.maxRisk ?? 'safe'} · limit: ${sel.maxItems ?? 10}${C.reset}`,
  );
  if (v.missed > 0) console.log(`    ${C.yellow}! ${v.missed} kacirilan calisma${C.reset}`);
  if (v.lastRun) {
    console.log(
      `    ${C.gray}son: ${v.lastRun.status} · ${new Date(v.lastRun.startedAt ?? v.lastRun.plannedAt).toLocaleString()}${C.reset}`,
    );
  }
}

function valueOf(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

function numberFlag(args: string[], flag: string): number | undefined {
  const raw = valueOf(args, flag);
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function splitCsv(s: string): string[] {
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}

/** Bir degerin bayrak degeri mi oldugunu kabaca anlar (subcommand secimi icin). */
function isFlagValue(args: string[], value: string): boolean {
  const i = args.indexOf(value);
  return i > 0 && args[i - 1]!.startsWith('--');
}

function formatBytes(n: number): string {
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}
