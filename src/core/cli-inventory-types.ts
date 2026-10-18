/**
 * CLI envanteri veri modeli.
 *
 * Bu dosyada Node'a ait HICBIR calisma zamani importu yoktur; hem
 * sunucu hem tarayici arayuzu ayni tipleri kullanir.
 */

export type CliSource = 'npm-global' | 'uv-tool' | 'dotnet-tool' | 'pip-user' | 'standalone';
export type CliStatus = 'unused' | 'recent' | 'unknown' | 'protected';

export interface UninstallSpec {
  kind: 'npm' | 'uv' | 'dotnet' | 'pip' | 'manual';
  program: string;
  args: string[];
  /** Kullaniciya gosterilecek komut */
  display: string;
}

export interface CliTool {
  id: string;
  command: string;
  source: CliSource;
  packageName: string;
  version: string;
  installPath: string;
  shims: string[];
  /**
   * PATH'teki shim'in gosterdigi hedef (npm icin). Ayni komutu birden
   * fazla paket sagladiginda hangisinin gercekten cagrildigini kanitlar.
   */
  shimTarget?: string;
  /** Shim bu kurulumu mu gosteriyor? (false = golgede kalan eski kurulum) */
  activeShim?: boolean;
  /** Ayni kurulumun icinde kalan eski surum yollari (or. .store) */
  stalePaths: string[];
  stateDirs: string[];
  installedAt: number;
  lastAccessAt: number;
  lastStateAt: number;
  historyMentions: number;
  /** Kabuk gecmisindeki son bahsin konumu (1 = en son satirlar) */
  historyLastRatio: number;
  totalBytes: number;
  idleDays: number;
  status: CliStatus;
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
  uninstall: UninstallSpec | null;
}

/**
 * Ayni komutun birden fazla kaynaktan kurulmasi.
 *
 * "Birlestirme" karari burada VERILMEZ; yalnizca hangi kurulumun
 * tutulacagi kanitla onerilir.
 */
export interface CliDuplicates {
  command: string;
  keepId: string;
  removeIds: string[];
  /** Aktif shim'in isaret ettigi kurulum (varsa). */
  activeId?: string;
  reason: string;
}

export interface CliInventory {
  scannedAt: number;
  unusedDays: number;
  tools: CliTool[];
  duplicates: CliDuplicates[];
  roots: string[];
  notes: string[];
}

export interface CliInventoryOptions {
  unusedDays?: number;
  now?: number;
  /**
   * Her arac bulundugu anda cagrilir. Web arayuzu bunu SSE ile
   * canli akitir; toplu sonucu beklemez.
   */
  onTool?: (tool: CliTool) => void;
  /** Envanter taramasini iptal etmek icin. */
  signal?: AbortSignal;
}
