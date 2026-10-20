import { useMemo, useState } from 'react';
import type { PlanResponse, RiskLevel } from '../../../src/web/contract.ts';
import { formatBytes } from '../../../src/util/format.ts';
import { useI18n } from '../i18n.tsx';
import { RISK_LABEL, shortPath } from '../labels.ts';

interface Props {
  plan: PlanResponse;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (phrase: string, acknowledgeHigh: boolean) => void;
}

const RISK_ORDER: RiskLevel[] = ['high', 'medium', 'low', 'safe'];

/**
 * Silme onayi — sadeleştirilmiş "Planla ve Uygula" görünümü.
 *
 * - Kümeler risk gruplarına ayrılır (yüksek → güvenli).
 * - Hedef yolları varsayılan olarak KAPALIDIR; "Yolları göster" ile açılır.
 * - Özet (küme / hedef / boyut) üstte sabittir.
 * - Onay kuralları değişmez: orta/yüksek risk -> "SIL", yüksek -> ack.
 */
export function ConfirmDialog({ plan, busy, onCancel, onConfirm }: Props) {
  const { t } = useI18n();
  const [phrase, setPhrase] = useState('');
  const [ack, setAck] = useState(false);
  const [openPaths, setOpenPaths] = useState<Set<string>>(new Set());

  const view = plan.plan;
  const mediumOrHigh = view.clusters.filter((c) => c.risk === 'medium' || c.risk === 'high');
  const high = view.clusters.filter((c) => c.risk === 'high');
  const phraseOk = !plan.requiresPhrase || phrase.trim() === 'SIL';
  const ackOk = !plan.requiresHighAck || ack;
  const canConfirm = phraseOk && ackOk && !busy;

  const groups = useMemo(
    () =>
      RISK_ORDER.map((risk) => ({
        risk,
        clusters: view.clusters.filter((c) => c.risk === risk),
      })).filter((g) => g.clusters.length > 0),
    [view.clusters],
  );

  const toggle = (key: string) => {
    setOpenPaths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={t('Silme onayı')}>
      <div className="modal modal-plan">
        <header className="modal-head">
          <h2>{t('Planı gözden geçir')}</h2>
          <span className={`tag ${view.mode === 'purge' ? 'tag-danger' : 'tag-recycle'}`}>
            {view.mode === 'purge' ? t('KALICI SİLME') : t('Kasa (geri alınabilir)')}
          </span>
        </header>

        <div className="plan-summary">
          <div>
            <strong>{formatBytes(view.totalBytes)}</strong>
            <span className="dim"> {t('toplam')}</span>
          </div>
          <div className="dim small">
            {t('{clusters} küme · {targets} hedef', {
              clusters: view.clusters.length,
              targets: view.targets.length,
            })}
          </div>
        </div>

        {view.mode === 'purge' ? (
          <div className="alert alert-danger">
            {t('Kalıcı silme geri alınamaz. Emin değilsen “Kasa” modunu kullan.')}
          </div>
        ) : (
          <div className="alert alert-info">
            {t('Dosyalar aracın kendi kasasına taşınır; yanlış karar verirsen geri alabilirsin.')}
          </div>
        )}

        <div className="plan-groups">
          {groups.map((g) => {
            const groupBytes = g.clusters.reduce(
              (sum, c) => sum + c.targets.reduce((a, pt) => a + pt.bytes, 0),
              0,
            );
            return (
              <section className={`plan-group plan-group-${g.risk}`} key={g.risk}>
                <header className="plan-group-head">
                  <span className={`tag tag-risk-${g.risk}`}>{t(RISK_LABEL[g.risk])}</span>
                  <span className="dim small">
                    {t('{n} küme', { n: g.clusters.length })} · {formatBytes(groupBytes)}
                  </span>
                </header>

                {g.clusters.map((c, i) => {
                  const key = `${g.risk}-${i}`;
                  const open = openPaths.has(key);
                  const bytes = c.targets.reduce((a, pt) => a + pt.bytes, 0);
                  return (
                    <div className="plan-row" key={key}>
                      <div className="plan-row-main">
                        <strong>{c.title}</strong>
                        <span className="dim small">
                          {formatBytes(bytes)} · {t('{n} hedef', { n: c.targets.length })}
                        </span>
                        <button
                          type="button"
                          className="btn small ghost"
                          aria-expanded={open}
                          onClick={() => toggle(key)}
                        >
                          {open
                            ? t('Yolları gizle')
                            : t('Yolları göster ({n})', { n: c.targets.length })}
                        </button>
                      </div>
                      <div className="dim plan-reason">{c.reason}</div>
                      {open && (
                        <ul className="plan-paths">
                          {c.targets.map((pt, j) => (
                            <li key={j}>
                              <code>{shortPath(pt.target.path)}</code>
                              <span className="dim">
                                {' '}
                                ·{' '}
                                {pt.target.kind === 'older'
                                  ? t('yalnızca {n}+ gün eski dosyalar', {
                                      n: pt.target.minAgeDays ?? 0,
                                    })
                                  : t('klasörün tamamı')}{' '}
                                · {formatBytes(pt.bytes)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>

        {mediumOrHigh.length > 0 && (
          <div className="alert alert-warn">
            {t('{n} küme orta veya yüksek riskli. Silmenin sonucunu yukarıda okudun mu?', {
              n: mediumOrHigh.length,
            })}
          </div>
        )}

        {plan.requiresHighAck && (
          <label className="ack">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
              disabled={busy}
            />
            <span>
              {t('{n} yüksek riskli kümenin ne kaybettireceğini okudum ve yine de silmek istiyorum.', {
                n: high.length,
              })}
            </span>
          </label>
        )}

        {plan.requiresPhrase && (
          <label className="phrase">
            <span>{t('Onaylamak için {phrase} yaz:', { phrase: 'SIL' })}</span>
            <input
              type="text"
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              placeholder="SIL"
              disabled={busy}
              autoFocus
            />
          </label>
        )}

        <footer className="modal-actions">
          <button className="btn" onClick={onCancel} disabled={busy}>
            {t('Vazgeç')}
          </button>
          <button
            className={`btn ${view.mode === 'purge' ? 'btn-danger' : 'btn-primary'}`}
            disabled={!canConfirm}
            onClick={() => onConfirm(phrase.trim(), ack)}
          >
            {busy ? t('Başlatılıyor…') : view.mode === 'purge' ? t('Kalıcı olarak sil') : t('Temizle')}
          </button>
        </footer>
      </div>
    </div>
  );
}
