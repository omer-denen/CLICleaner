import type { DeleteTarget } from './types.ts';

/**
 * KOMUT METINLERI.
 *
 * Baglam panelinde gosterilen guvenli (yalniz plan ureten) ve manuel
 * (PowerShell) komutlar burada uretilir. Arayuz yalnizca metni gosterir
 * ve kopyalar; komutun bicimini degistirmez.
 *
 * Kurallar:
 *   - "Guvenli" komutlar HICBIR sey silmez; yalniz plan/rapor uretir.
 *   - Manuel komut aracin kontrolunden gecmez; bu yuzden ayri ve
 *     uyarili gosterilir.
 *
 * Bu modul SAF TypeScript'tir: node builtin importu YOKTUR.
 */

export type SafeCommandId = 'explain' | 'dry-run';

export interface SafeCommand {
  /** Arayuzun ceviri anahtarini secmesi icin kararli kimlik. */
  id: SafeCommandId;
  text: string;
}

export interface ManualCommand {
  text: string;
  bytes: number;
  kind: DeleteTarget['kind'];
}

export class TargetCommands {
  /** Karar gerekcesini acar (SALT OKUNUR). */
  static explain(key: string): string {
    return `clicleaner explain ${key}`;
  }

  /** Yalniz verilen kume icin plan uretir; hicbir sey silmez. */
  static dryRun(key: string): string {
    return `clicleaner clean --only ${key} --dry-run`;
  }

  /** Panelde gosterilen guvenli komutlar. */
  static safe(key: string): SafeCommand[] {
    return [
      { id: 'explain', text: TargetCommands.explain(key) },
      { id: 'dry-run', text: TargetCommands.dryRun(key) },
    ];
  }

  /**
   * Tek hedef icin manuel PowerShell komutu.
   *
   * "older" hedefler yas filtresini korur; "whole" hedefler klasorun
   * tamamini hedefler. Bu komut aracin guvenlik kapisindan GECMEZ.
   */
  static manual(target: DeleteTarget): string {
    if (target.kind === 'whole') {
      return `Remove-Item -LiteralPath "${target.path}" -Recurse -Force`;
    }
    return `Get-ChildItem -LiteralPath "${target.path}" -Recurse -File | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-${target.minAgeDays ?? 0}) } | Remove-Item -Force`;
  }

  /** Manuel komut listesi (en fazla `limit` hedef). */
  static manualList(targets: DeleteTarget[], limit = 3): ManualCommand[] {
    return targets.slice(0, limit).map((target) => ({
      text: TargetCommands.manual(target),
      bytes: target.bytes,
      kind: target.kind,
    }));
  }
}
