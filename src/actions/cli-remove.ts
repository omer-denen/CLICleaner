import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { longPath } from '../util/longpath.ts';
import type { CliTool } from '../core/cli-inventory-types.ts';
import {
  executeToolBackup,
  planToolBackup,
  reinstallCommand,
  type BackupPlan,
} from './cli-backup.ts';

/**
 * CLI kaldirma plani ve yurutme.
 *
 * TEMEL KURAL: kurulum klasoru ELLE SILINMEZ. Her arac kendi paket
 * yoneticisinin uninstall komutuyla kaldirilir; boylece PATH shimleri
 * de birlikte temizlenir. Paket yoneticisi bilinmiyorsa (standalone)
 * arac "manual" isaretlenir ve HICBIR SEY silinmez.
 */

export interface CliRemovalItem {
  tool: CliTool;
  backup: BackupPlan;
  manual: boolean;
  uninstallCommand: string;
  reinstallCommand: string;
}

export interface CliRemovalPlan {
  id: string;
  createdAt: number;
  expiresAt: number;
  backup: boolean;
  items: CliRemovalItem[];
  totalBytes: number;
  backupBytes: number;
}

export interface CliRemovalResult {
  command: string;
  ok: boolean;
  manual: boolean;
  output: string;
  error?: string;
  backupDir?: string;
  /** Kaldirma sonrasi shim'lerin gercekten gittigi dogrulandi mi? */
  verified: boolean;
}

const PLAN_TTL_MS = 10 * 60_000;
const MAX_OUTPUT = 4096;

export async function planCliRemoval(tools: CliTool[], backup: boolean): Promise<CliRemovalPlan> {
  const items: CliRemovalItem[] = [];
  let totalBytes = 0;
  let backupBytes = 0;

  // Ayni paket birden fazla komut saglayabilir (or. opencode + opencode2).
  // Ayni paketi plana iki kez koymak uninstall'i iki kez calistirir.
  const seenPackages = new Set<string>();

  for (const tool of tools) {
    const packageKey = `${tool.source}:${tool.packageName.toLowerCase()}`;
    if (seenPackages.has(packageKey)) continue;
    seenPackages.add(packageKey);

    const backupPlan = await planToolBackup(tool, backup);
    items.push({
      tool,
      backup: backupPlan,
      manual: tool.uninstall === null,
      uninstallCommand: tool.uninstall?.display ?? 'elle kaldir',
      reinstallCommand: reinstallCommand(tool),
    });
    totalBytes += tool.totalBytes;
    backupBytes += backupPlan.totalBytes;
  }

  const now = Date.now();
  return {
    id: randomBytes(8).toString('hex'),
    createdAt: now,
    expiresAt: now + PLAN_TTL_MS,
    backup,
    items,
    totalBytes,
    backupBytes,
  };
}

export async function executeCliRemoval(plan: CliRemovalPlan): Promise<CliRemovalResult[]> {
  const out: CliRemovalResult[] = [];

  for (const item of plan.items) {
    const tool = item.tool;

    if (item.manual || !tool.uninstall) {
      out.push({
        command: tool.command,
        ok: false,
        manual: true,
        output: 'Paket yoneticisi bilinmiyor; kurulum klasorune dokunulmadi. Elle kaldirilmali.',
        verified: false,
      });
      continue;
    }

    let backupDir: string | undefined;
    if (plan.backup) {
      try {
        const b = await executeToolBackup(tool, item.backup, item.reinstallCommand);
        backupDir = b.vaultDir;
      } catch (err) {
        out.push({
          command: tool.command,
          ok: false,
          manual: false,
          output: 'Yedek alinamadi; kaldirma baslatilmadi.',
          error: describe(err),
          verified: false,
        });
        continue;
      }
    }

    const r = await runProcess(tool.uninstall.program, tool.uninstall.args);
    // Ayni komutu baska bir paket de sagliyorsa shim SILINMEZ; hedefi
    // degisir. Bu yuzden "shim yok" yerine "paket gitti ve shim artik
    // bu paketi gostermiyor" kontrol edilir.
    const packageGone = !existsSync(longPath(tool.installPath));
    const stillPoints = await Promise.all(
      tool.shims.map((p) => shimPointsTo(p, tool.installPath)),
    );
    const verified = packageGone && !stillPoints.some(Boolean);
    out.push({
      command: tool.command,
      ok: r.code === 0,
      manual: false,
      output: truncate([r.stdout, r.stderr].filter(Boolean).join('\n').trim() || `cikis kodu ${r.code ?? '?'}`),
      ...(r.code !== 0 ? { error: `cikis kodu ${r.code ?? '?'}${r.timedOut ? ' (zaman asimi)' : ''}` } : {}),
      ...(backupDir ? { backupDir } : {}),
      verified,
    });
  }

  return out;
}

interface ProcessResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

function runProcess(program: string, args: string[]): Promise<ProcessResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    let child;
    try {
      child = spawn(program, args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
      });
    } catch (err) {
      resolve({ code: null, stdout: '', stderr: describe(err), timedOut: false });
      return;
    }

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, 120_000);

    child.stdout?.on('data', (c: Buffer | string) => {
      if (stdout.length < MAX_OUTPUT) stdout += String(c);
    });
    child.stderr?.on('data', (c: Buffer | string) => {
      if (stderr.length < MAX_OUTPUT) stderr += String(c);
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: null, stdout, stderr: describe(err), timedOut });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}

/**
 * Shim dosyasi hala verilen kurulum yolunu mu gosteriyor?
 * Kaldirma sonrasi shim baska bir pakete yonlendiyse false doner.
 */
async function shimPointsTo(shim: string, installPath: string): Promise<boolean> {
  try {
    const txt = await readFile(longPath(shim), 'utf8');
    const norm = (s: string) => s.replace(/\//g, '\\').toLowerCase();
    return norm(txt).includes(norm(installPath));
  } catch {
    return false;
  }
}

function truncate(s: string): string {
  return s.length > MAX_OUTPUT ? `${s.slice(0, MAX_OUTPUT)}…` : s;
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
