import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * Kurulu surumu okur.
 *
 * `package.json` giris betiginin bir ustunde aranir (global kurulumda:
 * node_modules/residue-cleaner/package.json). Okunamazsa 'unknown' doner —
 * surum bilgisi ASLA uydurulmaz.
 */
export function currentVersion(entry: string = process.argv[1] ?? ''): string {
  try {
    if (!entry) return 'unknown';
    const root = resolve(dirname(entry), '..');
    const txt = readFileSync(join(root, 'package.json'), 'utf8');
    const j = JSON.parse(txt) as { version?: string };
    return typeof j.version === 'string' && j.version.length > 0 ? j.version : 'unknown';
  } catch {
    return 'unknown';
  }
}
