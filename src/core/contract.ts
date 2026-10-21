import type {
  Cluster,
  Confidence,
  Regenerability,
  ScanResult,
  SkippedEntry,
  VerdictKind,
} from './types.ts';
import type { CategoryKey, CategoryStat } from './categories.ts';
import type { CliInventory, CliTool } from './cli-inventory-types.ts';

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
  /** Kume anahtari: plan ekraninda "plandan cikar" islemi icin. */
  key: string;
  title: string;
  reason: string;
  risk: RiskLevel;
  /** Kume hedeflerinin toplam bayti (motor hesaplar). */
  bytes: number;
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
  root?: string;
  /** Birden fazla proje koku (root ile birlesir). */
  roots?: string[];
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
  /**
   * Oge duzeyi olay. `id` kararlidir (kume anahtari + yol ozeti): ayni
   * oge tekrar gelirse istemci satiri gunceller, cogaltmaz. `target-done`
   * geriye donuk uyumluluk icin korunur.
   */
  | {
      type: 'item';
      id: string;
      key: string;
      path: string;
      cluster: Cluster;
      done: number;
      total: number;
    }
  | { type: 'progress'; done: number; total: number; bytes: number }
  /** Erisilemeyen yollar: tarama durmaz, kanit olarak akar. */
  | { type: 'skipped'; skipped: SkippedEntry[] }
  /** Kullanici taramayi duraklatti / devam ettirdi. */
  | { type: 'paused' }
  | { type: 'resumed' }
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

export type ScanFreshness = 'never' | 'current' | 'stale' | 'scanning';

export interface ScanStatusResponse {
  state: ScanFreshness;
  lastScanAt: number | null;
  ageMs: number | null;
  ttlMs: number;
  nextRecommendedAt: number | null;
  /** Silme/ayar sonrasi disk degisti mi? */
  dirty: boolean;
  scanning: boolean;
  /** Tarama duraklatildi mi? (scanning true iken anlamli) */
  paused?: boolean;
  clusters: number | null;
  /** Surucu dolulugu (salt okunur sistem olcumu). */
  disk: DiskUsageView | null;
}

export interface DiskUsageView {
  drive: string;
  totalBytes: number;
  freeBytes: number;
  /** Doluluk orani 0..1 */
  usedRatio: number;
}

/**
 * Birlesik bulgu (disk + CLI). SALT OKUNUR: planlar kaynak basina ayridir,
 * birlesik bir uygulama YOKTUR (iki ayri yazili onay).
 */
export interface FindingView {
  id: string;
  source: 'disk' | 'cli';
  title: string;
  path: string;
  category: string;
  bytes: number;
  idleDays: number | null;
  risk: RiskLevel;
  verdict: string;
  selectable: boolean;
  reason: string;
  evidence: string[];
  targets: number;
  ref?: string;
  /** Sahip durumu: aktif / yetim / paylasilan / bilinmiyor. */
  ownerStatus?: 'active' | 'orphaned' | 'shared' | 'unknown';
  /** Varsayilan secim yalnizca safe + kanitli ogeleri kapsar. */
  defaultSelected?: boolean;
}

export interface FindingsResponse {
  findings: FindingView[];
  disk: number;
  cli: number;
  at: number | null;
}

export interface SettingsResponse {
  scanCacheHours: number;
  minCacheHours: number;
  maxCacheHours: number;
  /** Bilgi amacli: kasa kayitlari icin onerilen saklama suresi. */
  vaultRetentionDays: number;
  /** Surum kontrolu (T41): off | daily | weekly. Varsayilan off. */
  updateCheck: 'off' | 'daily' | 'weekly';
}

export interface SettingsUpdateRequest {
  scanCacheHours?: number;
  vaultRetentionDays?: number;
  updateCheck?: 'off' | 'daily' | 'weekly';
}

/** Surum kontrolu sonucu (T41). Kapaliyken checked=false, ag istegi yapilmaz. */
export interface UpdateCheckView {
  checked: boolean;
  mode: 'off' | 'daily' | 'weekly';
  latest?: string;
  current?: string;
  updateAvailable: boolean;
  checkedAt?: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Kasa (vault)
// ---------------------------------------------------------------------------

export interface VaultEntryView {
  id: string;
  batchId: string;
  originalPath: string;
  storedPath: string;
  bytes: number;
  files: number;
  at: number;
  ageMs: number;
  /** Onerilen saklama suresine gore kalan gun (bilgi amacli). */
  remainingDays: number;
  /** Orijinal yol su an dolu mu? (geri yuklemede cakisma) */
  originalExists: boolean;
}

export interface VaultListResponse {
  entries: VaultEntryView[];
  totalBytes: number;
  retentionDays: number;
  /** Kalici bosaltma icin beklenen yazili ifade (tek kaynak). */
  purgePhrase: string;
}

export interface VaultRestoreRequest {
  id: string;
  /** files (varsayilan) | repair | side-by-side */
  mode?: 'files' | 'repair' | 'side-by-side';
  /** rename (varsayilan) | overwrite | cancel */
  conflict?: 'rename' | 'overwrite' | 'cancel';
}

export interface VaultRestoreResponse {
  ok: boolean;
  to: string;
  conflict: boolean;
  mode?: string;
  verified?: boolean;
  error?: string;
}

/** Kasadaki tum kayitlari geri yukler (cakismalar `.restored-*` olur). */
export interface VaultRestoreAllResponse {
  ok: boolean;
  restored: number;
  conflict: number;
  failed: number;
  unverified?: number;
}

/** Kasayi bosaltma: kalici, yazili onay ister. */
export interface VaultPurgeRequest {
  /** Sunucunun bekledigi ifade: BOŞALT */
  phrase: string;
  /** Opsiyonel: yalnizca bu kasa oge kimlikleri. Bos/verilmezse tum partiler. */
  ids?: string[];
}

export interface VaultPurgeResponse {
  ok: boolean;
  batches: number;
  bytes: number;
  failed: number;
  items?: number;
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
  /** Orta/yuksek risk varsa yazili onay zorunlu (kasa: TASI, kalici: SIL) */
  requiresPhrase: boolean;
  /** Onay turu: kasa tasima `vaultMove`, kalici silme `delete`. */
  approvalKind: 'vaultMove' | 'delete';
  /** Sunucunun bekledigi yazili ifade (tek kaynak: ApprovalRules). */
  phrase: string;
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
  | {
      type: 'error';
      message: string;
      /** AppError kodu; istemci "yeniden dene" kararini buna gore verir. */
      code?: string;
      retryable?: boolean;
      dataSafe?: boolean;
    };

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
  /** Sunucunun calisma dizini; proje kesfi icin onerilen kok. */
  cwd?: string;
  /** Kullanici profili; proje kesfi icin onerilen kok. */
  home?: string;
  /** Statik arayuz sunuluyor mu? */
  ui?: boolean;
  /** Paket surumu (arayuz alt bilgisi). */
  version?: string;
}

export interface ApiErrorBody {
  error: string;
  scanId?: string;
}

// ---------------------------------------------------------------------------
// Yeni motor sozlesmeleri (tip-only; tarayici da kullanabilir)
// ---------------------------------------------------------------------------

export type {
  EnvAnalysis,
  EnvChange,
  EnvFinding,
  EnvPlan,
  EnvVariable,
  PathEntry,
} from './env-engine.ts';
export type {
  DependencyLevel,
  EdgeKind,
  EdgeState,
  EdgeStrength,
  GraphEdge,
  GraphNode,
  GraphNodeKind,
  NodeRole,
  WhatIfResult,
} from './dependency-graph.ts';
export type {
  Ecosystem,
  ProjectArtifact,
  ProjectCleanupMode,
  ProjectPlan,
  ProjectRecipe,
} from './project-deps.ts';
export type {
  PlanPreview,
  ScheduleFrequency,
  ScheduleRule,
  ScheduleRun,
  ScheduleSelector,
} from './plan-engine.ts';

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
  /** Bagimlilik grafigi nedeniyle plana ALINMAYAN araclar. */
  blocked?: Array<{ id: string; command: string; reason: string; dependents: string[] }>;
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

// ---------------------------------------------------------------------------
// CLI karantina (paket yoneticisi olmayan bagimsiz araclar)
// ---------------------------------------------------------------------------

export interface CliQuarantinePlanRequest {
  ids: string[];
}

export interface CliQuarantineItemView {
  id: string;
  command: string;
  packageName: string;
  version: string;
  installPath: string;
  /** Kasaya TASINACAK shim dosyalari (komut PATH'ten duser). */
  shims: string[];
  /** Kasaya KOPYALANACAK durum klasorleri (veri yerinde kalir). */
  stateDirs: string[];
  status: string;
  idleDays: number;
  evidence: string[];
  totalBytes: number;
}

export interface CliQuarantinePlanResponse {
  planId: string;
  items: CliQuarantineItemView[];
  totalBytes: number;
  /** Karantina da yazili onay ister */
  requiresPhrase: true;
  /** Kullanicinin yazmasi gereken ifade */
  phrase: 'KARANTINA';
  expiresAt: number;
}

export interface CliQuarantineExecuteRequest {
  planId: string;
  phrase: string;
}

export interface CliQuarantineResultView {
  command: string;
  ok: boolean;
  verified: boolean;
  movedShims: number;
  copiedState: number;
  vaultDir: string;
  error?: string;
}

export interface CliQuarantineExecuteResponse {
  results: CliQuarantineResultView[];
}

// ---------------------------------------------------------------------------
// Baslangic ozeti (dashboard) — yalniz KIMLIK + sayi; metin arayuzde.
// ---------------------------------------------------------------------------

export type DashboardCardId =
  | 'scan-missing'
  | 'scan-stale'
  | 'path-issues'
  | 'orphan-vars'
  | 'broken-installs'
  | 'broken-dependencies'
  | 'shadowed-commands'
  | 'interrupted'
  | 'vault-expired'
  | 'schedule-missed'
  | 'schedule-due';

/** Kartin goturdugu ekran; arayuz yalnizca bunu kullanir. */
export type DashboardTarget =
  | 'disk'
  | 'projects'
  | 'tools'
  | 'env'
  | 'graph'
  | 'vault'
  | 'schedules'
  | 'recover';

export type DashboardTone = 'info' | 'warn' | 'danger';

export interface DashboardCardView {
  id: DashboardCardId;
  tone: DashboardTone;
  count: number;
  target: DashboardTarget;
}

export type DashboardLedgerId = 'protected' | 'reclaimable' | 'vault' | 'cli';

export interface DashboardLedgerView {
  id: DashboardLedgerId;
  bytes: number;
}

/** Varsayilan secim kuralini gecen kume; "neden" kimlikle gelir. */
export interface DashboardSafeWinView {
  clusterKey: string;
  category: CategoryKey;
  bytes: number;
  regenerability: Regenerability;
  confidence: Confidence;
}

export interface DashboardScanView {
  state: 'never' | 'current' | 'stale' | 'scanning';
  at: number | null;
  ageMs: number | null;
  scanning: boolean;
  clusters: number;
  files: number;
}

export interface DashboardTotalsView {
  clusters: number;
  files: number;
  verdicts: Record<VerdictKind, number>;
}

export interface DashboardResponse {
  generatedAt: number;
  scan: DashboardScanView;
  ledgers: DashboardLedgerView[];
  cards: DashboardCardView[];
  safeWins: DashboardSafeWinView[];
  totals: DashboardTotalsView;
}

// ---------------------------------------------------------------------------
// Proje kesfi (SALT OKUNUR; silme hedefi uretmez)
// ---------------------------------------------------------------------------

export interface ProjectCandidateView {
  root: string;
  name: string;
  markers: string[];
  git: boolean;
  agentWorkspace: boolean;
  artifacts: string[];
  lockfile: string | null;
  lastActivityAt: number | null;
}

export interface ProjectDiscoverResponse {
  roots: string[];
  projects: ProjectCandidateView[];
  truncated: boolean;
  skipped: number;
}

// ---------------------------------------------------------------------------
// Disk gorunumu (M1) — liste + secim ozeti KARAR MOTORUNDAN gelir.
// ---------------------------------------------------------------------------

export type ClusterKindFilter = 'all' | VerdictKind | 'git';

export interface DiskClusterView {
  key: string;
  title: string;
  category: CategoryKey;
  risk: RiskLevel;
  verdictKind: VerdictKind;
  totalBytes: number;
  reclaimableBytes: number;
  lastTouched: number;
  idleDays: number;
  gitTracked: boolean;
  selectable: boolean;
  plannable: boolean;
  defaultSelected: boolean;
  targetCount: number;
  primaryPath: string;
  /** Siniflandiricidan gelen "bu ne" metni (veri; ceviri degil). */
  what: string;
  /** "Silersem ne olur" metni (veri). */
  consequence: string;
  regenerability: Regenerability;
  confidence: Confidence;
}

export interface DiskSelectionView {
  clusterCount: number;
  bytes: number;
  targetCount: number;
}

export interface DiskViewResponse {
  scan: { at: number | null; clusters: number };
  clusters: DiskClusterView[];
  counts: Record<ClusterKindFilter, number>;
  categories: CategoryStat[];
  totals: {
    clusters: number;
    files: number;
    totalBytes: number;
    reclaimableBytes: number;
  };
  /** Filtrelenmis kumelerden secilebilir/planlanabilir anahtarlar. */
  selectableKeys: string[];
  plannableKeys: string[];
  /** Varsayilan secim kuralini (T34) gecen TUM anahtarlar. */
  defaultSelectedKeys: string[];
  selection: DiskSelectionView;
}

export interface ClusterDetailView {
  cluster: Cluster;
  category: CategoryKey;
  risk: RiskLevel;
  verdictKind: VerdictKind;
  idleDays: number;
  gitTracked: boolean;
  selectable: boolean;
  plannable: boolean;
  defaultSelected: boolean;
}
