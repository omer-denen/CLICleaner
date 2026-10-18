/**
 * Windows uzun yol (MAX_PATH 260) destegi.
 *
 * npm-cache\\_cacache icinde bu siniri asan yuzlerce yol var; onlari
 * atlamak 15 GB'lik bir onbellegi yanlis boyutlu raporlamak demek.
 * Cozum: Win32 API cagrisinda yola "\\\\?\\" on eki koymak.
 */

/** UNC yollari "\\\\?\\UNC\\" bicimine cevirmeli. */
export function longPath(p: string): string {
  if (p.startsWith('\\\\?\\')) return p;
  if (p.startsWith('\\\\')) return '\\\\?\\UNC\\' + p.slice(2);
  // Relative yollari mutlaklastir, on ek ancak mutlak yolda anlamli.
  if (!/^[A-Za-z]:[\\/]/.test(p) && !p.startsWith('\\\\')) return p;
  return '\\\\?\\' + p;
}

export function isLongPathError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  return code === 'ENAMETOOLONG' || code === 'ERR_FS_FILE_TOO_LARGE';
}

export function isDenied(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  return code === 'EACCES' || code === 'EPERM';
}

export function errorCode(err: unknown): string | undefined {
  return (err as NodeJS.ErrnoException | undefined)?.code;
}

/** Kullaniciya gosterilecek yol: $HOME ve %LOCALAPPDATA% gibi kisaltmalar. */
export function prettyPath(p: string, env: NodeJS.ProcessEnv = process.env): string {
  const home = env.USERPROFILE ?? env.HOME ?? '';
  const local = env.LOCALAPPDATA ?? '';
  const roaming = env.APPDATA ?? '';
  let out = p;
  if (local && out.toLowerCase().startsWith(local.toLowerCase())) {
    out = `%LOCALAPPDATA%${out.slice(local.length)}`;
  } else if (roaming && out.toLowerCase().startsWith(roaming.toLowerCase())) {
    out = `%APPDATA%${out.slice(roaming.length)}`;
  } else if (home && out.toLowerCase().startsWith(home.toLowerCase())) {
    out = `~${out.slice(home.length)}`;
  }
  return out.replace(/\\/g, '\\');
}