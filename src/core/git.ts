import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { longPath } from '../util/longpath.ts';
import { debug } from '../util/log.ts';

/**
 * Git farkindaligi (T27).
 *
 * Proje ici taramada Git tarafindan takip edilen (tracked) dosyalar
 * ASLA silinmez. Yalniz untracked veya .gitignore icindeki dosyalar
 * hedeflenebilir. Bu modul hicbir uygulama adi icermez; yalnizca
 * git komutlarini kullanir.
 *
 * Maliyet notu: `git ls-files` depo basina BIR kez calisir ve sonuc
 * onbelleklenir. Dosya basina git sureci ASLA baslatilmaz; bir hedefin
 * icindeki binlerce dosya icin arama bellekteki kumeden yapilir.
 */

/** depo koku (kucuk harf) -> tracked dosya kumesi (mutlak, kucuk harf) */
const trackedCache = new Map<string, Set<string>>();
/** baslangic dizini (kucuk harf) -> depo koku veya null */
const rootCache = new Map<string, string | null>();

/** Verilen yolun ustunde bir .git deposu var mi? Yoksa null. */
export function findGitRoot(start: string): string | null {
  let cur = resolve(start);
  try {
    const st = statSync(longPath(cur));
    if (!st.isDirectory()) cur = dirname(cur);
  } catch {
    /* yol henuz yok: ust dizinlerden devam */
  }

  const key = cur.toLowerCase();
  const cached = rootCache.get(key);
  if (cached !== undefined) return cached;

  let probe = cur;
  for (let i = 0; i < 64; i++) {
    if (existsSync(longPath(join(probe, '.git')))) {
      rootCache.set(key, probe);
      return probe;
    }
    const parent = dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  rootCache.set(key, null);
  return null;
}

/** Bir git deposundaki tum tracked dosyalar (mutlak yol kumesi). */
export function trackedFiles(repoRoot: string): Set<string> {
  const key = repoRoot.toLowerCase();
  const cached = trackedCache.get(key);
  if (cached) return cached;

  const out = new Set<string>();
  try {
    const buf = execFileSync('git', ['-C', repoRoot, 'ls-files', '-z'], {
      encoding: 'buffer',
      timeout: 30_000,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const text = buf.toString('utf8');
    for (const rel of text.split('\0')) {
      if (!rel) continue;
      out.add(resolve(repoRoot, rel).toLowerCase());
    }
  } catch (err) {
    // Git yok veya depo okunamadi. Bos kume donmek guvenli tarafta
    // DEGILDIR; bu yuzden gorunur bir iz birakilir. Tarama report-only
    // oldugunda silme zaten mumkun degildir.
    debug('git ls-files basarisiz', { repo: repoRoot, err: String(err) });
  }
  trackedCache.set(key, out);
  return out;
}

/**
 * Tek bir hedef icin tracker: depo koku ve tracked kumesi BIR kez
 * cozulur, sonra tum dosya kontrolleri bellekte yapilir.
 */
export interface GitTracker {
  /** Hedefin ait oldugu depo koku; depo degilse null. */
  readonly repo: string | null;
  /** Tracked dosya sayisi (kanit/teshis icin). */
  readonly size: number;
  /** Bu dosya tam olarak tracked mi? */
  isTracked(path: string): boolean;
  /** Bu klasorun altinda (veya kendisinde) tracked dosya var mi? */
  isTrackedAnyUnder(path: string): boolean;
}

/** Yol karsilastirmasi icin: mutlak, kucuk harf, sonda ayirici yok. */
function normalize(path: string): string {
  let s = resolve(path).toLowerCase();
  while (s.length > 3 && s.endsWith(sep)) s = s.slice(0, -1);
  return s;
}

export function gitTrackerFor(start: string): GitTracker {
  const repo = findGitRoot(start);
  const tracked = repo ? trackedFiles(repo) : new Set<string>();

  return {
    repo,
    size: tracked.size,
    isTracked(path: string): boolean {
      return tracked.has(normalize(path));
    },
    isTrackedAnyUnder(path: string): boolean {
      const dir = normalize(path);
      if (tracked.has(dir)) return true;
      const prefix = dir + sep;
      for (const f of tracked) {
        if (f.startsWith(prefix)) return true;
      }
      return false;
    },
  };
}

/** Verilen yol (dosya veya klasor) git tarafindan takip ediliyor mu? */
export function isGitTracked(target: string): boolean {
  const tracker = gitTrackerFor(target);
  return tracker.isTracked(target) || tracker.isTrackedAnyUnder(target);
}

/** Tek bir dosyanin tracked olup olmadigini (hizli) kontrol eder. */
export function isTrackedFile(filePath: string): boolean {
  return gitTrackerFor(filePath).isTracked(filePath);
}

/** Git onbellegini temizle (testler icin). */
export function clearGitCache(): void {
  trackedCache.clear();
  rootCache.clear();
}
