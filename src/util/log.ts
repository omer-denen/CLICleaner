import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { longPath } from './longpath.ts';

/**
 * CLICleaner gunlugu.
 *
 * Onemlilik: bu bir hata ayiklama blogu DEGIL. Arac neden oyle
 * karar verdigini, hangi kaniti hangi sonuca cevirdigini ve hangi
 * adimin neden basarisiz oldugunu kaydeder. "Neden silmedi" sorusunun
 * cevabi buradadir.
 */

export type Level = 'info' | 'warn' | 'error' | 'debug';

export interface Entry {
  at: string;
  level: Level;
  msg: string;
  data?: Record<string, unknown>;
}

let stream: Promise<void> | null = null;

export function logDir(): string {
  return join(process.env.LOCALAPPDATA ?? '.', 'clicleaner', 'logs');
}

async function ensureDir(): Promise<string> {
  const d = logDir();
  await mkdir(longPath(d), { recursive: true });
  return d;
}

/** Gunluğe yaz. Hata durumunda sessizce gec (gunluk asla isi durdurmamali). */
export async function log(level: Level, msg: string, data?: Record<string, unknown>): Promise<void> {
  try {
    const d = await ensureDir();
    const e: Entry = { at: new Date().toISOString(), level, msg, ...(data ? { data } : {}) };
    await appendFile(longPath(join(d, 'clicleaner.log')), JSON.stringify(e) + '\n', 'utf8');
  } catch {
    /* gunluk yazilamazsa sessizce gec */
  }
}

/** Gecici yazmalar icin hizli yol (await edilmeden). */
export function logSync(level: Level, msg: string, data?: Record<string, unknown>): void {
  if (!stream) {
    stream = (async () => {
      const d = await ensureDir();
      const e: Entry = { at: new Date().toISOString(), level, msg, ...(data ? { data } : {}) };
      await appendFile(longPath(join(d, 'clicleaner.log')), JSON.stringify(e) + '\n', 'utf8');
    })().catch(() => {});
  }
  void stream;
}

export const info = (m: string, d?: Record<string, unknown>) => log('info', m, d);
export const warn = (m: string, d?: Record<string, unknown>) => log('warn', m, d);
export const error = (m: string, d?: Record<string, unknown>) => log('error', m, d);
export const debug = (m: string, d?: Record<string, unknown>) => log('debug', m, d);

/** Tum gunlugu oku (filtreli). */
export async function readLog(filter?: { level?: Level; since?: number; limit?: number }): Promise<Entry[]> {
  const d = logDir();
  const p = join(d, 'clicleaner.log');
  const out: Entry[] = [];
  let txt: string;
  try {
    txt = await readFile(longPath(p), 'utf8');
  } catch {
    return out;
  }
  for (const line of txt.split('\n')) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line) as Entry;
      if (filter?.level && e.level !== filter.level) continue;
      if (filter?.since) {
        const t = Date.parse(e.at);
        if (t < filter.since) continue;
      }
      out.push(e);
    } catch {
      /* bozuk satir */
    }
  }
  if (filter?.limit) return out.slice(-filter.limit);
  return out;
}

/** Gunlugu temizle. */
export async function clearLog(): Promise<void> {
  try {
    const d = await ensureDir();
    await writeFile(longPath(join(d, 'clicleaner.log')), '', 'utf8');
  } catch {
    /* yoksay */
  }
}