import { useEffect, useRef, useState } from 'react';
import type { PlanResponse } from '../../../src/core/contract.ts';
import { ApprovalRules } from '../../../src/core/approval.ts';
import { PlanSummary } from '../../../src/core/plan-summary.ts';
import { formatBytes } from '../../../src/util/format.ts';
import { useI18n } from '../i18n.tsx';

/**
 * Onay duvarı (T42 / D3 P3) — sağ sütun, plan varken.
 *
 * Burada "ne kaybedeceğim" sorusu cevaplanır ve iki aşamalı onay yapılır:
 *   - orta/yüksek risk için yazılı ifade ("SIL")
 *   - yüksek risk için ayrıca okuma onayı
 *
 * Panel HİÇBİR şeyi kendisi silmez; yalnızca onay toplar ve uygulamayı
 * başlatır.
 */

interface Props {
  plan: PlanResponse;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (phrase: string, acknowledgeHigh: boolean) => void;
  /** Plan açıldığında ifade alanına odaklan (klavye "Enter"). */
  focusSignal?: number;
}

export function ApprovalWall({ plan, busy, onCancel, onConfirm, focusSignal }: Props) {
  const { t } = useI18n();
  const [phrase, setPhrase] = useState('');
  const [ack, setAck] = useState(false);
  const phraseRef = useRef<HTMLInputElement | null>(null);

  const view = plan.plan;
  const summary = new PlanSummary(view.clusters);
  const { mediumOrHigh, high } = summary.riskCounts();
  const phraseOk = !plan.requiresPhrase || ApprovalRules.matches('delete', phrase);
  const ackOk = !plan.requiresHighAck || ack;
  const canConfirm = phraseOk && ackOk && !busy;

  useEffect(() => {
    if (plan.requiresPhrase) phraseRef.current?.focus();
  }, [focusSignal, plan.requiresPhrase]);

  const byKind = summary.targetCounts(view.targets);

  return (
    <aside className="ctx ctx-approval" aria-label={t('Onay')}>
      <header className="ctx-head">
        <div className="ctx-title">
          <h2>{t('Onay duvarı')}</h2>
          <span className="dim small">{t('Uygulamadan önce son kez kontrol et')}</span>
        </div>
      </header>

      <section className="ctx-block">
        <h3>{t('Ne kaybedeceğim?')}</h3>
        <ul className="ctx-list">
          <li>
            {t('{clusters} küme · {targets} hedef · {bytes}', {
              clusters: view.clusters.length,
              targets: view.targets.length,
              bytes: formatBytes(view.totalBytes),
            })}
          </li>
          <li>
            {t('{n} klasorun tamami, {m} yasli dosya kumesi', {
              n: byKind.whole,
              m: byKind.older,
            })}
          </li>
          {view.mode === 'purge' ? (
            <li>{t('Kalıcı silme geri alınamaz.')}</li>
          ) : (
            <li>{t('Dosyalar aracın kendi kasasına taşınır; geri alınabilir.')}</li>
          )}
        </ul>
      </section>

      {mediumOrHigh > 0 && (
        <section className="ctx-block">
          <h3>{t('Risk')}</h3>
          <ul className="ctx-list">
            <li>
              {t('{n} küme orta veya yüksek riskli.', { n: mediumOrHigh })}
            </li>
            {high > 0 && (
              <li>
                {t('{n} küme yüksek riskli.', { n: high })}
              </li>
            )}
          </ul>
        </section>
      )}

      {plan.requiresHighAck && (
        <section className="ctx-block">
          <label className="ack">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
              disabled={busy}
            />
            <span>
              {t('{n} yüksek riskli kümenin ne kaybettireceğini okudum ve yine de silmek istiyorum.', {
                n: high,
              })}
            </span>
          </label>
        </section>
      )}

      {plan.requiresPhrase && (
        <section className="ctx-block">
          <h3>
            {t('Onaylamak için {phrase} yaz:', { phrase: ApprovalRules.phrase('delete') })}
          </h3>
          <label className="phrase">
            <input
              ref={phraseRef}
              type="text"
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              placeholder={ApprovalRules.phrase('delete')}
              disabled={busy}
            />
          </label>
        </section>
      )}

      <section className="ctx-block">
        <button
          className={`btn ${view.mode === 'purge' ? 'btn-danger' : 'btn-primary'} ctx-apply`}
          disabled={!canConfirm}
          onClick={() => onConfirm(phrase.trim(), ack)}
        >
          {busy ? t('Başlatılıyor…') : view.mode === 'purge' ? t('Kalıcı olarak sil') : t('Temizle')}
        </button>
        <button className="btn ctx-cancel" onClick={onCancel} disabled={busy}>
          {t('Vazgeç')}
        </button>
        <p className="dim small">
          {t('Vazgeçmek hiçbir şeyi silmez; yalnızca planı kapatır.')}
        </p>
      </section>
    </aside>
  );
}
