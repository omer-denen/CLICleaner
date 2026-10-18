import type { Cluster, ScanResult } from '../core/types.ts';
import type { CliInventory, CliTool } from '../core/cli-inventory-types.ts';

/**
 * Web arayuzu ile sunucu arasindaki veri sozlesmesi.
 *
 * Bu dosyada Node'a ait HICBIR tip yoktur; tarayici tarafi da ayni
 * sozlesmeyi tip olarak kullanir. Boylece API sekli tek yerde kalir.
 *
 * Guvenlik notu: istemci YOL GONDERMEZ. Silinecek yollarin tamami
 * sunucudaki tarama sonucundan uretilir; istemci yalnizca kume
 * anahtarlarini ve onay bilgisini yollar.
 */

export type DeleteMode = 'recycle' | 'purge';
export type RiskLevel = 'safe' | 'low' | 'medium' | 'high';

export interface DeleteTargetView {
  path: string;
  kind: 'whole' | 'older';
  minAgeDays?: number;
  label: string;
  bytes: number;
}

export interface PlannedTargetView {
  target: DeleteTargetView;
  bytes: number;
}

export interface PlannedClusterView {
  title: string;
  reason: string;
  risk: RiskLevel;
  targets: PlannedTargetView[];
}

export interface PlanView {
  mode: DeleteMode;
  clusters: PlannedClusterView[];
  targets: PlannedTargetView[];
  totalBytes: number;
}

// ---------------------------------------------------------------------------
// Tarama
// ---------------------------------------------------------------------------

export interface ScanRequest {
  envs?: string[];
  profile?: string;
  minAgeDays?: number;
  exclude?: string[];
}

export interface ScanStartResponse {
  scanId: string;
}

export interface ActiveScanResponse {
  error: string;
  scanId: string;
}

export type ScanStreamEvent =
  /** Kesif tamamlandi: solda gosterilecek tam alan listesi. */
  | { type: 'targets'; paths: string[] }
  /** Tek tek kokler: kullanici ne taranıyor ve ne bulundu gorur. */
  | { type: 'target-start'; path: string; done: number; total: number }
  | {
      type: 'target-done';
      path: string;
      done: number;
      total: number;
      cluster: Cluster | null;
    }
  | { type: 'progress'; done: number; total: number; bytes: number }
  | { type: 'done'; result: ScanResult }
  | { type: 'cancelled' }
  | { type: 'error'; message: string };

export interface ScanCancelResponse {
  ok: boolean;
}

export interface LatestResponse {
  scan: ScanResult | null;
  at: number | null;
}

// ---------------------------------------------------------------------------
// Plan ve silme
// ---------------------------------------------------------------------------

export interface PlanRequest {
  scanId?: string;
  keys: string[];
  mode: DeleteMode;
}

export interface PlanResponse {
  planId: string;
  plan: PlanView;
  /** Orta/yuksek risk varsa "SIL" yazili onayi zorunlu */
  requiresPhrase: boolean;
  /** Yuksek risk varsa ayrica acik isaretleme zorunlu */
  requiresHighAck: boolean;
  expiresAt: number;
}

export interface ExecuteRequest {
  planId: string;
  phrase?: string;
  acknowledgeHigh?: boolean;
}

export interface ExecuteStartResponse {
  jobId: string;
}

export type ExecuteEvent =
  | { type: 'start'; total: number; bytes: number; mode: DeleteMode }
  | {
      type: 'target-start';
      index: number;
      total: number;
      label: string;
      path: string;
      bytes: number;
    }
  | { type: 'heartbeat'; index: number; elapsedMs: number }
  | {
      type: 'target-done';
      index: number;
      bytesFreed: number;
      removed: number;
      skipped: number;
      failed: number;
    }
  | {
      type: 'done';
      freed: number;
      removed: number;
      skipped: number;
      failed: number;
      journalPath: string;
      mode: DeleteMode;
    }
  | { type: 'error'; message: string };

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

export interface MetaResponse {
  envs: Array<{ id: string; label: string; description: string }>;
  profiles: Array<{ name: string; description: string; envs: string[] }>;
  defaults: {
    envs: string[];
    profile: string | null;
    exclude: string[];
    minAgeDays: number;
  };
}

export interface ApiErrorBody {
  error: string;
  scanId?: string;
}

// ---------------------------------------------------------------------------
// CLI envanteri (SALT OKUNUR) + kaldirma plani
// ---------------------------------------------------------------------------

export interface CliInventoryRequest {
  unusedDays?: number;
}

export type CliInventoryResponse = CliInventory;

/**
 * Envanter artik is olarak baslar; sonuc SSE ile canli akar.
 * Ayni anda tek is calisir, ikinci istek mevcut isi paylasir.
 */
export interface CliInventoryStartResponse {
  jobId: string;
  shared?: boolean;
}

export type CliInventoryStreamEvent =
  | { type: 'start'; unusedDays: number; startedAt: number }
  | { type: 'tool'; tool: CliTool }
  | { type: 'done'; inventory: CliInventory }
  | { type: 'cancelled' }
  | { type: 'error'; message: string };

export interface CliInventoryCancelResponse {
  ok: boolean;
}

export interface CliPlanRequest {
  commands: string[];
  /** Durum klasorlerini kasaya kopyala */
  backup: boolean;
  unusedDays?: number;
}

export interface CliPlanItemView {
  id: string;
  command: string;
  source: string;
  packageName: string;
  version: string;
  installPath: string;
  shims: string[];
  stateDirs: string[];
  status: string;
  confidence: string;
  idleDays: number;
  evidence: string[];
  uninstallCommand: string;
  reinstallCommand: string;
  /** Golgede kalan paket kaldirilinca shim'i onarmak icin komut */
  repairCommand?: string;
  manual: boolean;
  backupPaths: string[];
  backupBytes: number;
  backupSkipped: Array<{ path: string; reason: string }>;
}

export interface CliPlanResponse {
  planId: string;
  items: CliPlanItemView[];
  totalBytes: number;
  backupBytes: number;
  /** CLI kaldirma her zaman yazili onay ister */
  requiresPhrase: true;
  expiresAt: number;
}

export interface CliExecuteRequest {
  planId: string;
  phrase: string;
}

export interface CliExecuteResultView {
  command: string;
  ok: boolean;
  manual: boolean;
  output: string;
  error?: string;
  backupDir?: string;
  verified: boolean;
}

export interface CliExecuteResponse {
  results: CliExecuteResultView[];
}

// ---------------------------------------------------------------------------
// CLI onarim (bozuk / yarim kurulum)
// ---------------------------------------------------------------------------

export interface CliRepairPlanRequest {
  ids: string[];
}

export interface CliRepairItemView {
  id: string;
  command: string;
  packageName: string;
  version: string;
  repairCommand: string;
}

export interface CliRepairPlanResponse {
  planId: string;
  items: CliRepairItemView[];
  /** Onarim da yazili onay ister */
  requiresPhrase: true;
  expiresAt: number;
}

export interface CliRepairExecuteRequest {
  planId: string;
  phrase: string;
}

export interface CliRepairResultView {
  command: string;
  ok: boolean;
  output: string;
  error?: string;
  verified: boolean;
}

export interface CliRepairExecuteResponse {
  results: CliRepairResultView[];
}
