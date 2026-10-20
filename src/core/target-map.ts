import type { DeleteTarget } from './types.ts';

/**
 * SILME HEDEFI HARITASI.
 *
 * Bir kumenin silme hedefleriyle iliskileri: hangi hedef hangi parcanin
 * altinda, tur dagilimi (klasorun tamami / yasli dosyalar), toplam bayt.
 *
 * Bu modul SAF TypeScript'tir: node builtin importu YOKTUR.
 */
export class TargetMap {
  private readonly targets: DeleteTarget[];

  constructor(targets: DeleteTarget[]) {
    this.targets = targets;
  }

  /** Tum hedefler. */
  get all(): DeleteTarget[] {
    return this.targets;
  }

  /**
   * Verilen parcanin ALTINDA kalan hedefler (yol oneki; buyuk/kucuk harf
   * duyarsiz). "Bagimlilik agaci" bu iliskiyi gosterir.
   */
  underPart(partPath: string): DeleteTarget[] {
    const p = partPath.toLowerCase();
    return this.targets.filter((t) => t.path.toLowerCase().startsWith(p));
  }

  /** Hedef turu dagilimi. */
  byKind(): { whole: number; older: number } {
    let whole = 0;
    let older = 0;
    for (const t of this.targets) {
      if (t.kind === 'whole') whole++;
      else older++;
    }
    return { whole, older };
  }

  /** Toplam kurtarilabilir bayt. */
  totalBytes(): number {
    let n = 0;
    for (const t of this.targets) n += t.bytes;
    return n;
  }
}
