import { useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Cluster } from '../../../src/core/types.ts';
import { useI18n } from '../i18n.tsx';
import { ClusterRow } from './ClusterRow.tsx';

interface Props {
  items: Cluster[];
  selected: Set<string>;
  expanded: Set<string>;
  /** Sekme/filtre/siralama kimligi: degisince kaydirma basa doner. */
  resetKey: string;
  onToggle: (key: string) => void;
  onExpand: (key: string) => void;
}

/**
 * Kume listesinin sanal hali.
 *
 * Tarama yuzlerce kume uretebilir; hepsini DOM'a basmak yerine yalnizca
 * gorunen satirlar cizilir. Satir yuksekligi olculur (genisletilen satir
 * buyur) ve `data-index` ile virtualizer'a bildirilir. Kaydirma konusu
 * liste kabi ayakta kaldigi icin kendiliginden korunur.
 */
export function VirtualClusterList({
  items,
  selected,
  expanded,
  resetKey,
  onToggle,
  onExpand,
}: Props) {
  const { t } = useI18n();
  const parentRef = useRef<HTMLDivElement | null>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 74,
    overscan: 8,
    getItemKey: (index) => items[index]?.key ?? index,
  });

  // Sekme/filtre/siralama degisti: eski kaydirma konusu anlamsiz.
  useEffect(() => {
    virtualizer.scrollToOffset(0);
  }, [resetKey, virtualizer]);

  return (
    <div className="vlist" ref={parentRef} role="list" aria-label={t('Kümeler')}>
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
                selectable={selectable}
                onToggle={() => onToggle(cluster.key)}
                onExpand={() => onExpand(cluster.key)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
