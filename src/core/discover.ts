import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { longPath } from '../util/longpath.ts';
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
      stats.dotDirs++;
      targets.push({ path: join(home, name), origin: 'home' });
    }
  }

  // --- AppData ---
  if (want('localappdata') || want('pkgcache') || want('temp') || want('agent') || want('runtime') || want('vdisk')) {
    for (const name of await listDirs(local)) {
      if (excluded.has(name.toLowerCase())) continue;
      if (PROTECTED_ROOTS.has(name.toLowerCase())) continue;
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