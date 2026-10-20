import type { ScanResult } from '../../../src/core/types.ts';
import { ScanSummary } from '../../../src/core/scan-summary.ts';
import { formatBytes, formatCount } from '../../../src/util/format.ts';
import { useI18n } from '../i18n.tsx';

/**
 * Tek satır durum şeridi (T42 / D3 P1).
 *
 * Önceden dört büyük kart vardı; veri yoğunluğu için tek satıra
 * indirildi. Değerler mono, etiketler küçük ve büyük harfli.
 */

interface Props {
  scan: ScanResult;
  selectedBytes: number;
  selectedCount: number;
  targetCount: number;
  reclaimableSelectable: number;
  onSelectReclaimable: () => void;
  onClearSelection: () => void;
}

export function StatusStrip({
  scan,
  selectedBytes,
  selectedCount,
  targetCount,
  reclaimableSelectable,
  onSelectReclaimable,
  onClearSelection,
}: Props) {
  const { t } = useI18n();

  const summary = new ScanSummary(scan.clusters);
  const { totalBytes: total, reclaimableBytes: reclaim } = summary.totals();
  const counts = summary.verdictCounts();
  const rec = counts.recommend;
  const ask = counts.ask;
  const ro = counts['report-only'];
  const files = summary.fileCount();

  return (
    <section className="strip" aria-label={t('Özet')}>
      <div className="strip-item">
        <span className="strip-label">{t('Taranan')}</span>
        <span className="strip-value mono">{formatBytes(total)}</span>
        <span className="strip-sub dim">
          {t('{files} dosya · {clusters} küme', {
            files: formatCount(files),
            clusters: scan.clusters.length,
          })}
        </span>
      </div>

      <div className="strip-item">
        <span className="strip-label">{t('Silinebilir')}</span>
        <span className="strip-value mono green">{formatBytes(reclaim)}</span>
        <span className="strip-sub dim">{t('yeniden üretilebilir veya kullanılamaz')}</span>
      </div>

      <div className="strip-item">
        <span className="strip-label">{t('Seçili')}</span>
        <span className="strip-value mono">{formatBytes(selectedBytes)}</span>
        <span className="strip-sub dim">
          {t('{clusters} küme · {targets} hedef', {
            clusters: selectedCount,
            targets: targetCount,
          })}
        </span>
      </div>

      <div className="strip-item">
        <span className="strip-label">{t('Kararlar')}</span>
        <span className="strip-value mono">{summary.actionableCount()}</span>
        <span className="strip-sub dim">
          {t('{rec} önerilen · {ask} doğrulama · {ro} rapor', { rec, ask, ro })}
        </span>
      </div>

      <div className="strip-actions">
        <button
          type="button"
          className="btn small strip-action"
          onClick={onSelectReclaimable}
          disabled={reclaimableSelectable === 0}
          title={t('Silinebilir kümelerin tümünü seç')}
        >
          {t('Seç ({n})', { n: reclaimableSelectable })}
        </button>
        <button
          type="button"
          className="btn small strip-action"
          onClick={onClearSelection}
          disabled={selectedCount === 0}
          title={t('Seçimi temizle')}
        >
          {t('Seçilenleri temizle')}
        </button>
      </div>
    </section>
  );
}
