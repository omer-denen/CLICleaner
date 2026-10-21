import type { IncomingMessage, ServerResponse } from 'node:http';
import { ServiceError } from '../services/errors.ts';

/** Tarayicidan gelen govde limiti: plan listesi kucuktur, 1 MB yeter. */
export const MAX_BODY = 1024 * 1024;

export async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    size += buf.length;
    if (size > MAX_BODY) throw new ServiceError(413, 'Istek govdesi cok buyuk');
    chunks.push(buf);
  }
  if (chunks.length === 0) return {} as T;
  const txt = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(txt) as T;
  } catch {
    throw new ServiceError(400, 'Gecersiz JSON govdesi');
  }
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  if (res.writableEnded) return;
  const txt = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(txt);
}

export function sseSetup(res: ServerResponse): void {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  res.flushHeaders?.();
  res.write(': bagli\n\n');
}

/**
 * SSE olayi yazar. `id` verilirse tarayici `Last-Event-ID` olarak
 * saklar ve baglanti koptugunda sunucuya geri gonderir (MDN: SSE
 * event stream format). Yeniden baglanmada olaylar bu kimlikten
 * sonrasindan tekrar oynatilir.
 */
export function sseSend(res: ServerResponse, data: unknown, id?: number): void {
  if (res.writableEnded) return;
  try {
    if (typeof id === 'number' && Number.isFinite(id)) res.write(`id: ${id}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch {
    /* istemci koptu */
  }
}

/** SSE yorum satiri: bazi proxy'lerin bos baglantiyi kapatmasini engeller. */
export function sseComment(res: ServerResponse, text = 'ping'): void {
  if (res.writableEnded) return;
  try {
    res.write(`: ${text}\n\n`);
  } catch {
    /* istemci koptu */
  }
}
