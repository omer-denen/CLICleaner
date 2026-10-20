import type { FindingView } from '../../../src/core/contract.ts';
import { formatBytes } from '../../../src/util/format.ts';
import { useI18n } from '../i18n.tsx';
import { RISK_LABEL, shortPath } from '../labels.ts';

/**
 * Birlesik gorunumde CLI bulgusunun sag paneli (T42 / D3 P5).
 *
 * SALT OKUNUR: kaldirma plani CLI sekmesinde ayrica onayla uretilir.
 * Burada yalnizca "ne bulduk" bilgisi ve kaldirma komutu gosterilir.
 */

export function CliFindingPanel({ finding }: { finding: FindingView }) {
  const { t } = useI18n();

  return (
    <aside className="ctx" aria-label={t('Bağlam')}>
      <header className="ctx-head">
        <div className="ctx-title">
          <h2>{finding.title}</h2>
          <span className="mono dim">{finding.ref ?? finding.id}</span>
        </div>
        <div className="ctx-tags">
          <span className={`tag tag-risk-${finding.risk}`}>{t(RISK_LABEL[finding.risk])}</span>
          <span className="tag">{t('CLI')}</span>
        </div>
      </header>

      <section className="ctx-block">
        <h3>{t('Ne?')}</h3>
        <p>{finding.reason}</p>
        <ul className="ctx-list">
          <li>{t('Boyut: {bytes}', { bytes: formatBytes(finding.bytes) })}</li>
          <li>
            {finding.idleDays === null
              ? t('Kullanım bilgisi yok')
              : t('{n} gündür kullanılmadı', { n: finding.idleDays })}
          </li>
          <li>{t('Kurulum yolu: {path}', { path: shortPath(finding.path) })}</li>
        </ul>
      </section>

      {finding.evidence.length > 0 && (
        <section className="ctx-block">
          <h3>{t('Kanıtlar')}</h3>
          <div className="chips">
            {finding.evidence.map((e, i) => (
              <span className="chip" key={i}>
                {e}
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="ctx-block">
        <h3>{t('Kaldırma')}</h3>
        <p className="dim small">
          {t(
            'CLI kaldırma planı kendi sekmesinde üretilir ve ayrı yazılı onay ister. Buradan kaldırma yapılmaz.',
          )}
        </p>
      </section>
    </aside>
  );
}
