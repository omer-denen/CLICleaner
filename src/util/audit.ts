import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { dataDir } from '../core/data-dir.ts';
import { longPath } from './longpath.ts';

/**
 * Denetim kaydi (audit log).
 *
 * Normal gunlukten AYRI dosyadir: karar/onay/override gibi olaylar
 * degistirilemez bir iz birakir. JSONL yazilir; okuma araci yoktur.
 * Hassas degerler buraya ASLA yazilmaz; cagiran maskeleme yapar.
 */

export function auditPath(): string {
  return join(dataDir(), 'audit.log');
}

export async function audit(event: string, data: Record<string, unknown> = {}): Promise<void> {
  try {
    const file = auditPath();
    await mkdir(longPath(dirname(file)), { recursive: true });
    await appendFile(
      longPath(file),
      `${JSON.stringify({ at: new Date().toISOString(), event, ...data })}\n`,
      'utf8',
    );
  } catch {
    /* denetim yazilamadi: islem engellenmez, normal log yine yazar */
  }
}
