import type { Cluster } from '../../../src/core/types.ts';
import { formatBytes, formatCount } from '../../../src/util/format.ts';
import { useI18n } from '../i18n.tsx';
import { ageLabel, ARCHETYPE_LABEL, RISK_LABEL, shortPath } from '../labels.ts';

interface Props {
  cluster: Cluster;
  selected: boolean;
  expanded: boolean;
  selectable: boolean;
  onToggle: () => void;
  onExpand: () => void;
}

export function ClusterRow({ cluster, selected, expanded, selectable, onToggle, onExpand }: Props) {
  const { t, lang } = useI18n();
  const v = cluster.verdict;
  const targets = cluster.deleteTargets ?? [];
  const evidence = cluster.evidence;
  const dateLocale = lang === 'tr' ? 'tr-TR' : 'en-US';

  return (
    <div className={`cluster ${expanded ? 'is-expanded' : ''} ${selectable ? '' : 'is-locked'}`}>
      <div
        className="cluster-row"
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={onExpand}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onExpand();
          }
        }}
      >
        <label className="cell check" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selected}
            disabled={!selectable}
            onChange={onToggle}
            aria-label={
              selectable
                ? `${t('kümesini seç')}: ${cluster.title}`
                : `${t('seçilemez')}: ${cluster.title}`
            }
          />
        </label>

        <div className="cell title">
          <div className="title-line">
            <span className="cluster-title">{cluster.title}</span>
            {!selectable && <span className="tag tag-locked">{t('kilitli')}</span>}
          </div>
          <div className="subtitle">
            <span className={`tag tag-risk-${v.risk}`}>{t(RISK_LABEL[v.risk])}</span>
            <span className="tag">{t(ARCHETYPE_LABEL[cluster.archetype] ?? cluster.archetype)}</span>
            <span className="dim">{cluster.key}</span>
          </div>
        </div>

        <div
          className="cell num"
          title={t('silinebilir: {bytes}', { bytes: formatBytes(cluster.reclaimableBytes) })}
        >
          <span className="num-main">{formatBytes(cluster.reclaimableBytes)}</span>
          <span className="num-sub">/ {formatBytes(cluster.totalBytes)}</span>
        </div>

        <div
          className="cell num single"
          title={t('son hareket: {date}', {
            date: new Date(cluster.lastTouched).toLocaleString(dateLocale),
          })}
        >
          {ageLabel(cluster.lastTouched, lang)}
        </div>

        <div className="cell verdict">
          <span className={`tag tag-verdict-${v.kind}`}>
            {t(
              v.kind === 'recommend'
                ? 'Önerilen'
                : v.kind === 'ask'
                  ? 'Doğrulama'
                  : v.kind === 'report-only'
                    ? 'Rapor'
                    : 'Korunuyor',
            )}
          </span>
        </div>

        <div className="cell caret" aria-hidden="true">
          {expanded ? '▾' : '▸'}
        </div>
      </div>

      {expanded && (
        <div className="cluster-detail">
          <div className="detail-grid">
            <section>
              <h4>{t('Ne?')}</h4>
              <p>{v.what}</p>
              <h4>{t('Silersem ne olur?')}</h4>
              <p>{v.consequence}</p>
              {v.because.length > 0 && (
                <>
                  <h4>{t('Neden bu karar?')}</h4>
                  <ul className="because">
                    {v.because.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </>
              )}
              {v.preconditions.length > 0 && (
                <>
                  <h4>{t('Silmeden önce')}</h4>
                  <ul className="preconditions">
                    {v.preconditions.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </>
              )}
            </section>

            <section>
              <h4>{t('Kanıtlar')}</h4>
              <div className="chips">
                {(evidence.fileKinds ?? []).map((k) => (
                  <span className="chip" key={`k-${k}`}>
                    {k}
                  </span>
                ))}
                {(evidence.markers ?? []).map((m) => (
                  <span className="chip chip-marker" key={`m-${m}`}>
                    {m}
                  </span>
                ))}
                {evidence.owner && (
                  <span className="chip chip-owner">
                    {t('sahip:')} {ownerLabel(evidence.owner)}
                  </span>
                )}
              </div>
              {(evidence.logSignals ?? []).length > 0 && (
                <ul className="logs">
                  {(evidence.logSignals ?? []).map((l, i) => (
                    <li key={i}>
                      <span className="log-means">{l.means}</span>
                      <span className="log-line">{l.line}</span>
                    </li>
                  ))}
                </ul>
              )}

              {targets.length > 0 && (
                <>
                  <h4>{t('Silinecek yollar')}</h4>
                  <ul className="targets">
                    {targets.map((target, i) => (
                      <li key={i}>
                        <code>{shortPath(target.path)}</code>
                        <span className="dim">
                          {target.kind === 'older'
                            ? t('yalnızca {n}+ gün eski dosyalar', { n: target.minAgeDays ?? 0 })
                            : t('klasörün tamamı')}
                          {' · '}
                          {formatBytes(target.bytes)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {(cluster.subparts ?? []).length > 0 && (
                <>
                  <h4>{t('İç parçalar')}</h4>
                  <ul className="subparts">
                    {(cluster.subparts ?? []).map((s, i) => (
                      <li key={i}>
                        <strong>{s.label}</strong> — {formatBytes(s.bytes)}
                        <div className="dim">{s.reason}</div>
                        <code>{shortPath(s.path)}</code>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {cluster.parts.length > 1 && (
                <>
                  <h4>{t('Birleştirilen parçalar ({n})', { n: cluster.parts.length })}</h4>
                  <ul className="parts">
                    {cluster.parts.map((part, i) => (
                      <li key={i}>
                        <code>{shortPath(part.path)}</code>
                        <span className="dim">
                          {' '}
                          · {formatBytes(part.bytes)} ·{' '}
                          {t('{n} dosya', { n: formatCount(part.files) })}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

function ownerLabel(owner: NonNullable<Cluster['evidence']['owner']>): string {
  switch (owner.kind) {
    case 'packageJson':
      return owner.version ? `${owner.name}@${owner.version}` : owner.name;
    case 'manifest':
      return owner.app;
    case 'logFile':
      return owner.product;
    case 'binaryProduct':
      return owner.product;
    case 'directoryName':
      return owner.name;
  }
}
