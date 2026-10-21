import type { CliTool } from './cli-inventory-types.ts';
import type { Cluster } from './types.ts';

/**
 * Sahip durumu (CLI ekseni).
 *
 * Tespit ONCE genel ve imza tabanlidir; bulunan kalinti SONRADAN bir
 * CLI'ye baglanir. Bu modul yalnizca "sahibi var mi, aktif mi, birden
 * fazla mi" sorusunu yanitlar; silme karari vermez.
 */

export type OwnerStatus = 'active' | 'orphaned' | 'shared' | 'unknown';

export const OWNER_STATUS_LABEL: Record<OwnerStatus, string> = {
  active: 'Aktif',
  orphaned: 'Yetim',
  shared: 'Paylasilan',
  unknown: 'Bilinmiyor',
};

/** Disk kumesi icin sahip durumu (kanit varsa). */
export function ownerStatusOfCluster(c: Cluster): OwnerStatus {
  if (c.verdict.regenerability === 'user-data') return 'active';
  const markers = new Set((c.evidence.markers ?? []).map((m) => m.toLowerCase()));
  if (markers.has('shared') || markers.has('multi-owner')) return 'shared';
  if (markers.has('orphan') || markers.has('orphan-shim') || markers.has('missing-owner')) {
    return 'orphaned';
  }
  if (c.evidence.owner) return 'active';
  if (c.parts.length > 1) return 'shared';
  switch (c.archetype) {
    case 'global-packages':
      // Sahibi olmayan global paket/shim = yetim kalinti.
      return 'orphaned';
    case 'pkg-manager-cache':
    case 'updater-staging':
    case 'temp-scratch':
    case 'crash-artifacts':
      // Sahibi bilinmese de yeniden uretilebilir onbellek.
      return 'unknown';
    default:
      return 'unknown';
  }
}

/** CLI araci icin sahip durumu. */
export function ownerStatusOfTool(tool: CliTool): OwnerStatus {
  if (tool.status === 'protected') return 'active';
  if (tool.status === 'recent') return 'active';
  if (tool.status === 'unused') {
    // Ayni komutu saglayan baska kurulum varsa paylasilan sayilir.
    return tool.activeShim === false ? 'shared' : 'orphaned';
  }
  return 'unknown';
}
