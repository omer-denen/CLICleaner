import type { CliInventory, CliTool } from './cli-inventory-types.ts';
import { categoryOf, type CategoryKey } from './categories.ts';
import { SelectionScope } from './selection-scope.ts';
import type { Cluster, Risk, ScanResult } from './types.ts';

/**
 * Birlesik bulgu gorunumu (T42 / D3 P5).
 *
 * Disk kumeleri ve CLI araclari TEK listede gosterilir; boylece kullanici
 * "diskimde ne var + hangi CLI'lar atil" sorusunu tek ekranda yanitlar.
 *
 * Onemli kural: **planlar ayridir.** Bu liste SALT OKUNUR bir gorunumdur.
 * Disk plani disk bulgulariyla, CLI kaldirma plani CLI bulgulariyla kurulur;
 * birlesik bir uygulama YOKTUR (iki ayri yazili onay).
 */

export type FindingSource = 'disk' | 'cli';

export interface Finding {
  /** Kaynak + anahtar: "disk:<kume anahtari>" / "cli:<arac id>" */
  id: string;
  source: FindingSource;
  title: string;
  /** Ana yol (disk: kume kok yolu, CLI: kurulum yolu) */
  path: string;
  /** Disk icin kanit tureti kategori; CLI icin 'orphaned-cli' */
  category: CategoryKey;
  bytes: number;
  /** Bos gecen gun (null = bilinmiyor) */
  idleDays: number | null;
  risk: Risk;
  /** Karar etiketi: disk karari veya CLI durumu */
  verdict: string;
  /** Bu bulgu bir planla hedeflenebilir mi? */
  selectable: boolean;
  /** "Neden" — tek cumlelik gerekce */
  reason: string;
  /** Kanit ozetleri (kisa) */
  evidence: string[];
  /** Silinecek hedef sayisi (disk) */
  targets: number;
  /** Kaynak tarafi icin ek kimlik (ornegin komut adi) */
  ref?: string;
}

/** Disk kumelerinden bulgular. */
export function diskFindings(clusters: Cluster[]): Finding[] {
  const out: Finding[] = [];
  for (const c of clusters) {
    const root = c.parts[0]?.path ?? '';
    const selectable = SelectionScope.isPlannable(c);
    const evidence: string[] = [];
    for (const k of c.evidence.fileKinds ?? []) evidence.push(k);
    for (const m of (c.evidence.markers ?? []).slice(0, 3)) evidence.push(m);
    out.push({
      id: `disk:${c.key}`,
      source: 'disk',
      title: c.title,
      path: root,
      category: categoryOf(c),
      bytes: c.totalBytes,
      idleDays: null,
      risk: c.verdict.risk,
      verdict: c.verdict.kind,
      selectable,
      reason: c.verdict.consequence,
      evidence,
      targets: (c.deleteTargets?.length ?? 0),
    });
  }
  return out;
}

/** CLI envanterinden bulgular. */
export function cliFindings(inventory: CliInventory | null): Finding[] {
  if (!inventory) return [];
  const out: Finding[] = [];
  for (const t of inventory.tools ?? []) {
    out.push({
      id: `cli:${t.id}`,
      source: 'cli',
      title: t.command,
      path: t.installPath,
      category: 'orphaned-cli',
      bytes: t.totalBytes,
      idleDays: Number.isFinite(t.idleDays) ? t.idleDays : null,
      risk: cliRisk(t),
      verdict: t.status,
      // CLI kaldirmasi kendi planiyla olur; bu liste salt okunur.
      selectable: false,
      reason: cliReason(t),
      evidence: (t.evidence ?? []).slice(0, 5),
      targets: (t.shims?.length ?? 0) + (t.stateDirs?.length ?? 0),
      ref: t.command,
    });
  }
  return out;
}

function cliRisk(t: CliTool): Risk {
  switch (t.status) {
    case 'unused':
      // Atil arac: guven yuksekse dusuk risk, aksi halde orta.
      return t.confidence === 'high' ? 'low' : 'medium';
    case 'recent':
      return 'safe';
    case 'unknown':
      return 'medium';
    case 'protected':
    default:
      return 'safe';
  }
}

function cliReason(t: CliTool): string {
  switch (t.status) {
    case 'unused':
      return `${t.idleDays} gündür kullanılmadı; kaldırma planı çıkarılabilir.`;
    case 'recent':
      return 'Yakında kullanılmış; kaldırılmıyor.';
    case 'unknown':
      return 'Kullanım kanıtı yok; önce incelenmeli.';
    case 'protected':
      return 'Korunuyor; kaldırılmıyor.';
    default:
      return 'Aktif kullanımda; kaldırılmıyor.';
  }
}

/** Iki kaynagi birlestirir: once disk, sonra CLI. */
export function mergeFindings(disk: Finding[], cli: Finding[]): Finding[] {
  return [...disk, ...cli];
}

/** Disk bulgu kimliginin oneki. */
const DISK_FINDING_PREFIX = 'disk:';

/**
 * Disk bulgusundan kume anahtari; CLI bulgusunda null.
 *
 * Arayuz kimligi ayristirmaz; odaklanan bulgunun kume karsiligini
 * bu fonksiyonla bulur.
 */
export function findingClusterKey(finding: Pick<Finding, 'id'>): string | null {
  if (!finding.id.startsWith(DISK_FINDING_PREFIX)) return null;
  const key = finding.id.slice(DISK_FINDING_PREFIX.length);
  return key.length > 0 ? key : null;
}

/** Son tarama sonucundan butun bulgular (disk + CLI). */
export function buildFindings(
  scan: ScanResult | null,
  inventory: CliInventory | null,
): Finding[] {
  return mergeFindings(diskFindings(scan?.clusters ?? []), cliFindings(inventory));
}
