import type { Cluster } from '../../../src/core/types.ts';
import { primaryPath, scanItemId } from '../../../src/core/scan-items.ts';
import type { ScanStreamEvent } from '../../../src/core/contract.ts';

/**
 * Canli tarama durumu.
 *
 * Olaylar tek tek degil TAMPON olarak uygulanir (bkz. `sse-batch.ts`).
 * `items` kimligi `scanItemId` ile kararlidir: ayni oge yeniden gelirse
 * satir guncellenir, listeye ikinci kez eklenmez.
 */

export interface LiveItem {
  id: string;
  key: string;
  path: string;
  cluster: Cluster;
}

export interface LiveScan {
  /** Taranacak dizinlerin tam listesi (sol sutun). */
  paths: string[];
  /** Bulunan ogeler (sag sutun). */
  items: LiveItem[];
  active: string[];
  finished: string[];
}

export interface ScanProgress {
  done: number;
  total: number;
  bytes: number;
}

export interface ScanBatchState {
  live: LiveScan;
  progress: ScanProgress;
}

export const EMPTY_LIVE_SCAN: LiveScan = {
  paths: [],
  items: [],
  active: [],
  finished: [],
};

export const EMPTY_SCAN_PROGRESS: ScanProgress = { done: 0, total: 0, bytes: 0 };

/** Bir tampon olayini duruma uygular; degisiklik yoksa AYNI nesneyi doner. */
export function reduceScanBatch(state: ScanBatchState, events: ScanStreamEvent[]): ScanBatchState {
  let live = state.live;
  let progress = state.progress;
  let changed = false;

  const upsert = (cluster: Cluster): void => {
    const id = scanItemId(cluster);
    const item: LiveItem = {
      id,
      key: cluster.key,
      path: primaryPath(cluster),
      cluster,
    };
    const at = live.items.findIndex((x) => x.id === id);
    if (at >= 0) {
      const items = live.items.slice();
      items[at] = item;
      live = { ...live, items };
    } else {
      live = { ...live, items: [...live.items, item] };
    }
    changed = true;
  };

  for (const ev of events) {
    switch (ev.type) {
      case 'targets':
        live = { ...live, paths: ev.paths };
        changed = true;
        break;
      case 'target-start':
        if (!live.active.includes(ev.path)) {
          live = { ...live, active: [...live.active, ev.path] };
          changed = true;
        }
        break;
      case 'target-done': {
        const active = live.active.filter((p) => p !== ev.path);
        const finished = live.finished.includes(ev.path)
          ? live.finished
          : [...live.finished, ev.path];
        live = { ...live, active, finished };
        changed = true;
        if (ev.cluster) upsert(ev.cluster);
        break;
      }
      case 'item':
        upsert(ev.cluster);
        break;
      case 'progress':
        progress = { done: ev.done, total: ev.total, bytes: ev.bytes };
        changed = true;
        break;
      default:
        // done / cancelled / error App tarafindan ayrica islenir.
        break;
    }
  }

  return changed ? { live, progress } : state;
}
