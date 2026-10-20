/**
 * CLI envanteri veri modeli.
 *
 * Bu dosyada Node'a ait HICBIR calisma zamani importu yoktur; hem
 * sunucu hem tarayici arayuzu ayni tipleri kullanir.
 */

export type CliSource = 'npm-global' | 'uv-tool' | 'dotnet-tool' | 'pip-user' | 'standalone';
export type CliStatus = 'unused' | 'recent' | 'unknown' | 'protected';

/** T35: ayni dizinin birden fazla PATH kaynaginda tanimli olmasi. */
export interface PathDuplicate {
  path: string;
  sources: Array<'user' | 'machine'>;
  detail: string;
}

/** T35: User (HKCU) ve Machine (HKLM) PATH kaynaklari. SALT OKUNUR. */
export interface PathSourceReport {
  userDirs: string[];
  machineDirs: string[];
  /** process.env.PATH icindeki tekil dizin sayisi */
  mergedDirs: number;
  duplicates: PathDuplicate[];
  /** Kayit defterinde tanimli ama diskte olmayan dizinler */
  missing: Array<{ path: string; source: 'user' | 'machine' }>;
  /** Kayit defteri okunamazsa gerekce */
  note?: string;
}

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
  /**
   * Kurulum sagligi. 'broken' = bin dosyasi stub kalmis / calismiyor;
   * genellikle npm'in kurulum betiklerini engellemesinden kaynaklanir.
   */
  health?: 'ok' | 'broken';
  healthEvidence?: string[];
  /** Bozuk kurulumu paket yoneticisiyle onaracak komut. */
  repair?: UninstallSpec;
  /** T17: npm kurulum gunlugunden kurulum izi (varsa). */
  installTrace?: InstallTrace;
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

/**
 * T17: shim agi ile kurulumlar arasindaki tutarsizliklar.
 *
 * Otomatik silme YOKTUR; yalnizca kanit olarak raporlanir.
 */
export interface ShimIssue {
  kind: 'orphan-shim' | 'missing-shim' | 'empty-scope';
  /** Sorunlu dosya ya da beklenen shim yolu. */
  path: string;
  command?: string;
  packageName?: string;
  detail: string;
}

/**
 * T17: PATH'te ayni komutun birden fazla girdisi.
 *
 * entries PATH sirasina gore dizilmistir: ilki gercekten calisan,
 * kalanlar golgede kalan olu agirliklardir.
 */
export interface PathShadow {
  command: string;
  entries: Array<{ path: string; label: string }>;
  /** `where` ile dogrulanan gercek PATH sirasi (varsa). */
  detail: string;
}

/**
 * T17: npm kurulum gunlugunden (`_logs`) cikan kurulum izi.
 *
 * "Ajan kurmus olabilir" kaniti burada uretilir; uygulama adi gecmez,
 * yalnizca kurulum saati, komut ve cwd (ve varsa yapisal izler) yazilir.
 */
export interface InstallTrace {
  at: number;
  /** Ornek: `npm install -g foo` */
  command: string;
  cwd?: string;
  /** cwd icinde beceri/oturum gibi yapisal izler bulunduysa aciklama. */
  agentHint?: string;
  logFile: string;
}

export interface CliInventory {
  scannedAt: number;
  unusedDays: number;
  tools: CliTool[];
  duplicates: CliDuplicates[];
  roots: string[];
  notes: string[];
  /** T17: oksuz / eksik shim ve bos scope sorunlari. */
  shimIssues: ShimIssue[];
  /** T17: PATH'te golgede kalan komut girdileri. */
  pathShadows: PathShadow[];
  /** T35: User / Machine PATH kaynaklari ve cakismalar (SALT OKUNUR). */
  pathChannels?: PathSourceReport;
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
