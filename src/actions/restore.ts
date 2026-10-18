import { stat, access } from 'node:fs/promises';
import { longPath } from '../util/longpath.ts';

export async function exists(p: string): Promise<boolean> {
  try {
    await access(longPath(p));
    return true;
  } catch {
    return false;
  }
}

/**
 * Geri donusum kutusundaki ogeleri geri alir.
 *
 * Windows'ta geri al, ogeleri geri donusum kutusundan ORIJINAL konumuna
 * tasir. Bunu yapmanin desteklenen yolu Shell.Application uzerinden
 * "undelete" cagrisidir.
 *
 * NOT: Geri donusum kutusunda birden fazla oge ayni isimde ise ilk
 * eslesme bulunur; bu bir Windows kisitidir.
 */
export async function recycleRestore(paths: string[]): Promise<{ restored: number; failed: number }> {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const exec = promisify(execFile);

  let restored = 0;
  let failed = 0;

  for (const p of paths) {
    // Geri donusum kutusundaki orijinal ad, klasor adiyle ayni olmalidir
    const name = p.split('\\').filter(Boolean).pop() ?? p;
    const escaped = name.replace(/'/g, "''");
    const ps = `
$ErrorActionPreference='SilentlyContinue'
$shell = New-Object -ComObject Shell.Application
$bin = $shell.Namespace(10)
$item = $bin.Items() | Where-Object { $_.Name -eq '${escaped}' } | Select-Object -First 1
if ($item) {
  # InvokeVerb('undelete') geri almayi tetikler
  $item.InvokeVerb('undelete')
  Write-Output 'OK'
} else {
  Write-Output 'MISS'
}
`;
    try {
      const { stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
        timeout: 30_000,
      });
      if (stdout.includes('OK')) restored++;
      else failed++;
    } catch {
      failed++;
    }
  }

  return { restored, failed };
}

/** Bir yolun geri donusim kutusunda olup olmadigini kontrol eder. */
export async function inRecycleBin(path: string): Promise<boolean> {
  const name = path.split('\\').filter(Boolean).pop() ?? path;
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const exec = promisify(execFile);
  const ps = `
$shell = New-Object -ComObject Shell.Application
$bin = $shell.Namespace(10)
if ($bin.Items() | Where-Object { $_.Name -eq '${name.replace(/'/g, "''")}' }) {
  Write-Output 'YES'
} else { Write-Output 'NO' }
`;
  try {
    const { stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      timeout: 20_000,
    });
    return stdout.includes('YES');
  } catch {
    return false;
  }
}

void stat;