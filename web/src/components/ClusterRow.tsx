import type { Cluster } from '../../../src/core/types.ts';
import { formatBytes, formatCount } from '../../../src/util/format.ts';
import { useI18n } from '../i18n.tsx';
import {
  ageLabel,
  ARCHETYPE_LABEL,
  CATEGORY_LABEL,
  CONFIDENCE_LABEL,
  REGEN_LABEL,
  RISK_LABEL,
  RISK_SHORT,
  shortKey,
  shortPath,
  VERDICT_SHORT,
} from '../labels.ts';
import { categoryOf } from '../../../src/core/categories.ts';

/**
 * Yoğun ızgara satırı (T42 / D3 P1).
 *
 * Satır 32px (rahat mod 40px): yol/başlık, kategori, son hareket, boyut,
 * risk ve karar TEK satırda. Etiketler (mimari tip, yeniden üretilebilirlik,
 * güven, git) satırın ipucunda (title) ve genişletilmiş detayda yaşar.
 */

interface Props {
  cluster: Cluster;
  selected: boolean;
  expanded: boolean;
  focused: boolean;
  selectable: boolean;
  onToggle: () => void;
  onExpand: () => void;
  onFocus: () => void;
}

export function ClusterRow({
  cluster,
  selected,
  expanded,
  focused,
  selectable,
  onToggle,
  onExpand,
  onFocus,
}: Props) {
  const { t, lang } = useI18n();
  const v = cluster.verdict;
  const targets = cluster.deleteTargets ?? [];
  const evidence = cluster.evidence;
  const dateLocale = lang === 'tr' ? 'tr-TR' : 'en-US';
  const category = categoryOf(cluster);

  const hint = [
    t(ARCHETYPE_LABEL[cluster.archetype] ?? cluster.archetype),
    v.regenerability ? t(REGEN_LABEL[v.regenerability] ?? v.regenerability) : null,
    v.confidence ? t(CONFIDENCE_LABEL[v.confidence] ?? '') : null,
    evidence.markers?.includes('git-tracked') ? 'git' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      className={`cluster ${expanded ? 'is-expanded' : ''} ${selectable ? '' : 'is-locked'} ${
        focused ? 'is-focused' : ''
      } ${selected ? 'is-selected' : ''}`}
    >
      <div
        className="cluster-row"
        role="button"
        tabIndex={-1}
        aria-expanded={expanded}
        title={hint}
        onClick={() => {
          onFocus();
          onExpand();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onFocus();
            onExpand();
          }
        }}
      >
        <div className="cell check" onClick={(e) => e.stopPropagation()}>
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
        </div>

        <div className="cell title">
          {focused && (
            <span className="row-prompt" aria-hidden="true">
              &gt;
            </span>
          )}
          <span className="cluster-title">{cluster.title}</span>
          <span className="row-key">{shortKey(cluster.key)}</span>
          {!selectable && <span className="tag tag-locked">{t('kilitli')}</span>}
          {evidence.markers?.includes('git-tracked') && (
            <span className="tag tag-git" title={t('Git tarafından takip edilen yollar atlandı')}>
              git
            </span>
          )}
        </div>

        <div className="cell cat">{t(CATEGORY_LABEL[category] ?? category)}</div>

        <div
          className="cell num age"
          title={t('son hareket: {date}', {
            date: new Date(cluster.lastTouched).toLocaleString(dateLocale),
          })}
        >
          {ageLabel(cluster.lastTouched, lang)}
        </div>

        <div
          className="cell num size"
          title={t('silinebilir: {bytes}', { bytes: formatBytes(cluster.reclaimableBytes) })}
        >
          <span className="num-main">{formatBytes(cluster.reclaimableBytes)}</span>
        </div>

        <div className="cell risk" title={t(RISK_LABEL[v.risk])}>
          <span className={`tag tag-risk-${v.risk}`}>{t(RISK_SHORT[v.risk])}</span>
        </div>

        <div className="cell verdict">
          <span className={`tag tag-verdict-${v.kind}`}>{t(VERDICT_SHORT[v.kind] ?? v.kind)}</span>
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
