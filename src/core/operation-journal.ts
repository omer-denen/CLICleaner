import { appendFile, mkdir, readFile, readdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { dataDir } from './data-dir.ts';
import { longPath } from '../util/longpath.ts';

/**
 * Write-ahead islem gunlugu (operation journal).
 *
 * Kural: DISKE YAZAN her adim, yazmadan ONCE buraya "pending" olarak
 * kaydedilir; sonra "in-progress", islem bitince "done"/"failed".
 * Boylece elektrik kesintisi/crash sonrasinda hangi ogenin yarim
 * kaldigi manifest okunmadan da bilinir.
 *
 * Format: JSONL (satir basina bir olay). Dosya adi operationId icerir;
 * ayni milisaniyede iki islem baslasa bile cakismaz.
 *
 * `%LOCALAPPDATA%\residue\journals\<operationId>.jsonl`
 */

export type OperationState = 'open' | 'closed' | 'crashed';
export type ItemState = 'pending' | 'in-progress' | 'done' | 'failed' | 'skipped';

export interface JournalEvent {
  v: 1;
  at: number;
  operationId: string;
  kind: 'operation' | 'item';
  state: OperationState | ItemState;
  itemId?: string;
  path?: string;
  bytes?: number;
  reason?: string;
  mode?: string;
  planId?: string;
}

export interface InterruptedOperation {
  operationId: string;
  file: string;
  startedAt: number;
  lastAt: number;
  mode?: string;
  planId?: string;
  items: Array<{ itemId: string; path?: string; state: ItemState; bytes?: number; reason?: string }>;
}

export function journalsDir(): string {
  return join(dataDir(), 'journals');
}

function journalFile(operationId: string): string {
  return join(journalsDir(), `${operationId}.jsonl`);
}

export class OperationJournal {
  readonly operationId: string;
  readonly file: string;
  private seq = 0;

  private constructor(operationId: string) {
    this.operationId = operationId;
    this.file = journalFile(operationId);
  }

  static async create(
    operationId: string,
    meta: { mode?: string; planId?: string } = {},
  ): Promise<OperationJournal> {
    const j = new OperationJournal(operationId);
    await mkdir(longPath(journalsDir()), { recursive: true });
    // Once eski/yarim ayni ada sahip dosya varsa arsivle.
    try {
      await rename(longPath(j.file), longPath(`${j.file}.${Date.now()}.old`));
    } catch {
      /* dosya yok: normal */
    }
    await j.append({
      kind: 'operation',
      state: 'open',
      mode: meta.mode,
      planId: meta.planId,
    });
    return j;
  }

  private async append(ev: Omit<JournalEvent, 'v' | 'at' | 'operationId'>): Promise<void> {
    const full: JournalEvent = {
      v: 1,
      at: Date.now(),
      operationId: this.operationId,
      ...ev,
      itemId: ev.itemId ?? undefined,
    };
    // Her olay ayri satir; kismi yazim yalnizca son satiri bozar.
    await appendFile(longPath(this.file), `${JSON.stringify(full)}\n`, 'utf8');
    this.seq++;
  }

  /** Islem baslamadan once cagrilir (journal-first). */
  async pending(itemId: string, path: string, bytes: number): Promise<void> {
    await this.append({ kind: 'item', state: 'pending', itemId, path, bytes });
  }

  async inProgress(itemId: string): Promise<void> {
    await this.append({ kind: 'item', state: 'in-progress', itemId });
  }

  async done(itemId: string, bytes: number): Promise<void> {
    await this.append({ kind: 'item', state: 'done', itemId, bytes });
  }

  async failed(itemId: string, reason: string): Promise<void> {
    await this.append({ kind: 'item', state: 'failed', itemId, reason });
  }

  async skipped(itemId: string, reason: string): Promise<void> {
    await this.append({ kind: 'item', state: 'skipped', itemId, reason });
  }

  /** Islem sonu. Basarisizlikta bile cagrilmalidir. */
  async close(state: 'closed' | 'crashed' = 'closed', reason?: string): Promise<void> {
    await this.append({ kind: 'operation', state, reason });
  }

  get events(): number {
    return this.seq;
  }
}

/** Tum journal dosyalarini olaylara ayirir. Bozuk satirlar atlanir. */
export async function readJournalEvents(file: string): Promise<JournalEvent[]> {
  let text: string;
  try {
    text = await readFile(longPath(file), 'utf8');
  } catch {
    return [];
  }
  const out: JournalEvent[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const ev = JSON.parse(line) as JournalEvent;
      if (ev && ev.v === 1 && typeof ev.operationId === 'string') out.push(ev);
    } catch {
      /* yarim yazilmis son satir: yok sayilir */
    }
  }
  return out;
}

/**
 * Kapanmamis (crash/kill) islemleri bulur. Her oge icin SON durum
 * kazanir; `pending`/`in-progress` kalanlar "yarim" sayilir.
 */
export async function interruptedOperations(): Promise<InterruptedOperation[]> {
  let ents;
  try {
    ents = await readdir(longPath(journalsDir()), { withFileTypes: true });
  } catch {
    return [];
  }
  const out: InterruptedOperation[] = [];
  for (const e of ents) {
    if (!e.isFile() || !e.name.endsWith('.jsonl')) continue;
    const file = join(journalsDir(), e.name);
    const events = await readJournalEvents(file);
    if (events.length === 0) continue;
    const op = events.find((x) => x.kind === 'operation' && x.state === 'open');
    if (!op) continue;
    const closed = events.some((x) => x.kind === 'operation' && x.state === 'closed');
    if (closed) continue;

    const latest = new Map<string, JournalEvent>();
    for (const ev of events) {
      if (ev.kind === 'item' && ev.itemId) latest.set(ev.itemId, ev);
    }
    const items = [...latest.values()].map((ev) => ({
      itemId: ev.itemId!,
      path: ev.path,
      state: ev.state as ItemState,
      bytes: ev.bytes,
      reason: ev.reason,
    }));
    const unfinished = items.filter((i) => i.state === 'pending' || i.state === 'in-progress');
    if (unfinished.length === 0) continue;
    out.push({
      operationId: op.operationId,
      file,
      startedAt: op.at,
      lastAt: events[events.length - 1]?.at ?? op.at,
      mode: op.mode,
      planId: op.planId,
      items: unfinished,
    });
  }
  return out.sort((a, b) => a.startedAt - b.startedAt);
}

/**
 * Kapanmamis journal'lari "crash" olarak isaretler ve arsivler.
 * Dosya tasima/geri yukleme islemini OTOMATIK tamamlamaz; yarim
 * kalan yollari raporlar. Boylece "sessizce yutulan" islem kalmaz.
 */
export async function markInterruptedOperations(): Promise<InterruptedOperation[]> {
  const interrupted = await interruptedOperations();
  for (const op of interrupted) {
    try {
      await appendFile(
        longPath(op.file),
        `${JSON.stringify({
          v: 1,
          at: Date.now(),
          operationId: op.operationId,
          kind: 'operation',
          state: 'crashed',
          reason: `${op.items.length} oge yarim kaldi`,
        })}\n`,
        'utf8',
      );
      await rename(longPath(op.file), longPath(`${op.file}.crashed`));
    } catch {
      /* rapor yine de doner */
    }
  }
  return interrupted;
}
