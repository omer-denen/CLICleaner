import type { PlanResponse } from '../../../src/core/contract.ts';
import { formatBytes } from '../format.ts';
import { translate, translateUpper, type Lang, type MessageKey } from '../i18n.ts';
import { RISK_LABEL } from '../labels.ts';

/**
 * SAG PANEL "PLANLANANLAR" — yalnizca GOSTERIR.
 *
 * Planin tek kaynagi sunucudur (`GET /api/plan`); satir cikarma islemi
 * Plan ekranindakiyle ayni motoru kullanir (`POST /api/plan`).
 * Onay/kelime dogrulama burada YOKTUR; Plan ekraninda kalir.
 */
export function PlannedModule({
  plan,
  lang,
  busy,
  error,
  onRemove,
  onOpenPlan,
}: {
  plan: PlanResponse | null;
  lang: Lang;
  busy: boolean;
  error: string | null;
  onRemove: (key: string) => void;
  onOpenPlan: () => void;
}) {
  const t = (key: MessageKey, vars?: Record<string, string | number>) =>
    translate(lang, key, vars);
  const tu = (key: MessageKey) => translateUpper(lang, key);

  if (error) {
    return (
      <div className="banner danger" role="alert">
        {error}
      </div>
    );
  }

  if (!plan) {
    return <p className="dim rp-empty">{t('rightPanel.planned.empty')}</p>;
  }

  return (
    <section className="rp-planned" aria-label={tu('rightPanel.planned')}>
      <header className="rp-planned-head">
        <div>
          <strong className="mono">{formatBytes(plan.plan.totalBytes)}</strong>
          <span className="dim">
            {' '}
            · {plan.plan.clusters.length} {t('rightPanel.planned.clusters')}
          </span>
        </div>
        <button type="button" className="ghost" onClick={onOpenPlan}>
          {t('rightPanel.planned.open')}
        </button>
      </header>

      <ul className="rp-planned-list">
        {plan.plan.clusters.map((cluster) => (
          <li key={cluster.key}>
            <div className="rp-planned-row">
              <div className="rp-planned-title">
                <span className="mono">{cluster.key}</span>
                <span className="dim">{cluster.title}</span>
              </div>
              <span className={`risk-badge risk-${cluster.risk}`}>
                {t(RISK_LABEL[cluster.risk] ?? 'risk.safe')}
              </span>
              <span className="mono dim">{formatBytes(cluster.bytes)}</span>
              <button
                type="button"
                className="ghost rp-remove"
                disabled={busy}
                onClick={() => onRemove(cluster.key)}
              >
                {t('plan.remove')}
              </button>
            </div>
          </li>
        ))}
      </ul>

      <p className="dim rp-hint">{t('rightPanel.planned.hint')}</p>
    </section>
  );
}
