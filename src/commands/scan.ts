import { performance } from 'node:perf_hooks';
import { classifyPath, detectGpu, setGpuState } from '../core/analyze.ts';
import { mergeClusters, groupByVerdict, summarize } from '../core/merge.ts';
import { discover, BUILTIN_PROFILES, ENVS } from '../core/discover.ts';
import { walk } from '../core/walker.ts';
import { formatBytes, formatAge, padEnd, padStart } from '../util/format.ts';
import { info, warn, debug } from '../util/log.ts';
import type { Cluster, Env, ScanResult, SkippedEntry } from '../core/types.ts';

export interface ScanArgs {
  envs: Env[];
  profile?: string;
  minAgeDays: number;
  json: boolean;
  includeBytes: boolean;
  exclude: string[];
  quiet: boolean;
  /** TUI icin canli ilerleme bildirimi */
  onProgress?: (done: number, total: number, bytes: number) => void;
  /** Kesif bitince taranacak alanlarin tam listesi (web: sol sutun). */
  onTargets?: (paths: string[]) => void;
  /** Bir kok taranmaya baslarken (web: canli "ne taranıyor" satiri). */
  onTargetStart?: (path: string, done: number, total: number) => void;
  /** Bir kok bitince: siniflandirildiysa kume, atlandiysa null. */
  onTargetDone?: (path: string, done: number, total: number, cluster: Cluster | null) => void;
  /** Iptal sinyali: yeni kok alinmaz, aktif yurume durur. */
  signal?: AbortSignal;
}

/** Tarama: kesif -> olcum -> kanit -> kumelestirme. */
export async function runScan(args: ScanArgs): Promise<ScanResult> {
  const started = Date.now();
  const t0 = performance.now();

  let envs = args.envs;
  let exclude = args.exclude;

  if (args.profile) {
    const p = BUILTIN_PROFILES[args.profile];
    if (!p) throw new Error(`Bilinmeyen profil: ${args.profile}. Secenekler: ${Object.keys(BUILTIN_PROFILES).join(', ')}`);
    envs = p.envs;
    exclude = [...exclude, ...(p.exclude ?? [])];
  }

  if (envs.length === 0) envs = ['dotfolders', 'localappdata', 'roamingappdata'];

  info('tarama basladi', {
    envs,
    profile: args.profile,
    exclude,
    minAgeDays: args.minAgeDays,
  });

  const gpu = await detectGpu();
  setGpuState(gpu);
  debug('gpu durumu', gpu);

  const { targets, stats: dStats } = await discover(envs, { exclude });
  args.onTargets?.(targets.map((t) => t.path));

  info('kesif tamamlandi', {
    hedef: targets.length,
    noktaKlasor: dStats.dotDirs,
    local: dStats.localDirs,
    roaming: dStats.roamingDirs,
  });

  const log = args.quiet
    ? () => {}
    : (msg: string) => process.stderr.write(msg);

  log(`\n  CLICleaner taramasi\n`);
  log(`  Ortam      : ${envs.join(', ')}`);
  if (args.profile) log(`  Profil     : ${args.profile}`);
  log(`  Dizinler   : ${targets.length} aday`);
  log(`  GPU        : ${gpu.hasNvidia ? 'NVIDIA bulundu' : 'NVIDIA yok'}\n`);

  // Kuyruk tabanli paralel tarama (6 es zamanli is)
  const results: Cluster[] = [];
  const allSkipped: SkippedEntry[] = [];
  let done = 0;
  let bytesSeen = 0;

  const queue = [...targets];
  const workers = Array.from({ length: 6 }, async () => {
    for (;;) {
      if (args.signal?.aborted) return;
      const t = queue.shift();
      if (!t) return;
      args.onTargetStart?.(t.path, done, targets.length);
      let found: Cluster | null = null;
      try {
        found = await classifyPath(t.path, t.origin, {
          minAgeDays: args.minAgeDays,
          signal: args.signal,
        });
        if (args.signal?.aborted) return;
        if (found) {
          results.push(found);
          bytesSeen += found.totalBytes;
        }
      } catch {
        /* tek bir hedefin hatasi taramayi durdurmaz */
      }
      done++;
      args.onProgress?.(done, targets.length, bytesSeen);
      args.onTargetDone?.(t.path, done, targets.length, found);
      if (!args.quiet && (done % 5 === 0 || done === targets.length)) {
        process.stderr.write(
          `\r  [${done}/${targets.length}] ${(bytesSeen / (1024 * 1024)).toFixed(0)} MB tarandi   `,
        );
      }
    }
  });
  await Promise.all(workers);
  if (!args.quiet) process.stderr.write('\r' + ' '.repeat(60) + '\r');

  const merged = mergeClusters(results);
  const finished = Date.now();

  // Silme hedefi olmayan ama onerilen kumeler varsa, bu bir
  // HATA BELIRTISIDIR: karar "onerilen" dedi ama silinecek yol yok.
  const orphanRecommends = merged.filter(
    (c) => c.verdict.kind === 'recommend' && (c.deleteTargets ?? []).length === 0,
  );
  for (const o of orphanRecommends) {
    warn('silme hedefi yok ama oneriliyor', {
      root: o.parts[0]?.path,
      archetype: o.archetype,
      risk: o.verdict.risk,
    });
  }

  // Tarama istatistikleri (envanter bilgisi icin)
  const walkStats = {
    rootsScanned: targets.length,
    dirsVisited: dStats.dotDirs + dStats.localDirs + dStats.roamingDirs,
    filesSeen: merged.reduce((a, c) => a + c.parts.reduce((b, p) => b + p.files, 0), 0),
    bytesSeen: merged.reduce((a, c) => a + c.totalBytes, 0),
    denied: allSkipped.filter((s) => s.reason === 'denied').length,
    longPathErrors: allSkipped.filter((s) => s.reason === 'long-path').length,
  };

  void walk;
  void ENVS;

  // Oturum ozeti
  const s = summarize(merged);
  info('tarama tamamlandi', {
    sureSn: ((finished - started) / 1000).toFixed(1),
    kume: merged.length,
    toplamGB: (s.totalBytes / 1073741824).toFixed(2),
    silinebilirGB: (s.reclaimableBytes / 1073741824).toFixed(2),
    onerilen: merged.filter((c) => c.verdict.kind === 'recommend').length,
    dogrulama: merged.filter((c) => c.verdict.kind === 'ask').length,
    rapor: merged.filter((c) => c.verdict.kind === 'report-only').length,
    tanimsiz: merged.filter((c) => c.archetype === 'unknown').length,
    hedefsizOneri: orphanRecommends.length,
  });

  return {
    startedAt: started,
    finishedAt: finished,
    clusters: merged,
    stats: walkStats,
    skipped: allSkipped,
  };
}

/** Konsol raporu: gruplu, renkli, ozetli. */
export function renderReport(result: ScanResult, showAll = false): void {
  const { clusters } = result;
  const s = summarize(clusters);
  const g = groupByVerdict(clusters);

  const C = {
    reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
    green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m',
    cyan: '\x1b[36m', blue: '\x1b[34m', gray: '\x1b[90m',
  };
  const { formatBytes: _fb, formatAge: _fa } = { formatBytes, formatAge };
  void _fb; void _fa;

  const sec = (title: string, color: string, items: Cluster[]) => {
    if (items.length === 0) return;
    const total = items.reduce((a, c) => a + c.reclaimableBytes, 0);
    console.log(`\n${color}${C.bold}${title}${C.reset} ${C.gray}(${items.length} kume, ${formatBytes(total)})${C.reset}`);
    console.log(`${C.gray}${'─'.repeat(78)}${C.reset}`);
    for (const c of items.slice(0, showAll ? items.length : 25)) {
      const mark = c.verdict.kind === 'recommend' ? `${C.green}●${C.reset}` : c.verdict.kind === 'ask' ? `${C.yellow}○${C.reset}` : `${C.gray}·${C.reset}`;
      const size = formatBytes(c.reclaimableBytes);
      const tot = c.totalBytes !== c.reclaimableBytes ? `${C.gray}/${formatBytes(c.totalBytes)}${C.reset}` : '';
      console.log(` ${mark} ${padEnd(c.title.slice(0, 46), 48)} ${padStart(size, 9)} ${tot}  ${C.gray}${formatAge(c.lastTouched)}${C.reset}`);
      if (c.parts.length > 1) {
        for (const p of c.parts.slice(0, 5)) {
          const short = p.path.replace(process.env.USERPROFILE ?? '', '~').replace(process.env.LOCALAPPDATA ?? '', '%LOCAL%').replace(process.env.APPDATA ?? '', '%ROAM%');
          console.log(`     ${C.gray}└ ${short}  ${formatBytes(p.bytes)}${C.reset}`);
        }
        if (c.parts.length > 5) console.log(`     ${C.gray}└ ... +${c.parts.length - 5} parca${C.reset}`);
      }
    }
    if (!showAll && items.length > 25) console.log(`     ${C.gray}... +${items.length - 25} kume daha${C.reset}`);
  };

  sec('●  ONERILEN  (guvenli, tek onayla silinebilir)', C.green, g.recommend);
  sec('○  DOGRULAMA  (silmeden once icerigi gor)', C.yellow, g.ask);
  sec('·  RAPOR  (otomatik silinmez)', C.gray, g['report-only']);

  console.log(`\n${C.bold}────────────────────────────────────────────────────────────${C.reset}`);
  console.log(`${C.bold}  Toplam bulunan : ${formatBytes(s.totalBytes)}${C.reset}`);
  console.log(`${C.green}  Silinebilir    : ${formatBytes(s.reclaimableBytes)}${C.reset}  ${C.gray}(onerilen ${formatBytes(s.recommendedBytes)} + dogrulama ${formatBytes(s.askBytes)})${C.reset}`);
  if (result.stats.longPathErrors > 0) {
    console.log(`${C.yellow}  Uzun yol atlanti: ${result.stats.longPathErrors}${C.reset} ${C.gray}(--deep ile tekrar dene)${C.reset}`);
  }
  console.log(`${C.dim}  Tarama suresi: ${((result.finishedAt - result.startedAt) / 1000).toFixed(1)}s${C.reset}\n`);
}