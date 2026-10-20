import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';
import { longPath } from '../util/longpath.ts';
import type { PathDuplicate, PathSourceReport } from './cli-inventory-types.ts';

/**
 * PATH kaynaklari (T35).
 *
 * PATH tek bir liste degildir: kullanici PATH'i (HKCU) ile makine
 * PATH'i (HKLM) acilista birlestirilir. Ayni dizin iki kaynakta da
 * tanimliysa ayni araclar iki kez aranir; ayni komut iki farkli
 * dizinden saglaniyorsa hangisinin calistigi PATH sirasina baglidir.
 *
 * Bu modul SALT OKUNUR: kayit defterine yazmaz, PATH degistirmez.
 * Karar uretmez; yalnizca "hangi dizin hangi kaynaktan geliyor"
 * sorusunu kanitla yanitlar.
 */

const USER_KEY = 'HKCU\\Environment';
const MACHINE_KEY = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment';

/**
 * `reg query` ciktisindan PATH degerini cikarir.
 * Ornek satir: `    Path    REG_EXPAND_SZ    C:\bin;%USERPROFILE%\tools`
 */
export function parseRegPath(stdout: string): string | null {
  const m = /^\s*Path\s+REG_(?:EXPAND_)?SZ\s+(.*)$/im.exec(stdout);
  return m?.[1]?.trim() ?? null;
}

/** `%VAR%` bicimini ortam degiskenleriyle genisletir (Windows, harf duyarsiz). */
export function expandEnv(value: string, env: NodeJS.ProcessEnv = process.env): string {
  const lower = new Map<string, string>();
  for (const [k, v] of Object.entries(env)) {
    if (typeof v === 'string') lower.set(k.toLowerCase(), v);
  }
  return value.replace(/%([^%]+)%/g, (whole, name: string) => lower.get(name.toLowerCase()) ?? whole);
}

function normDir(p: string): string {
  let s = p.trim().replace(/\//g, '\\');
  while (s.length > 3 && s.endsWith('\\')) s = s.slice(0, -1);
  return s.toLowerCase();
}

function splitPath(value: string, env: NodeJS.ProcessEnv): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of value.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const expanded = expandEnv(trimmed, env);
    const key = normDir(expanded);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(expanded);
  }
  return out;
}

/**
 * Iki kaynagi karsilastirir. Saf fonksiyon: disk ve kayit defterine
 * dokunmaz; sentetik verilerle test edilebilir.
 */
export function analyzePathSources(
  userRaw: string,
  machineRaw: string,
  mergedPath: string,
  env: NodeJS.ProcessEnv = process.env,
): Omit<PathSourceReport, 'missing'> {
  const userDirs = splitPath(userRaw, env);
  const machineDirs = splitPath(machineRaw, env);

  const sources = new Map<string, { path: string; from: Array<'user' | 'machine'> }>();
  const add = (dir: string, from: 'user' | 'machine') => {
    const key = normDir(dir);
    const cur = sources.get(key);
    if (cur) {
      if (!cur.from.includes(from)) cur.from.push(from);
    } else {
      sources.set(key, { path: dir, from: [from] });
    }
  };
  for (const d of userDirs) add(d, 'user');
  for (const d of machineDirs) add(d, 'machine');

  // Ayni kaynak icinde tekrar eden dizinler de "cakisma"dir: PATH
  // tarayicisi ayni dosyayi iki kez gorur ve sirasi bozulur.
  const duplicates: PathDuplicate[] = [];
  for (const { path, from } of sources.values()) {
    if (from.length > 1) {
      duplicates.push({
        path,
        sources: from,
        detail: 'Ayni dizin hem User hem Machine PATH icinde: araclar iki kez aranir',
      });
    }
  }
  const userSeen = new Map<string, number>();
  for (const d of userRaw.split(';').map((x) => expandEnv(x.trim(), env)).filter(Boolean)) {
    const k = normDir(d);
    userSeen.set(k, (userSeen.get(k) ?? 0) + 1);
  }
  for (const [k, count] of userSeen) {
    if (count < 2) continue;
    if (duplicates.some((d) => normDir(d.path) === k)) continue;
    const dir = userRaw.split(';').map((x) => expandEnv(x.trim(), env)).find((x) => normDir(x) === k) ?? k;
    duplicates.push({
      path: dir,
      sources: ['user'],
      detail: `User PATH icinde ${count} kez tanimli`,
    });
  }

  return {
    userDirs,
    machineDirs,
    mergedDirs: splitPath(mergedPath, env).length,
    duplicates,
  };
}

async function queryPathValue(key: string): Promise<string | null> {
  const run = promisify(execFile);
  try {
    const { stdout } = await run('reg', ['query', key, '/v', 'Path'], {
      timeout: 8000,
      windowsHide: true,
      encoding: 'utf8',
    });
    return parseRegPath(stdout);
  } catch {
    return null;
  }
}

/** Kayit defterinden User/Machine PATH'ini okur ve karsilastirir. */
export async function readPathSources(mergedPath = process.env.PATH ?? ''): Promise<PathSourceReport> {
  if (process.platform !== 'win32') {
    return {
      userDirs: [],
      machineDirs: [],
      mergedDirs: splitPath(mergedPath, process.env).length,
      duplicates: [],
      missing: [],
      note: 'PATH kaynaklari yalnizca Windows kayit defterinde okunur',
    };
  }

  const [userRaw, machineRaw] = await Promise.all([
    queryPathValue(USER_KEY),
    queryPathValue(MACHINE_KEY),
  ]);

  const base = analyzePathSources(userRaw ?? '', machineRaw ?? '', mergedPath);
  const missing: Array<{ path: string; source: 'user' | 'machine' }> = [];
  for (const [dirs, source] of [
    [base.userDirs, 'user'],
    [base.machineDirs, 'machine'],
  ] as const) {
    for (const d of dirs) {
      if (!existsSync(longPath(d))) missing.push({ path: d, source });
    }
  }

  return {
    ...base,
    missing,
    note:
      userRaw === null && machineRaw === null
        ? 'Kayit defteri okunamadi (PATH kaynaklari bilinmiyor)'
        : userRaw === null
          ? 'User PATH okunamadi'
          : machineRaw === null
            ? 'Machine PATH okunamadi'
            : undefined,
  };
}
