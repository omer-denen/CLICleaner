import { readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { longPath } from '../util/longpath.ts';
import { DATA_DIR_NAME, LEGACY_DATA_DIR_NAME } from './data-dir.ts';
import type { Env, EnvDef, Part } from './types.ts';

/** Ortam tanimlari: --env secimi ve profil sistemi bunlari kullanir. */
export const ENVS: EnvDef[] = [
  {
    id: 'dotfolders',
    label: 'Nokta klasorleri',
    description: 'Kullanici dizinindeki tum . ile baslayan klasorler',
  },
  {
    id: 'localappdata',
    label: 'LocalAppData',
    description: 'Yerel uygulama verisi ve onbellekler',
  },
  {
    id: 'roamingappdata',
    label: 'RoamingAppData',
    description: 'Kullanici profiliyle tasinan uygulama verileri',
  },
  {
    id: 'pkgcache',
    label: 'Paket onbellekleri',
    description: 'npm / NuGet / conda / uv onbellekleri',
  },
  {
    id: 'agent',
    label: 'AI ajan artiklari',
    description: 'Ajan oturum gecmisi, beceri ve onbellekleri',
  },
  {
    id: 'runtime',
    label: 'Runtime havuzlari',
    description: 'Derlenmis yorumlayici ortamlari',
  },
  {
    id: 'temp',
    label: 'Gecici dosyalar',
    description: 'Temp klasoru ve cokme dokumleri',
  },
  {
    id: 'vdisk',
    label: 'Sanal diskler',
    description: 'WSL / Docker / VM diskleri (sadece raporlanir)',
  },
];

/** Kaydedilebilir profiller. */
export interface Profile {
  name: string;
  description: string;
  envs: Env[];
  /** Bu profilde gizli tutulacak yol parcalari (alt dizin adlari) */
  exclude?: string[];
}

export const BUILTIN_PROFILES: Record<string, Profile> = {
  lean: {
    name: 'lean',
    description: 'Sadece guvenli onbellekler (agresif temizlik)',
    envs: ['pkgcache', 'temp'],
    exclude: ['Temp'],
  },
  audit: {
    name: 'audit',
    description: 'Her seyi raporla, hicbir sey silme',
    envs: ['dotfolders', 'localappdata', 'roamingappdata', 'agent', 'runtime', 'vdisk'],
  },
  full: {
    name: 'full',
    description: 'Tum kategoriler, risk duzeyine gore onayla',
    envs: ['dotfolders', 'localappdata', 'roamingappdata', 'pkgcache', 'agent', 'runtime', 'temp', 'vdisk'],
  },
};

/**
 * ASLA dokunulmayacak kokler.
 *
 * Bunlar kullanici verisi veya uygulama kurulumudur; "gereksiz
 * artik" kavramina girmezler. Liste kurala degil, SEMANTIGE gore
 * kurulur: bir klasorun ne oldugu bilinmeden "artik" denemez.
 */
const PROTECTED_ROOTS = new Set([
  'programs',
  'windows',
  'microsoft',
  'packages',
  'wsl',
  'comms',
  'connecteddevicesplatform',
  'virtualstore',
  'temp',
  'roaming',
  'local',
]);

export interface DiscoveryResult {
  targets: Array<{ path: string; origin: Part['origin'] }>;
  stats: { dotDirs: number; localDirs: number; roamingDirs: number; denied: number };
}

/**
 * Aracin KENDI veri dizinleri (gunluk, kasa, karantina, tarama onbellegi).
 *
 * Bunlar tarama hedefi OLAMAZ: kullanici "artik" sanip silerse yedek
 * kasasi, gunluk defteri ve geri donus adimlari kaybolur. Yol adi
 * sabit kodlanmaz; ortam degiskenlerinden turetilir.
 *
 * 2.0.0 sonrasi ad `residue`; eski ad (`clicleaner`) da korunur.
 */
export function ownDataDirs(env: NodeJS.ProcessEnv = process.env): string[] {
  const out: string[] = [];
  const local = env.LOCALAPPDATA ?? '';
  const home = env.USERPROFILE ?? env.HOME ?? '';
  if (local) {
    out.push(join(local, DATA_DIR_NAME));
    // Eski ad (2.0.0 oncesi): gecis sirasinda da korunur. Kasa verisi
    // orada duruyor olabilir; yanlislikla silinmemeli.
    out.push(join(local, LEGACY_DATA_DIR_NAME));
  }
  if (home) {
    out.push(join(home, `.${DATA_DIR_NAME}`));
    out.push(join(home, `.${LEGACY_DATA_DIR_NAME}`));
  }
  return out;
}

/** Yol, aracin kendi veri dizini mi (kendisi veya altinda)? */
export function isOwnDataPath(path: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const strip = (s: string) => s.toLowerCase().replace(/[\\/]+$/, '');
  const p = strip(path);
  return ownDataDirs(env).some((d) => {
    const dir = strip(d);
    return p === dir || p.startsWith(dir + '\\') || p.startsWith(dir + '/');
  });
}

/**
 * Kesif: taranacak kokleri bul.
 *
 * Onemli: burada HICBIR uygulama adi sabit kodlu degildir. Tum
 * $HOME altindaki ".*" klasorleri ve AppData'nin tum cocuklari aday
 * olarak toplanir. Uygulamanin ne oldugunu daha sonra kanit katmani
 * belirler.
 */
export async function discover(envs: Env[], opts: { exclude?: string[] } = {}): Promise<DiscoveryResult> {
  const env = process.env;
  const home = env.USERPROFILE ?? env.HOME ?? '';
  const local = env.LOCALAPPDATA ?? '';
  const roaming = env.APPDATA ?? '';
  const excluded = new Set((opts.exclude ?? []).map((e) => e.toLowerCase()));

  const targets: DiscoveryResult['targets'] = [];
  const stats = { dotDirs: 0, localDirs: 0, roamingDirs: 0, denied: 0 };

  const want = (e: Env) => envs.includes(e);

  // --- $HOME altindaki nokta klasorleri ---
  if (want('dotfolders') || want('agent') || want('runtime') || want('pkgcache')) {
    for (const name of await listDirs(home)) {
      if (!name.startsWith('.')) continue;
      if (excluded.has(name.toLowerCase())) continue;
      if (isOwnDataPath(join(home, name))) continue;
      stats.dotDirs++;
      targets.push({ path: join(home, name), origin: 'home' });
    }
  }

  // --- AppData ---
  if (want('localappdata') || want('pkgcache') || want('temp') || want('agent') || want('runtime') || want('vdisk')) {
    for (const name of await listDirs(local)) {
      if (excluded.has(name.toLowerCase())) continue;
      if (PROTECTED_ROOTS.has(name.toLowerCase())) continue;
      if (isOwnDataPath(join(local, name))) continue;
      stats.localDirs++;
      targets.push({ path: join(local, name), origin: 'localappdata' });
    }
  }
  if (want('roamingappdata') || want('agent') || want('runtime')) {
    for (const name of await listDirs(roaming)) {
      if (excluded.has(name.toLowerCase())) continue;
      if (PROTECTED_ROOTS.has(name.toLowerCase())) continue;
      stats.roamingDirs++;
      targets.push({ path: join(roaming, name), origin: 'roamingappdata' });
    }
  }

  // --- Acikca bilinen paket yoneticisi / runtime kokleri ---
  // Bunlar AppData'nin korunan cocuklari (Microsoft, .local vb.) altinda
  // kaldigi icin genel taramada gorunmez; --env secimine gore eklenir.
  const seen = new Set(targets.map((t) => resolve(t.path).toLowerCase()));
  const addExtra = async (paths: Array<string | undefined>, origin: Part['origin']) => {
    for (const p of paths) {
      if (!p) continue;
      const abs = resolve(p);
      const key = abs.toLowerCase();
      if (seen.has(key) || isOwnDataPath(abs)) continue;
      if (excluded.has(abs.split(/[\\/]/).pop()?.toLowerCase() ?? '')) continue;
      try {
        if (!(await stat(longPath(abs))).isDirectory()) continue;
      } catch {
        continue;
      }
      seen.add(key);
      targets.push({ path: abs, origin });
    }
  };

  if (want('temp') && env.TEMP) {
    // PROTECTED_ROOTS 'temp'i genel taramada atlar; acikca istenince
    // yalnizca %TEMP% koku eklenir (tum AppData taranmaz).
    await addExtra([env.TEMP], 'custom');
  }

  // NOT: winget/scoop/choco/pipx gibi KURULUM kokleri burada diske
  // taranmaz; CLI envanteri onlari salt okunur listeler. Boylece
  // "kurulu arac" yanlislikla "artik" sayilmaz.

  return { targets, stats };
}

async function listDirs(root: string): Promise<string[]> {
  if (!root) return [];
  try {
    const ents = await readdir(longPath(root), { withFileTypes: true });
    return ents.filter((e) => {
      try {
        return e.isDirectory();
      } catch {
        return false;
      }
    }).map((e) => e.name);
  } catch {
    return [];
  }
}

/** Var mı diye hızlı kontrol (kucuk dosyalar icin). */
export async function exists(p: string): Promise<boolean> {
  try {
    await stat(longPath(p));
    return true;
  } catch {
    return false;
  }
}

/**
 * Siralama: en buyukten baslayarak, ayni boyutta isme gore.
 * Kullanici en yuksek kazanci once gormeli.
 */
export function sortTargets<T extends { path: string }>(t: T[]): T[] {
  return t;
}

export { ownerlessName };

function ownerlessName(p: string): string {
  return p.split('\\').filter(Boolean).pop() ?? p;
}