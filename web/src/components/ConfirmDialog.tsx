import { useState } from 'react';
import type { PlanResponse } from '../../../src/web/contract.ts';
import { formatBytes } from '../../../src/util/format.ts';
import { useI18n } from '../i18n.tsx';
import { RISK_LABEL, shortPath } from '../labels.ts';

interface Props {
  plan: PlanResponse;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (phrase: string, acknowledgeHigh: boolean) => void;
}

/**
 * Silme onayi.
 *
 * Kurallar sunucudakiyle ayni:
 *  - orta/yuksek risk -> "SIL" yazili onay
 *  - yuksek risk      -> ayrica acik isaretleme
 * Onay metni istemcide de dogrulanir; sunucu yine de dogrular.
 */
export function ConfirmDialog({ plan, busy, onCancel, onConfirm }: Props) {
  const { t } = useI18n();
  const [phrase, setPhrase] = useState('');
  const [ack, setAck] = useState(false);

  const view = plan.plan;
  const mediumOrHigh = view.clusters.filter((c) => c.risk === 'medium' || c.risk === 'high');
  const high = view.clusters.filter((c) => c.risk === 'high');
  const phraseOk = !plan.requiresPhrase || phrase.trim() === 'SIL';
  const ackOk = !plan.requiresHighAck || ack;
  const canConfirm = phraseOk && ackOk && !busy;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={t('Silme onayı')}>
      <div className="modal">
        <header className="modal-head">
          <h2>{t('Silme onayı')}</h2>
          <span className={`tag ${view.mode === 'purge' ? 'tag-danger' : 'tag-recycle'}`}>
            {view.mode === 'purge' ? t('KALICI SİLME') : t('Geri dönüşüm kutusu')}
          </span>
        </header>

        <p className="modal-lead">
          {t('{clusters} küme, {targets} hedef, toplam {bytes}.', {
            clusters: view.clusters.length,
            targets: view.targets.length,
            bytes: formatBytes(view.totalBytes),
          })}
        </p>

        {view.mode === 'purge' ? (
          <div className="alert alert-danger">
            {t('Kalıcı silme geri alınamaz. Emin değilsen “Geri dönüşüm kutusu” modunu kullan.')}
          </div>
        ) : (
          <div className="alert alert-info">
            {t('Dosyalar geri dönüşüm kutusuna taşınır; yanlış karar verirsen geri alabilirsin.')}
          </div>
        )}

        <div className="modal-list">
          {view.clusters.map((c, i) => (
            <div className="plan-cluster" key={`${c.title}-${i}`}>
              <div className="plan-head">
                <span className={`tag tag-risk-${c.risk}`}>{t(RISK_LABEL[c.risk])}</span>
                <strong>{c.title}</strong>
              </div>
              <div className="dim plan-reason">{c.reason}</div>
              <ul>
                {c.targets.map((pt, j) => (
                  <li key={j}>
                    <code>{shortPath(pt.target.path)}</code>
                    <span className="dim">
                      {' '}
                      ·{' '}
                      {pt.target.kind === 'older'
                        ? t('yalnızca {n}+ gün eski dosyalar', { n: pt.target.minAgeDays ?? 0 })
                        : t('klasörün tamamı')}{' '}
                      · {formatBytes(pt.bytes)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
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
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} disabled={busy} />
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
