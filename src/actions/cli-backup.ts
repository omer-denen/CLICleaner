import { cp, mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { longPath } from '../util/longpath.ts';
import { walk } from '../core/walker.ts';
import { CliCommandText } from '../core/cli-command-text.ts';
import type { CliTool } from '../core/cli-inventory-types.ts';

/**
 * CLI kaldirma oncesi "durum kasasi".
 *
 * Burada KURULUM kopyalanmaz (yuzlerce MB olabilir ve paket
 * yoneticisiyle zaten yeniden kurulur). Yalnizca kullanicinin
 * urettigi durum klasorleri (ayar, oturum, gecmis) kopyalanir.
 * Kasaya bir manifest ve RESTORE.md yazilir; boylece "yanlis
 * sildim" durumunda geri donus yolu vardir.
 */

const MAX_DIR_BYTES = 100 * 1024 * 1024; // tek klasor icin 100 MB
const MAX_TOTAL_BYTES = 500 * 1024 * 1024; // toplam 500 MB

export interface BackupItem {
  path: string;
  bytes: number;
  /** Dolu ise bu klasor kasaya alinmadi */
  reason?: string;
}

export interface BackupPlan {
  vaultDir: string;
  items: BackupItem[];
  skipped: BackupItem[];
  totalBytes: number;
}

export interface BackupResult {
  vaultDir: string;
  copied: string[];
  skipped: Array<{ path: string; reason: string }>;
  bytes: number;
}

export function vaultRoot(): string {
  return join(process.env.LOCALAPPDATA ?? '.', 'clicleaner', 'vault');
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function safeName(s: string): string {
  return s.replace(/[^a-z0-9._-]+/gi, '_').slice(0, 60);
}

/** Kaldirmadan ONCE kasaya alinacak klasorleri boyutlariyla planlar. */
export async function planToolBackup(tool: CliTool, enabled: boolean): Promise<BackupPlan> {
  const vaultDir = join(vaultRoot(), `${stamp()}-${safeName(tool.command)}`);
  const plan: BackupPlan = { vaultDir, items: [], skipped: [], totalBytes: 0 };
  if (!enabled || tool.stateDirs.length === 0) return plan;

  for (const dir of tool.stateDirs) {
    const bytes = await dirSize(dir);
    if (bytes > MAX_DIR_BYTES) {
      plan.skipped.push({
        path: dir,
        bytes,
        reason: `tek klasor 100 MB sinirini asiyor (${Math.round(bytes / 1048576)} MB)`,
      });
      continue;
    }
    if (plan.totalBytes + bytes > MAX_TOTAL_BYTES) {
      plan.skipped.push({ path: dir, bytes, reason: 'toplam 500 MB yedek siniri asildi' });
      continue;
    }
    plan.items.push({ path: dir, bytes });
    plan.totalBytes += bytes;
  }
  return plan;
}

/** Plani uygular: durum klasorlerini kasaya kopyalar, manifest yazar. */
export async function executeToolBackup(
  tool: CliTool,
  plan: BackupPlan,
  reinstall: string,
): Promise<BackupResult> {
  const res: BackupResult = { vaultDir: plan.vaultDir, copied: [], skipped: [], bytes: 0 };
  if (plan.items.length === 0 && plan.skipped.length === 0) return res;

  await mkdir(longPath(join(plan.vaultDir, 'state')), { recursive: true });

  let i = 0;
  for (const item of plan.items) {
    const dest = join(plan.vaultDir, 'state', `${i++}-${safeName(basename(item.path))}`);
    try {
      await cp(longPath(item.path), longPath(dest), {
        recursive: true,
        force: false,
        errorOnExist: false,
        dereference: false,
      });
      res.copied.push(item.path);
      res.bytes += item.bytes;
    } catch (err) {
      res.skipped.push({ path: item.path, reason: err instanceof Error ? err.message : String(err) });
    }
  }
  for (const s of plan.skipped) res.skipped.push({ path: s.path, reason: s.reason ?? 'atlandi' });

  const manifest = {
    at: new Date().toISOString(),
    command: tool.command,
    source: tool.source,
    packageName: tool.packageName,
    version: tool.version,
    installPath: tool.installPath,
    shims: tool.shims,
    stateDirs: tool.stateDirs,
    uninstall: tool.uninstall?.display ?? null,
    reinstall,
    backedUp: res.copied,
    skipped: res.skipped,
  };
  try {
    await writeFile(longPath(join(plan.vaultDir, 'manifest.json')), JSON.stringify(manifest, null, 2), 'utf8');
    await writeFile(longPath(join(plan.vaultDir, 'RESTORE.md')), restoreDoc(manifest), 'utf8');
  } catch {
    /* manifest yazilamadi; kopyalar yine de kasada */
  }
  return res;
}

/** Aracin paket yoneticisiyle yeniden kurulum komutu. */
export function reinstallCommand(tool: CliTool): string {
  return (
    CliCommandText.reinstall(tool) ??
    '(paket yoneticisi yok; dagitim sayfasindan yeniden kur)'
  );
}

function restoreDoc(m: {
  command: string;
  reinstall: string;
  backedUp: string[];
  stateDirs: string[];
  source: string;
  packageName: string;
  version: string;
}): string {
  const lines = [
    `# Geri yukleme — ${m.command}`,
    '',
    `Kaynak: ${m.source} · paket: ${m.packageName}${m.version ? `@${m.version}` : ''}`,
    '',
    '## 1. Araci yeniden kur',
    '',
    '```',
    m.reinstall,
    '```',
    '',
    '## 2. Durum klasorlerini geri kopyala',
    '',
    ...m.backedUp.map((p, i) => `- state/${i}-...  ->  ${p}`),
    '',
    'Kopyalar bu klasordeki `state/` altindedir; hedef yollar yukaridaki gibidir.',
    '',
    '## 3. Shim dogrulama',
    '',
    'Kurulumdan sonra `where ' + m.command + '` komutuyla shimin yerinde oldugunu dogrula.',
    '',
  ];
  return lines.join('\n');
}

async function dirSize(dir: string): Promise<number> {
  try {
    const w = await walk({ root: dir, largeThreshold: Infinity, maxLarge: 0 });
    return w.bytes;
  } catch {
    return 0;
  }
}
