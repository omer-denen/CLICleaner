import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

/**
 * Masaustu kisayolu (T40 / Faz 9).
 *
 * Kisa yol sadece araci BASLATIR: `clicleaner ui` web sunucusunu acar ve
 * tarayici TOKEN'LI adresle acilir. **Token .lnk icine YAZILMAZ** — her
 * baslatmada yeni bir jeton uretilir (guvenlik jetonu diskta saklanmaz).
 *
 * Guvenlik:
 *   - Yalnizca bizim olusturdugumuz kisayol silinir (aciklama isareti
 *     kontrol edilir; baska bir programin kisayolu silinmez).
 *   - Kisayol olusturulmadan once hedefin gercekten araci calistirdigi
 *     dogrulanir.
 */

const execFileAsync = promisify(execFile);

/** Kisayolun bize ait oldugunu gosteren aciklama isareti. */
const OWNER_MARK = 'CLICleaner (CLICleaner)';
const SHORTCUT_NAME = 'CLICleaner.lnk';

/** Test icin masaustu klasorunu degistirilebilir yap. */
export function desktopDir(): string {
  const override = process.env['CLICLEANER_DESKTOP'];
  if (override && override.trim()) return resolve(override.trim());
  return join(homedir(), 'Desktop');
}

export function shortcutPath(): string {
  return join(desktopDir(), SHORTCUT_NAME);
}

export interface ShortcutInfo {
  path: string;
  exists: boolean;
  /** Kisayol bize ait mi? (aciklama isareti) */
  ours: boolean;
}

/**
 * Mevcut kisayolun aciklamasini okur.
 * Dosya yoksa hata firlatmaz; `ours: false` doner.
 */
async function readShortcutDescription(path: string): Promise<string | null> {
  if (!existsSync(path)) return null;
  const script = [
    '$ws = New-Object -ComObject WScript.Shell',
    `$sc = $ws.CreateShortcut(${psLiteral(path)})`,
    'if ($sc -eq $null) { exit 0 }',
    'Write-Output $sc.Description',
  ].join('; ');
  try {
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
      timeout: 15000,
    });
    const out = stdout.trim();
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

export async function shortcutInfo(): Promise<ShortcutInfo> {
  const path = shortcutPath();
  const exists = existsSync(path);
  const description = await readShortcutDescription(path);
  return { path, exists, ours: description === OWNER_MARK };
}

/**
 * Aracin gercekten calistirilabilir oldugunu dogrular.
 * Hedef: node calistirilabilir + giris betigi (bin/clicleaner.mjs).
 */
export interface ShortcutTarget {
  /** .lnk hedefi (node.exe) */
  target: string;
  /** .lnk argumanlari */
  args: string;
  workingDir: string;
}

export function resolveTarget(entry: string = process.argv[1] ?? ''): ShortcutTarget | null {
  const nodeExe = process.execPath;
  const script = resolve(entry);
  if (!existsSync(script)) return null;
  return {
    target: nodeExe,
    args: `"${script}" ui`,
    workingDir: join(script, '..'),
  };
}

/** Masaustu kisayolunu olusturur (varsa uzerine yazar). */
export async function createShortcut(target: ShortcutTarget): Promise<ShortcutInfo> {
  const path = shortcutPath();
  const script = [
    '$ws = New-Object -ComObject WScript.Shell',
    `$sc = $ws.CreateShortcut(${psLiteral(path)})`,
    `$sc.TargetPath = ${psLiteral(target.target)}`,
    `$sc.Arguments = ${psLiteral(target.args)}`,
    `$sc.WorkingDirectory = ${psLiteral(target.workingDir)}`,
    `$sc.Description = ${psLiteral(OWNER_MARK)}`,
    '$sc.Save()',
  ].join('; ');
  await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    windowsHide: true,
    timeout: 20000,
  });
  return shortcutInfo();
}

/**
 * Kisayolu kaldirir. YALNIZCA bize ait olan silinir; baska bir programin
 * .lnk dosyasina dokunulmaz.
 */
export async function removeShortcut(): Promise<{ removed: boolean; reason?: string }> {
  const info = await shortcutInfo();
  if (!info.exists) return { removed: false, reason: 'not-found' };
  if (!info.ours) return { removed: false, reason: 'not-ours' };
  await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Remove-Item -LiteralPath ${psLiteral(info.path)} -Force`], {
    windowsHide: true,
    timeout: 15000,
  });
  return { removed: true };
}

/** PowerShell tek tirnakli literal (icinde tirnak varsa ikiye katlanir). */
function psLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
