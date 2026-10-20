import { open, type FileHandle } from 'node:fs/promises';
import { longPath } from '../util/longpath.ts';

/**
 * Windows PE (.exe) dosyasini CALISTIRMADAN inceleme (T38).
 *
 * Amac iki soruya yanit vermek:
 *   1. Bu gercekten gecerli bir PE ikilisi mi? (stub / bozuk kurulum kaniti)
 *   2. Surum numarasi nedir? (VersionInfo kaynagi; `--version` calistirmak yok)
 *
 * Neden onemli: bilinmeyen bir .exe'yi "surumunu ogrenmek" icin calistirmak
 * guvenlik ve yan etki riski tasir (kurulum betigi, ag erisimi, kilit).
 * PE basligi ve kaynak dizini statik okunur; surec ACILMAZ.
 *
 * Kapsam: imzali/imzasiz tum PE32 ve PE32+ dosyalari; surum kaynagi yoksa
 * (or. Go/Rust ikilileri) `version: null` doner ama dosya gecerli sayilir.
 */

export interface ExeInfo {
  /** Gecerli MZ + PE basligi var mi? */
  valid: boolean;
  /** VersionInfo'dan okunan surum (yoksa null) */
  version: string | null;
  /** Gecersizse kisa gerekce */
  detail?: string;
}

const MAX_HEADER = 4 * 1024 * 1024;

export async function readExeInfo(file: string): Promise<ExeInfo> {
  let fh: FileHandle;
  try {
    fh = await open(longPath(file), 'r');
  } catch {
    return { valid: false, version: null, detail: 'dosya acilamadi' };
  }

  try {
    const size = (await fh.stat()).size;
    if (size < 64) return { valid: false, version: null, detail: `dosya cok kucuk (${size} B)` };

    const dos = await readAt(fh, 0, 64);
    if (dos.toString('latin1', 0, 2) !== 'MZ') {
      return { valid: false, version: null, detail: 'MZ basligi yok' };
    }

    const peOff = u32(dos, 0x3c);
    if (peOff < 64 || peOff > MAX_HEADER || peOff + 24 > size) {
      return { valid: false, version: null, detail: 'PE basligi konumu gecersiz' };
    }

    const coff = await readAt(fh, peOff, 24);
    if (coff.toString('latin1', 0, 4) !== 'PE\0\0') {
      return { valid: false, version: null, detail: 'PE imzasi yok' };
    }

    const numSections = u16(coff, 6);
    const optSize = u16(coff, 20);
    if (numSections === 0 || numSections > 96 || optSize < 60 || optSize > 4096) {
      return { valid: false, version: null, detail: 'PE baslik boyutlari gecersiz' };
    }

    const optOff = peOff + 24;
    const opt = await readAt(fh, optOff, optSize + numSections * 40);
    if (opt.length < optSize) return { valid: false, version: null, detail: 'PE basligi kesik' };

    const magic = u16(opt, 0);
    const is64 = magic === 0x20b;
    if (magic !== 0x10b && !is64) {
      return { valid: false, version: null, detail: 'bilinmeyen PE bicimi' };
    }

    const ddOffset = is64 ? 112 : 96;
    const numDirs = u32(opt, is64 ? 108 : 92);
    if (numDirs < 3 || opt.length < ddOffset + 3 * 8) {
      return { valid: true, version: null }; // kaynak dizini yok
    }
    const resRva = u32(opt, ddOffset + 2 * 8);
    if (resRva === 0) return { valid: true, version: null };

    const sectionsOff = optSize;
    const sections: Section[] = [];
    for (let i = 0; i < numSections; i++) {
      const o = sectionsOff + i * 40;
      if (o + 40 > opt.length) break;
      sections.push({
        virtualAddress: u32(opt, o + 12),
        virtualSize: u32(opt, o + 8),
        rawSize: u32(opt, o + 16),
        rawPtr: u32(opt, o + 20),
      });
    }

    const version = await readVersion(fh, sections, resRva, size);
    return { valid: true, version };
  } catch {
    return { valid: false, version: null, detail: 'PE okunamadi' };
  } finally {
    await fh.close().catch(() => {});
  }
}

interface Section {
  virtualAddress: number;
  virtualSize: number;
  rawSize: number;
  rawPtr: number;
}

async function readVersion(
  fh: FileHandle,
  sections: Section[],
  resRva: number,
  fileSize: number,
): Promise<string | null> {
  const resOff = rvaToOffset(sections, resRva, fileSize);
  if (resOff === null) return null;

  // Kaynak agaci: tur (16 = RT_VERSION) -> ad (genelde 1) -> dil -> veri.
  const typeDir = await firstResourceEntry(fh, resOff, resOff, (id) => id === 16);
  if (!typeDir?.isDir) return null;
  const nameDir = await firstResourceEntry(fh, resOff, typeDir.offset, () => true);
  if (!nameDir?.isDir) return null;
  const dataEntry = await firstResourceEntry(fh, resOff, nameDir.offset, () => true);
  if (!dataEntry || dataEntry.isDir) return null;

  // Son girdi bir veri girdisidir: RVA + boyut.
  const entry = await readAt(fh, dataEntry.offset, 16);
  const dataRva = u32(entry, 0);
  const dataSize = Math.min(u32(entry, 4), 64 * 1024);
  if (dataSize < 52) return null;

  const dataOff = rvaToOffset(sections, dataRva, fileSize);
  if (dataOff === null) return null;
  const data = await readAt(fh, dataOff, dataSize);
  return parseFixedVersion(data);
}

/**
 * Kaynak dizinindeki girdileri gezer; kosulu saglayan ilk girdiyi dondurur.
 *
 * ONEMLI: alt dizin ve veri girdisi konumlari AYNI sekilde, kaynak dizin
 * tabanina (baseOff) gore verilir. Ust bit yalnizca "bu bir alt dizin"
 * anlamina gelir; konum her zaman baseOff + offset'tir. (Ilk denemede
 * veri girdisi dizin konumundan okunmus ve RVA yerine dil kimligi
 * (0x409) elde edilmisti.)
 */
async function firstResourceEntry(
  fh: FileHandle,
  baseOff: number,
  dirOff: number,
  match: (id: number) => boolean,
): Promise<{ offset: number; isDir: boolean } | null> {
  const head = await readAt(fh, dirOff, 16);
  if (head.length < 16) return null;
  const total = u16(head, 12) + u16(head, 14);
  if (total === 0) return null;

  const entries = await readAt(fh, dirOff + 16, Math.min(total, 1024) * 8);
  for (let i = 0; i + 8 <= entries.length; i += 8) {
    const nameOrId = u32(entries, i);
    if (nameOrId & 0x80000000) continue; // adli girdi: surum kaynagi degil
    if (!match(nameOrId)) continue;
    const child = u32(entries, i + 4);
    return { offset: baseOff + (child & 0x7fffffff), isDir: (child & 0x80000000) !== 0 };
  }
  return null;
}

function rvaToOffset(sections: Section[], rva: number, fileSize: number): number | null {
  for (const s of sections) {
    const span = Math.max(s.virtualSize, s.rawSize);
    if (rva >= s.virtualAddress && rva < s.virtualAddress + span) {
      const off = s.rawPtr + (rva - s.virtualAddress);
      return off >= 0 && off < fileSize ? off : null;
    }
  }
  // Baslik alani (rva < ilk bolum): dosya basindan okunur.
  return rva < fileSize ? rva : null;
}

/** VS_FIXEDFILEINFO icindeki dosya surumunu bulur (imza 0xFEEF04BD). */
function parseFixedVersion(data: Buffer): string | null {
  for (let i = 0; i + 52 <= data.length; i += 4) {
    if (u32(data, i) !== 0xfeef04bd) continue;
    const file = format(u32(data, i + 8), u32(data, i + 12));
    if (file) return file;
    return format(u32(data, i + 16), u32(data, i + 20));
  }
  return null;
}

function format(ms: number, ls: number): string | null {
  const parts = [ms >>> 16, ms & 0xffff, ls >>> 16, ls & 0xffff];
  return parts.some((p) => p !== 0) ? parts.join('.') : null;
}

async function readAt(fh: FileHandle, pos: number, len: number): Promise<Buffer> {
  const b = Buffer.alloc(Math.max(0, len));
  if (len <= 0) return b;
  const { bytesRead } = await fh.read(b, 0, len, pos);
  return b.subarray(0, bytesRead);
}

function u16(b: Buffer, o: number): number {
  return o + 2 <= b.length ? b.readUInt16LE(o) : 0;
}

function u32(b: Buffer, o: number): number {
  return o + 4 <= b.length ? b.readUInt32LE(o) : 0;
}
