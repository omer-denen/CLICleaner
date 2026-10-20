import type { CliStatus, CliTool } from './cli-inventory-types.ts';

/**
 * CLI ENVANTER SORGUSU.
 *
 * "Hangi arac listede", "hangi araclar kaldirilabilir", "bozuk kurulumlar
 * hangileri" sorularinin tek sahibi.
 *
 * Bu modul SAF TypeScript'tir: node builtin importu YOKTUR; hem Node
 * (CLI/TUI) hem tarayici (web) ayni dosyayi paylasabilir.
 *
 * Kurallar:
 *   - Bu modul HICBIR sey kaldirmaz; yalnizca listeler ve sayar.
 *   - "protected" araclar hicbir zaman kaldirilabilir degildir.
 */

/** Envanter filtresi; 'all' = hepsi. */
export type CliFilter = 'all' | CliStatus;

export class CliInventoryQuery {
  private readonly tools: CliTool[];

  constructor(tools: CliTool[]) {
    this.tools = tools;
  }

  /** Envanterdeki tum araclar. */
  get all(): CliTool[] {
    return this.tools;
  }

  /**
   * Sunucudaki siralama ile ayni: once atil, sonra bilinmiyor, yakinda,
   * korunan. Esitlikte boyut azalan.
   */
  static statusOrder(status: CliStatus): number {
    switch (status) {
      case 'unused':
        return 0;
      case 'unknown':
        return 1;
      case 'recent':
        return 2;
      case 'protected':
        return 3;
    }
  }

  /** Araclari duruma gore sirala (durum, sonra boyut). */
  sorted(): CliTool[] {
    return [...this.tools].sort(
      (a, b) =>
        CliInventoryQuery.statusOrder(a.status) - CliInventoryQuery.statusOrder(b.status) ||
        b.totalBytes - a.totalBytes,
    );
  }

  /** Envanter listesi: filtrele + sirala. `filter === 'all'` ise yalniz siralama. */
  filter(filter: CliFilter): CliTool[] {
    const sorted = this.sorted();
    return filter === 'all' ? sorted : sorted.filter((x) => x.status === filter);
  }

  /** Atil (kullanilmayan) araclar. */
  unused(): CliTool[] {
    return this.tools.filter((x) => x.status === 'unused');
  }

  /** Atil araclarin toplam boyutu. */
  unusedBytes(): number {
    let n = 0;
    for (const t of this.tools) if (t.status === 'unused') n += t.totalBytes;
    return n;
  }

  /**
   * Bozuk kurulumlar: ayni paketin birden fazla komutu varsa TEK kart.
   * Anahtar: "kaynak:paket@surum".
   */
  broken(): CliTool[] {
    const map = new Map<string, CliTool>();
    for (const tool of this.tools) {
      if (tool.health !== 'broken') continue;
      const key = `${tool.source}:${tool.packageName}@${tool.version}`;
      if (!map.has(key)) map.set(key, tool);
    }
    return [...map.values()];
  }

  /**
   * Karantina yalnizca paket yoneticisi olmayan (standalone) araclar icin.
   */
  standalone(): CliTool[] {
    return this.tools.filter((x) => x.source === 'standalone' && x.shims.length > 0);
  }

  /**
   * Kaldirilabilir arac mi?
   *
   * "protected" araclar (npm, node, ...) HICBIR ZAMAN kaldirilamaz; kaldirma
   * komutu (uninstall) olmayan arac da kaldirilamaz.
   */
  static isRemovable(tool: CliTool): boolean {
    return tool.status !== 'protected' && tool.uninstall !== null;
  }

  /** Kaldirilabilir araclarin kimlikleri. */
  removableIds(): string[] {
    return this.tools.filter(CliInventoryQuery.isRemovable).map((x) => x.id);
  }

  /** Envanter sayaclari (kartlar ve rozetler icin). */
  counts(): {
    total: number;
    unused: number;
    unknown: number;
    protected: number;
    withStateDirs: number;
    broken: number;
  } {
    const out = {
      total: this.tools.length,
      unused: 0,
      unknown: 0,
      protected: 0,
      withStateDirs: 0,
      broken: 0,
    };
    for (const t of this.tools) {
      if (t.status === 'unused') out.unused++;
      if (t.status === 'unknown') out.unknown++;
      if (t.status === 'protected') out.protected++;
      if ((t.stateDirs?.length ?? 0) > 0) out.withStateDirs++;
      if (t.health === 'broken') out.broken++;
    }
    return out;
  }
}
