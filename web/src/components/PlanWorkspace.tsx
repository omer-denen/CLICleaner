import { useEffect, useMemo, useState } from 'react';
import type { PlanResponse } from '../../../src/core/contract.ts';
import { PlanClock } from '../../../src/core/plan-clock.ts';
import { ScanSummary } from '../../../src/core/scan-summary.ts';
import { PlanSummary } from '../../../src/core/plan-summary.ts';
import { formatBytes } from '../../../src/util/format.ts';
import { useI18n } from '../i18n.tsx';
import { RISK_LABEL, shortPath } from '../labels.ts';

/**
 * Plan çalışma alanı (T42 / D3 P3).
 *
 * Plan bir MODAL değil, kalıcı bir çalışma alanıdır: "Bul → Plan → Onay →
 * Uygula" akışının ikinci adımı. Tasarım, bu tür uygulamaların (ör. disk
 * temizleyiciler) onay adımındaki düzenini izler:
 *
 *   - Seçim yapılan listeyle AYNI dil (yoğun tablo, 32px satır).
 *   - Özet yapışkan ve tek satır (listenin üstünü yemez).
 *   - Onay penceresinde bile seçimden çıkarılabilir.
 *   - Hedef yolları satırın altında açılır.
 *
 * Klavye:
 *   ↑/↓   satır arası
 *   Space  yolları aç/kapat
 *   X     satırı plandan çıkar
 *   Enter  onay duvarına geç
 *   Esc    planı bırak (HİÇBİR ŞEY SİLİNMEZ)
 */

interface Props {
  plan: PlanResponse;
  /** Seçili ama plana girmeyen küme sayısı (korunacaklar). */
  protectedCount: number;
  busy: boolean;
  onCancel: () => void;
  onApprove: () => void;
  onDeselect: (key: string) => void;
}

export function PlanWorkspace({
  plan,
  protectedCount,
  busy,
  onCancel,
  onApprove,
  onDeselect,
}: Props) {
  const { t } = useI18n();
  const [openPaths, setOpenPaths] = useState<Set<string>>(new Set());
  const [rowIndex, setRowIndex] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const view = plan.plan;

  // Plan TTL geri sayimi.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const groups = useMemo(() => ScanSummary.groupByRisk(view.clusters, (c) => c.risk), [view.clusters]);

  const planSummary = useMemo(() => new PlanSummary(view.clusters), [view.clusters]);

  const flatRows = useMemo(() => groups.flatMap((g) => g.clusters), [groups]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (typing) return;
      if (flatRows.length === 0) return;

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          setRowIndex((i) => Math.min(flatRows.length - 1, i + 1));
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          setRowIndex((i) => Math.max(0, i - 1));
          break;
        }
        case ' ': {
          e.preventDefault();
          const key = flatRows[rowIndex]?.key;
          if (!key) return;
          setOpenPaths((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
          });
          break;
        }
        case 'x':
        case 'X': {
          const key = flatRows[rowIndex]?.key;
          if (!key) return;
          e.preventDefault();
          onDeselect(key);
          break;
        }
        case 'Enter': {
          e.preventDefault();
          onApprove();
          break;
        }
        case 'Escape': {
          e.preventDefault();
          onCancel();
          break;
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flatRows, rowIndex, onApprove, onCancel, onDeselect]);

  const clock = useMemo(() => new PlanClock(plan.expiresAt), [plan.expiresAt]);
  const { expired, mm, ss } = clock.state(now);

  const togglePaths = (key: string) => {
    setOpenPaths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <section className="plan-space" aria-label={t('Plan')}>
      {/* Yapışkan üst şerit: özet + akış + eylem */}
      <header className="plan-bar">
        <div className="plan-bar-main">
          <span className="strip-label">{t('Kaldırılacak')}</span>
          <strong className="plan-bar-total mono">{formatBytes(view.totalBytes)}</strong>
          <span className="dim small">
            {t('{clusters} küme · {targets} hedef', {
              clusters: view.clusters.length,
              targets: view.targets.length,
            })}
          </span>
          <span className={`tag ${view.mode === 'purge' ? 'tag-danger' : 'tag-recycle'}`}>
            {view.mode === 'purge' ? t('KALICI SİLME') : t('Kasa (geri alınabilir)')}
          </span>
          <span className={`tag ${expired ? 'tag-danger' : ''}`}>
            {expired
              ? t('Plan süresi doldu')
              : t('Süre: {mm}:{ss}', { mm, ss })}
          </span>
        </div>

        <nav className="stepper" aria-label={t('Akış')}>
          <span className="step done">{t('Bul')}</span>
          <span className="step-arrow" aria-hidden="true">
            ›
          </span>
          <span className="step active">{t('Plan')}</span>
          <span className="step-arrow" aria-hidden="true">
            ›
          </span>
          <span className="step">{t('Onay')}</span>
          <span className="step-arrow" aria-hidden="true">
            ›
          </span>
          <span className="step">{t('Uygula')}</span>
        </nav>

        <div className="plan-bar-actions">
          <button className="btn" onClick={onCancel} disabled={busy}>
            {t('Vazgeç')}
          </button>
          <button className="btn btn-primary" onClick={onApprove} disabled={expired || busy}>
            {t('Onaya geç')}
          </button>
        </div>
      </header>

      {protectedCount > 0 && (
        <div className="plan-protected">
          {t('{n} küme plana girmiyor (korunuyor).', { n: protectedCount })}
        </div>
      )}

      {/*
        Mod bilgisi ust seritte rozet olarak var; tekrar eden uyari bandi
        listeyi asagi itiyordu. Gercek etki aciklamasi onay duvarinda.
      */}

      {/* Yoğun tablo: tarama ızgarasıyla aynı dil */}
      <div className="plan-table" role="table" aria-label={t('Plan')}>
        <div className="plan-table-head" role="row">
          <span className="cell check" aria-hidden="true" />
          <span className="cell title">{t('Küme / gerekçe')}</span>
          <span className="cell risk">{t('Risk')}</span>
          <span className="cell num targets">{t('Hedef')}</span>
          <span className="cell num size">{t('Boyut')}</span>
          <span className="cell effect">{t('Etki')}</span>
        </div>

        {groups.map((g) => {
          const groupBytes = planSummary.clusterBytes(g.clusters);
          return (
            <section className={`plan-group plan-group-${g.risk}`} key={g.risk}>
              <header className="plan-group-head">
                <span className={`tag tag-risk-${g.risk}`}>{t(RISK_LABEL[g.risk])}</span>
                <span className="dim small">
                  {t('{n} küme', { n: g.clusters.length })} · {formatBytes(groupBytes)}
                </span>
              </header>

              {g.clusters.map((c) => {
                const index = flatRows.indexOf(c);
                const open = openPaths.has(c.key);
                const bytes = planSummary.clusterBytes([c]);
                const { whole, older } = planSummary.targetCounts(c.targets);
                return (
                  <div
                    className={`plan-line${index === rowIndex ? ' is-cursor' : ''}`}
                    key={c.key}
                    role="row"
                    onClick={() => setRowIndex(index)}
                  >
                    <div className="cell check" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked
                        onChange={() => onDeselect(c.key)}
                        disabled={busy}
                        aria-label={t('{title} kümesini plandan çıkar', { title: c.title })}
                      />
                    </div>

                    <div className="cell title">
                      <span className="row-prompt" aria-hidden="true">
                        {index === rowIndex ? '>' : ' '}
                      </span>
                      <strong className="plan-line-title">{c.title}</strong>
                      <span className="plan-line-reason">{c.reason}</span>
                    </div>

                    <div className="cell risk">
                      <span className={`tag tag-risk-${c.risk}`}>{t(RISK_LABEL[c.risk])}</span>
                    </div>

                    <div className="cell num targets mono">{c.targets.length}</div>

                    <div className="cell num size mono">{formatBytes(bytes)}</div>

                    <div className="cell effect">
                      {whole > 0 && <span className="tag tag-danger">tamamı</span>}
                      {older > 0 && <span className="tag">{older}+ gün</span>}
                    </div>

                    <button
                      type="button"
                      className="btn small ghost plan-line-toggle"
                      aria-expanded={open}
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePaths(c.key);
                      }}
                    >
                      {open ? t('Yolları gizle') : t('Yolları göster ({n})', { n: c.targets.length })}
                    </button>

                    {open && (
                      <ul className="plan-paths">
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
                    )}
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>

      <p className="dim small plan-space-hint">
        {t('↑↓ satır · Space yollar · X plandan çıkar · Enter onaya geç · Esc planı bırak (silme yok)')}
      </p>
    </section>
  );
}
