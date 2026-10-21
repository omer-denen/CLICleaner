import type {
  DashboardCardId,
  DashboardLedgerId,
  DashboardResponse,
} from '../../../src/core/contract.ts';
import { translate, translateUpper, type Lang, type MessageKey } from '../i18n.ts';
import { formatAge, formatBytes } from '../format.ts';
import { CATEGORY_LABEL, CONFIDENCE_LABEL, REGEN_LABEL } from '../labels.ts';

const LEDGER_LABEL: Record<DashboardLedgerId, MessageKey> = {
  protected: 'ledger.protected',
  reclaimable: 'ledger.reclaimable',
  vault: 'ledger.vault',
  cli: 'ledger.cli',
};

const LEDGER_NOTE: Record<DashboardLedgerId, MessageKey> = {
  protected: 'ledger.protected.note',
  reclaimable: 'ledger.reclaimable.note',
  vault: 'ledger.vault.note',
  cli: 'ledger.cli.note',
};

const CARD_LABEL: Record<DashboardCardId, MessageKey> = {
  'scan-missing': 'card.scan-missing',
  'scan-stale': 'card.scan-stale',
  'path-issues': 'card.path-issues',
  'orphan-vars': 'card.orphan-vars',
  'broken-installs': 'card.broken-installs',
  'broken-dependencies': 'card.broken-dependencies',
  'shadowed-commands': 'card.shadowed-commands',
  interrupted: 'card.interrupted',
  'vault-expired': 'card.vault-expired',
  'schedule-missed': 'card.schedule-missed',
  'schedule-due': 'card.schedule-due',
};

/** Kart hedefi kimligi -> gorunen etiket (buyuk harf dil bilincli). */
const CARD_TARGET: Record<string, MessageKey> = {
  disk: 'target.disk',
  tools: 'target.tools',
  graph: 'target.graph',
  env: 'target.env',
  recover: 'target.recover',
  vault: 'target.vault',
  schedules: 'target.schedules',
};

/**
 * GENEL BAKIS — yalnizca GOSTERIR.
 *
 * Tum sayilar, kartlar ve "guvenli kazanim" listesi `/api/dashboard`
 * yanitindan gelir. Bu bilesende filtre/siralama/hesap YOKTUR.
 */
export function Dashboard({ data, lang }: { data: DashboardResponse; lang: Lang }) {
  const t = (key: MessageKey, vars?: Record<string, string | number>) =>
    translate(lang, key, vars);

  // Etiket/basliklar: dil bilincli buyuk harf (TR: i -> İ).
  const tu = (key: MessageKey, vars?: Record<string, string | number>) =>
    translateUpper(lang, key, vars);

  const verdicts: MessageKey[] = [
    'verdict.recommend',
    'verdict.ask',
    'verdict.report-only',
    'verdict.keep',
  ];

  return (
    <div className="dashboard">
      <header className="page-head">
        <div>
          <h1>{t('dash.title')}</h1>
          <p className="dim">{t('dash.subtitle')}</p>
        </div>
        <span className={`scan-chip scan-${data.scan.state}`}>
          {t(`scan.${data.scan.state}` as MessageKey)} ·{' '}
          {formatAge(data.scan.ageMs, lang)}
        </span>
      </header>

      <section className="ledgers" aria-label={t('dash.ledgers')}>
        {data.ledgers.map((ledger) => (
          <article key={ledger.id} className={`ledger ledger-${ledger.id}`}>
            <span className="ledger-label">{t(LEDGER_LABEL[ledger.id])}</span>
            <strong className="ledger-value">{formatBytes(ledger.bytes)}</strong>
            <span className="ledger-note dim">{t(LEDGER_NOTE[ledger.id])}</span>
          </article>
        ))}
      </section>

      {data.scan.state === 'never' && (
        <div className="banner">
          <strong>{t('dash.noScan')}</strong> {t('dash.noScanHint')} <code>residue scan</code>
        </div>
      )}

      {data.cards.length > 0 && (
        <section className="cards" aria-label={t('dash.cards')}>
          {data.cards.map((card) => (
            <article key={`${card.id}-${card.target}`} className={`card card-${card.tone}`}>
              <span className="card-label">{t(CARD_LABEL[card.id])}</span>
              {card.count > 0 && <strong className="card-count">{card.count}</strong>}
              <span className="card-target dim">
                {tu(CARD_TARGET[card.target] ?? 'target.disk')}
              </span>
            </article>
          ))}
        </section>
      )}

      <section className="panel">
        <h2>{tu('dash.safeWins')}</h2>
        {data.safeWins.length === 0 ? (
          <p className="dim">{t('dash.safeWins.empty')}</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{tu('table.cluster')}</th>
                <th>{tu('table.category')}</th>
                <th className="num">{t('table.size')}</th>
                <th>{tu('table.why')}</th>
              </tr>
            </thead>
            <tbody>
              {data.safeWins.map((win) => (
                <tr key={win.clusterKey}>
                  <td className="mono">{win.clusterKey}</td>
                  <td>{t(CATEGORY_LABEL[win.category] ?? 'category.unknown')}</td>
                  <td className="num mono">{formatBytes(win.bytes)}</td>
                  <td className="dim">
                    {t(REGEN_LABEL[win.regenerability] ?? 'reason.unknown')} ·{' '}
                    {t(CONFIDENCE_LABEL[win.confidence] ?? 'confidence.low')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel verdicts">
        <h2>{tu('dash.verdicts')}</h2>
        <div className="verdict-grid">
          {verdicts.map((key) => {
            const id = key.replace('verdict.', '') as keyof typeof data.totals.verdicts;
            return (
              <div key={key} className="verdict">
                <strong className="mono">{data.totals.verdicts[id] ?? 0}</strong>
                <span className="dim">{t(key)}</span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
