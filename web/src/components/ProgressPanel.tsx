import { formatBytes } from '../../../src/util/format.ts';
import type { Cluster } from '../../../src/core/types.ts';
import { useI18n } from '../i18n.tsx';
import { ARCHETYPE_LABEL, VERDICT_LABEL, shortPath } from '../labels.ts';

interface ScanProgressProps {
  kind: 'scan';
  done: number;
  total: number;
  bytes: number;
  /** Taranacak tum dizinler (sol sutun). */
  paths?: string[];
  /** Simdiye kadar bulunanlar; hedef yolu da tasinir (sag sutun). */
  found?: Array<{ path: string; cluster: Cluster }>;
  /** O an taranan dizinler. */
  active?: string[];
  /** Biten dizinler (bulunan veya atlanan). */
  finished?: string[];
  onCancel?: () => void;
}

interface DeleteProgressProps {
  kind: 'delete';
  index: number;
  total: number;
  label: string;
  path: string;
  freed: number;
  skipped: number;
  failed: number;
  elapsedMs: number;
}

type Props = ScanProgressProps | DeleteProgressProps;

export function ProgressPanel(props: Props) {
  const { t } = useI18n();

  if (props.kind === 'scan') {
    const pct = props.total > 0 ? Math.round((props.done / props.total) * 100) : 0;
    const paths = props.paths ?? [];
    const found = props.found ?? [];
    const active = props.active ?? [];
    const finished = props.finished ?? [];
    const activeSet = new Set(active);
    const finishedSet = new Set(finished);
    const foundPaths = new Set(found.map((f) => f.path));
    const sortedFound = [...found].sort(
      (a, b) => b.cluster.reclaimableBytes - a.cluster.reclaimableBytes,
    );
    const listed = paths.length > 0 ? paths : active;
    const completed = listed.filter((p) => finishedSet.has(p)).length;

    return (
      <div className="overlay" role="status" aria-live="polite">
        <div className="overlay-card scan-card">
          <div className="scan-head">
            <div>
              <h3>{t('Dizinler taranıyor…')}</h3>
              <p className="dim">
                {t('{done}/{total} dizin · {bytes} ölçüldü', {
                  done: props.done,
                  total: props.total || '?',
                  bytes: formatBytes(props.bytes),
                })}
              </p>
            </div>
            <strong className="scan-pct">%{pct}</strong>
          </div>
          <div className="progress">
            <div className="progress-fill" style={{ width: `${props.total ? pct : 8}%` }} />
          </div>

          <div className="scan-grid">
            <section className="scan-col">
              <div className="scan-col-head">
                <strong>{t('Taranacak dizinler')}</strong>
                <span className="dim small">
                  {completed}/{listed.length}
                </span>
              </div>
              <div className="scan-targets" role="list">
                {listed.length === 0 && (
                  <p className="dim small">{t('Dizin listesi hazırlanıyor…')}</p>
                )}
                {listed.map((p) => {
                  const state = foundPaths.has(p)
                    ? 'found'
                    : activeSet.has(p)
                      ? 'active'
                      : finishedSet.has(p)
                        ? 'done'
                        : 'pending';
                  const mark =
                    state === 'found' ? '✓' : state === 'active' ? '●' : state === 'done' ? '·' : '○';
                  return (
                    <div className={`scan-target scan-target-${state}`} key={p} role="listitem" title={p}>
                      <span className="scan-target-mark" aria-hidden="true">
                        {mark}
                      </span>
                      <code>{shortPath(p)}</code>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="scan-col">
              <div className="scan-col-head">
                <strong>{t('Bulunanlar')}</strong>
                <span className="dim small">{found.length}</span>
              </div>
              <p className="dim small scan-merge-note">
                {t('Aynı uygulamanın parçaları tarama sonunda birleştirilir.')}
              </p>
              <div className="live-scan-list scan-found" role="list">
                {sortedFound.length === 0 && (
                  <p className="dim small">
                    {t('Henüz bulunan yok; dizinler tarandıkça burada listelenir.')}
                  </p>
                )}
                {sortedFound.map(({ path, cluster: c }) => (
                  <div
                    className="live-scan-row"
                    key={path}
                    role="listitem"
                    title={path}
                  >
                    <span className="live-scan-title">{c.title}</span>
                    <span className="dim small">
                      {t(ARCHETYPE_LABEL[c.archetype] ?? 'Tanımlanamayan')}
                    </span>
                    <span className={`tag tag-verdict-${c.verdict.kind}`}>
                      {t(VERDICT_LABEL[c.verdict.kind] ?? c.verdict.kind)}
                    </span>
                    <span className="live-scan-size">{formatBytes(c.reclaimableBytes)}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <p className="dim small">
            {t('Tarama süresi cihazınızın hızına bağlıdır; ilk tarama daha uzun sürebilir.')}
          </p>
          {props.onCancel && (
            <div className="overlay-actions">
              <button className="btn" onClick={props.onCancel}>
                {t('Taramayı iptal et')}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const pct = props.total > 0 ? Math.round((props.index / props.total) * 100) : 0;
  return (
    <div className="overlay" role="status" aria-live="polite">
      <div className="overlay-card wide">
        <h3>{t('Temizleniyor…')}</h3>
        <div className="progress">
          <div className="progress-fill danger" style={{ width: `${props.total ? pct : 8}%` }} />
        </div>
        <p className="dim">
          {t('{index}/{total} hedef · %{pct} · {bytes} boşaltıldı', {
            index: props.index,
            total: props.total,
            pct,
            bytes: formatBytes(props.freed),
          })}
        </p>
        <div className="current-target">
          <strong>{props.label}</strong>
          <code>{props.path}</code>
          {props.elapsedMs > 6000 && (
            <span className="dim small">
              {' '}
              {t('· bu hedef {n} saniyedir işleniyor', {
                n: Math.round(props.elapsedMs / 1000),
              })}
            </span>
          )}
        </div>
        {(props.skipped > 0 || props.failed > 0) && (
          <p className="dim small">
            {props.skipped > 0 && t('{n} atlandı', { n: props.skipped })}
            {props.skipped > 0 && props.failed > 0 && ' · '}
            {props.failed > 0 && t('{n} hata', { n: props.failed })}
          </p>
        )}
        <p className="dim small">
          {t('Büyük klasörlerde bu işlem dakikalar sürebilir; pencereyi kapatma.')}
        </p>
      </div>
    </div>
  );
}
