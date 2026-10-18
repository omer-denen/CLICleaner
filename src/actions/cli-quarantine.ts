import { cp, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { longPath } from '../util/longpath.ts';
import type { CliTool } from '../core/cli-inventory-types.ts';
import { executeToolBackup, planToolBackup, type BackupPlan } from './cli-backup.ts';

/**
 * T19 — karantina modu (paket yoneticisi olmayan bagimsiz araclar).
 *
 * Kaldirma yerine:
 *  1. shim dosyalari kasaya TASINIR (komut PATH'ten duser),
 *  2. durum klasorleri kasaya KOPYALANIR (kullanici verisi yerinde kalir),
 *  3. manifest.json + RESTORE.md yazilir.
 *
 * Geri alma: shim'leri kasadan eski yerine kopyalamak yeterlidir.
 * Hicbir kullanici verisi silinmez; kasa da geri donusum kutusuna
 * tasinabilir.
 */

export interface QuarantineItemPlan {
  tool: CliTool;
  /** Kasa dizini (plan aninda uretilir; execute ayni dizini kullanir). */
  vaultDir: string;
  backup: BackupPlan;
  /** Tasinacak shim dosyalari (orijinal yollar). */
  shims: string[];
  stateDirs: string[];
  totalBytes: number;
}

export interface QuarantinePlan {
  items: QuarantineItemPlan[];
  totalBytes: number;
}

export interface QuarantineItemResult {
  command: string;
  ok: boolean;
  vaultDir: string;
  movedShims: string[];
  copiedState: string[];
  error?: string;
  verified: boolean;
}

/** Yalnizca standalone araclar; her biri icin kasa dizini ve shim listesi. */
export async function planCliQuarantine(tools: CliTool[]): Promise<QuarantinePlan> {
  const items: QuarantineItemPlan[] = [];
  for (const tool of tools) {
    if (tool.source !== 'standalone' || tool.shims.length === 0) continue;
    const backup = await planToolBackup(tool, true);
    items.push({
      tool,
      vaultDir: backup.vaultDir,
      backup,
      shims: [...tool.shims],
      stateDirs: [...tool.stateDirs],
      totalBytes: tool.totalBytes + backup.totalBytes,
    });
  }
  return { items, totalBytes: items.reduce((s, i) => s + i.totalBytes, 0) };
}

export async function executeCliQuarantine(plan: QuarantinePlan): Promise<QuarantineItemResult[]> {
  const out: QuarantineItemResult[] = [];
  for (const item of plan.items) out.push(await quarantineOne(item));
  return out;
}

async function quarantineOne(item: QuarantineItemPlan): Promise<QuarantineItemResult> {
  const res: QuarantineItemResult = {
    command: item.tool.command,
    ok: false,
    vaultDir: item.vaultDir,
    movedShims: [],
    copiedState: [],
    verified: false,
  };

  try {
    await mkdir(longPath(join(item.vaultDir, 'shims')), { recursive: true });

    // 1) Durum klasorleri kasaya kopyalanir (kaynak yerinde kalir).
    const backup = await executeToolBackup(
      item.tool,
      item.backup,
      '(paket yoneticisi yok; shimleri karantinadan geri tasi)',
    );
    res.copiedState = backup.copied;

    // 2) Shim'ler kasaya tasinir. Hata olursa o ana kadar tasinanlar
    //    geri konur; yarim karantina komutu kaybettirmemeli.
    const moved: Array<{ from: string; to: string }> = [];
    try {
      for (let i = 0; i < item.shims.length; i++) {
        const from = item.shims[i]!;
        const to = join(item.vaultDir, 'shims', `${i}-${basename(from)}`);
        await moveFile(from, to);
        moved.push({ from, to });
        res.movedShims.push(from);
      }
    } catch (err) {
      for (const m of moved.reverse()) {
        await moveFile(m.to, m.from).catch(() => {
          /* geri tasinamadi; kasa icerigi RESTORE.md'de listelenir */
        });
      }
      throw err;
    }

    // 3) Manifest + RESTORE.md; dogrulama.
    res.verified =
      item.shims.every((p) => !existsSync(longPath(p))) &&
      item.shims.every((p, i) =>
        existsSync(longPath(join(item.vaultDir, 'shims', `${i}-${basename(p)}`))),
      );
    await writeQuarantineDocs(item, res, backup.skipped);
    res.ok = res.verified;
  } catch (err) {
    res.error = err instanceof Error ? err.message : String(err);
    res.ok = false;
  }
  return res;
}

async function moveFile(from: string, to: string): Promise<void> {
  try {
    await rename(longPath(from), longPath(to));
  } catch {
    // Farkli surucu / kilit: kopyala sonra sil.
    await cp(longPath(from), longPath(to), { force: false, errorOnExist: false });
    await rm(longPath(from));
  }
}

async function writeQuarantineDocs(
  item: QuarantineItemPlan,
  res: QuarantineItemResult,
  skipped: Array<{ path: string; reason: string }>,
): Promise<void> {
  const shimEntries = item.shims.map((p, i) => ({
    from: p,
    file: `${i}-${basename(p)}`,
  }));
  const manifest = {
    at: new Date().toISOString(),
    kind: 'quarantine',
    command: item.tool.command,
    source: item.tool.source,
    packageName: item.tool.packageName,
    version: item.tool.version,
    installPath: item.tool.installPath,
    shims: shimEntries,
    stateDirs: item.stateDirs,
    copiedState: res.copiedState,
    skipped,
    verified: res.verified,
  };

  await writeFile(
    longPath(join(item.vaultDir, 'manifest.json')),
    JSON.stringify(manifest, null, 2),
    'utf8',
  );
  await writeFile(longPath(join(item.vaultDir, 'RESTORE.md')), restoreDoc(item, shimEntries), 'utf8');
}

function restoreDoc(
  item: QuarantineItemPlan,
  shims: Array<{ from: string; file: string }>,
): string {
  const stateEntries = item.stateDirs.map((p, i) => ({
    from: p,
    file: `state/${i}-${basename(p)}`,
  }));

  return [
    `# Geri yukleme — ${item.tool.command} (karantina)`,
    '',
    `Karantina dizini: \`${item.vaultDir}\``,
    '',
    '## 1. Shim\'leri geri tasi',
    '',
    ...shims.map((s) => `- \`shims/${s.file}\`  ->  \`${s.from}\``),
    '',
    '## 2. Durum klasorlerini geri kopyala',
    '',
    ...stateEntries.map((s) => `- \`${s.file}\`  ->  \`${s.from}\``),
    '',
    'Kopyalar bu klasordeki `state/` altindedir; kaynak klasorler zaten yerinde',
    'birakildi, bu adim yalnizca geri donus icin gereklidir.',
    '',
    '## 3. Dogrula',
    '',
    `\`where ${item.tool.command}\` komutu shim'i gostermeli.`,
    '',
    'Dogruladiktan sonra karantina dizinini geri donusum kutusuna tasiyabilirsin.',
    '',
  ].join('\n');
}
