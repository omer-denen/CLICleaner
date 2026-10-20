import { useEffect, useMemo, useState } from 'react';
import type { FindingView, FindingsResponse } from '../../../src/web/contract.ts';
import { CATEGORY_LABEL } from '../../../src/core/categories.ts';
import { formatBytes } from '../../../src/util/format.ts';
import { useI18n } from '../i18n.tsx';
import { getFindings } from '../api.ts';
import { RISK_LABEL, shortPath } from '../labels.ts';

/**
 * Birlesik gorunum (T42 / D3 P5).
 *
 * Disk kumeleri ve CLI araclari TEK listede. Bu gorunum **salt okunur**:
 * planlar kaynak basina ayridir, birlesik bir uygulama YOKTUR (kullanici
 * karari: iki ayri yazili onay).
 */

interface Props {
  onFocus: (finding: FindingView | null) => void;
  focusedId: string | null;
}

export function FindingsView({ onFocus, focusedId }: Props) {
  const { t } = useI18n();
  const [data, setData] = useState<FindingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [only, setOnly] = useState<'all' | 'disk' | 'cli'>('all');

  useEffect(() => {
    let alive = true;
    void getFindings()
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, []);

  const rows = useMemo(() => {
    const all = data?.findings ?? [];
    if (only === 'all') return all;
    return all.filter((f) => f.source === only);
  }, [data, only]);

  const diskBytes = rows.filter((f) => f.source === 'disk').reduce((a, f) => a + f.bytes, 0);
  const cliBytes = rows.filter((f) => f.source === 'cli').reduce((a, f) => a + f.bytes, 0);

  return (
    <section className="findings" aria-label={t('Birleşik')}>
      <div className="findings-bar">
        <div className="strip-item">
          <span className="strip-label">{t('Disk')}</span>
          <span className="strip-value mono">{formatBytes(diskBytes)}</span>
          <span className="strip-sub dim">
            {t('{n} küme', { n: rows.filter((f) => f.source === 'disk').length })}
          </span>
        </div>
        <div className="strip-item">
          <span className="strip-label">{t("CLI'lar")}</span>
          <span className="strip-value mono">{formatBytes(cliBytes)}</span>
          <span className="strip-sub dim">
            {t('{n} araç', { n: rows.filter((f) => f.source === 'cli').length })}
          </span>
        </div>
        <div className="triage" role="group" aria-label={t('Kaynak')}>
          <button
            className={`chip chip-toggle${only === 'all' ? ' active' : ''}`}
            onClick={() => setOnly('all')}
          >
            {t('Tümü')}
          </button>
          <button
            className={`chip chip-toggle${only === 'disk' ? ' active' : ''}`}
            onClick={() => setOnly('disk')}
          >
            {t('Disk')}
          </button>
          <button
            className={`chip chip-toggle${only === 'cli' ? ' active' : ''}`}
            onClick={() => setOnly('cli')}
          >
            {t("CLI'lar")}
          </button>
        </div>
        <p className="dim small findings-note">
          {t('Bu liste salt okunur. Planlar ayrı: disk planı ve CLI kaldırma planı ayrı onayla uygulanır.')}
        </p>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="findings-table" role="table">
        <div className="findings-head" role="row">
          <span className="cell src">{t('Kaynak')}</span>
          <span className="cell title">{t('Başlık')}</span>
          <span className="cell cat">{t('Kategori')}</span>
          <span className="cell num idle">{t('Boşta')}</span>
          <span className="cell num size">{t('Boyut')}</span>
          <span className="cell risk">{t('Risk')}</span>
          <span className="cell verdict">{t('Karar')}</span>
        </div>

        {rows.map((f) => (
          <button
            key={f.id}
            className={`finding-line${focusedId === f.id ? ' is-cursor' : ''}`}
            role="row"
            onClick={() => onFocus(f)}
          >
            <span className={`cell src src-${f.source}`}>{f.source === 'disk' ? t('Disk') : t('CLI')}</span>
            <span className="cell title">
              <span className="finding-title">{f.title}</span>
              <span className="row-key">{shortPath(f.path)}</span>
            </span>
            <span className="cell cat">{t(CATEGORY_LABEL[f.category as keyof typeof CATEGORY_LABEL] ?? f.category)}</span>
            <span className="cell num idle mono">
              {f.idleDays === null ? '--' : `${f.idleDays}g`}
            </span>
            <span className="cell num size mono">{formatBytes(f.bytes)}</span>
            <span className="cell risk">
              <span className={`tag tag-risk-${f.risk}`}>{t(RISK_LABEL[f.risk])}</span>
            </span>
            <span className="cell verdict">
              <span className={`tag ${f.source === 'cli' ? '' : `tag-verdict-${f.verdict}`}`}>
                {t(f.verdict === 'report-only' ? 'Rapor' : f.verdict === 'keep' ? 'Korunuyor' : f.verdict === 'ask' ? 'Doğrulama' : f.verdict === 'recommend' ? 'Önerilen' : f.verdict === 'unused' ? 'Atıl' : f.verdict === 'recent' ? 'Yakında' : 'Bilinmiyor')}
              </span>
            </span>
          </button>
        ))}

        {rows.length === 0 && (
          <div className="empty">
            {t('Tarama veya CLI envanteri yok. Önce “İncele” ile tara.')}
          </div>
        )}
      </div>
    </section>
  );
}
