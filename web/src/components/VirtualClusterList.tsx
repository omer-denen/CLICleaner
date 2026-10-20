import { useEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Cluster } from '../../../src/core/types.ts';
import { useI18n } from '../i18n.tsx';
import { ClusterRow } from './ClusterRow.tsx';

interface Props {
  items: Cluster[];
  selected: Set<string>;
  expanded: Set<string>;
  /** Klavye imleci (odaklanan satır). P2'de sag panel bunu okur. */
  focusedKey: string | null;
  /** Sekme/filtre/siralama kimligi: degisince kaydirma basa doner. */
  resetKey: string;
  density: 'dense' | 'comfortable';
  onToggle: (key: string) => void;
  onExpand: (key: string) => void;
  onFocus: (key: string) => void;
  onPin: (key: string) => void;
  onSelectMany: (keys: string[], on: boolean) => void;
  onSearchFocus: () => void;
  onEscape: () => void;
}

/**
 * Yoğun ızgara: sanal liste + yapışkan başlık + klavye.
 *
 * Sanallık: tarama yuzlerce kume uretebilir; yalnizca gorunen satirlar
 * DOM'a girer. Satir yuksekligi olculur (genisletilen satir buyur) ve
 * `data-index` ile virtualizer'a bildirilir.
 *
 * Klavye:
 *   ↑/↓  veya  J/K  imleci taşır
 *   Shift+↑/↓         aralık seçimi
 *   Space              odaktaki satırı seçer/seçimi kaldırır
 *   Enter              odak + detayı açar (P2'de sağ paneli sabitler)
 *   /                  aramaya odaklanır
 *   Esc                seçimi bırakır
 */
export function VirtualClusterList({
  items,
  selected,
  expanded,
  focusedKey,
  resetKey,
  density,
  onToggle,
  onExpand,
  onFocus,
  onPin,
  onSelectMany,
  onSearchFocus,
  onEscape,
}: Props) {
  const { t } = useI18n();
  const parentRef = useRef<HTMLDivElement | null>(null);
  /** Shift ile aralık seçimin başlangıç satırı. */
  const anchorRef = useRef<string | null>(null);

  const rowHeight = density === 'dense' ? 32 : 40;

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 10,
    getItemKey: (index) => items[index]?.key ?? index,
  });

  // Sekme/filtre/siralama degisti: eski kaydirma konusu anlamsiz.
  useEffect(() => {
    virtualizer.scrollToOffset(0);
  }, [resetKey, virtualizer]);

  const focusIndex = useMemo(
    () => items.findIndex((i) => i.key === focusedKey),
    [items, focusedKey],
  );

  useEffect(() => {
    /** Aralık secimi: ankaydan hedefe kadar tum satirlari isaretler. */
    const extendTo = (targetIndex: number) => {
      const anchorKey =
        anchorRef.current ??
        (focusIndex >= 0 ? items[focusIndex]?.key : items[targetIndex]?.key);
      if (!anchorKey) return;
      anchorRef.current = anchorKey;
      const a = items.findIndex((i) => i.key === anchorKey);
      if (a < 0) return;
      const lo = Math.min(a, targetIndex);
      const hi = Math.max(a, targetIndex);
      const keys = items.slice(lo, hi + 1).map((i) => i.key);
      onSelectMany(keys, selected.has(anchorKey));
    };

    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);

      if (typing) {
        if (e.key === 'Escape') {
          onEscape();
          el.blur();
        }
        return;
      }

      // Buton uzerindeyken Space/Enter butona ait kalir.
      const onButton = el?.tagName === 'BUTTON';

      switch (e.key) {
        case 'ArrowDown':
        case 'j': {
          if (items.length === 0) return;
          e.preventDefault();
          const from = focusIndex >= 0 ? focusIndex : -1;
          const next = Math.min(items.length - 1, from + 1);
          const nextItem = items[next];
          if (!nextItem) return;
          if (e.shiftKey) extendTo(next);
          else anchorRef.current = nextItem.key;
          onFocus(nextItem.key);
          virtualizer.scrollToIndex(next, { align: 'auto' });
          break;
        }
        case 'ArrowUp':
        case 'k': {
          if (items.length === 0) return;
          e.preventDefault();
          const from = focusIndex >= 0 ? focusIndex : 0;
          const next = Math.max(0, from - 1);
          const nextItem = items[next];
          if (!nextItem) return;
          if (e.shiftKey) extendTo(next);
          else anchorRef.current = nextItem.key;
          onFocus(nextItem.key);
          virtualizer.scrollToIndex(next, { align: 'auto' });
          break;
        }
        case ' ': {
          if (onButton || !focusedKey) return;
          e.preventDefault();
          onToggle(focusedKey);
          break;
        }
        case 'Enter': {
          if (onButton || !focusedKey) return;
          e.preventDefault();
          onFocus(focusedKey);
          onPin(focusedKey);
          break;
        }
        case '/': {
          e.preventDefault();
          onSearchFocus();
          break;
        }
        case 'Escape': {
          onEscape();
          break;
        }
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    items,
    focusIndex,
    focusedKey,
    selected,
    onToggle,
    onExpand,
    onFocus,
    onPin,
    onSelectMany,
    onSearchFocus,
    onEscape,
    virtualizer,
  ]);

  return (
    <div
      className={`vlist density-${density}`}
      ref={parentRef}
      role="list"
      aria-label={t('Kümeler')}
    >
      <div className="vlist-head" role="row">
        <span className="cell check" aria-hidden="true" />
        <span className="cell title">{t('Başlık')}</span>
        <span className="cell cat">{t('Kategori')}</span>
        <span className="cell num age">{t('Son hareket')}</span>
        <span className="cell num size">{t('Boyut')}</span>
        <span className="cell risk">{t('Risk')}</span>
        <span className="cell verdict">{t('Karar')}</span>
      </div>

      <div className="vlist-inner" style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((row) => {
          const cluster = items[row.index];
          if (!cluster) return null;
          const selectable =
            cluster.verdict.kind !== 'report-only' && (cluster.deleteTargets?.length ?? 0) > 0;
          return (
            <div
              key={row.key}
              data-index={row.index}
              ref={virtualizer.measureElement}
              className="vlist-item"
              role="listitem"
              style={{ transform: `translateY(${row.start}px)` }}
            >
              <ClusterRow
                cluster={cluster}
                selected={selected.has(cluster.key)}
                expanded={expanded.has(cluster.key)}
                focused={focusedKey === cluster.key}
                selectable={selectable}
                onToggle={() => onToggle(cluster.key)}
                onExpand={() => onExpand(cluster.key)}
                onFocus={() => onFocus(cluster.key)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
