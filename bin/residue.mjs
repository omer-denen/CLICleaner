#!/usr/bin/env node
/**
 * Residue giris noktasi.
 *
 * TypeScript dosyalari (ve .tsx) dogrudan calistirilabilir olmali; bu
 * yuzden tsx yukleyicisi devreye alinir. tsx kurulu degilse kullaniciya
 * acik bir hata verilir.
 */
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const entry = pathToFileURL(join(here, '..', 'src', 'cli.ts')).href;

const require = createRequire(import.meta.url);

try {
  // tsx'in ESM API'si Node'un yukleyici zincirine kendini kaydeder;
  // boylece .ts ve .tsx dosyalari anlasilir hale gelir.
  const { register } = await import('tsx/esm/api');
  register();
} catch (err) {
  console.error(
    '\nResidue calistirilamadi: "tsx" yukleyicisi bulunamadi.\n' +
      'Projeye girip su komutu calistir:  npm install\n',
  );
  console.error(String(err));
  process.exit(1);
}

await import(entry);