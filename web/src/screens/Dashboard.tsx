import type {
  DashboardCardId,
  DashboardLedgerId,
  DashboardResponse,
} from '../../../src/core/contract.ts';
import { translate, type Lang, type MessageKey } from '../i18n.ts';
import { formatAge, formatBytes } from '../format.ts';

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

const REASON: Record<string, MessageKey> = {
  regenerable: 'reason.regenerable',
  'user-data': 'reason.user-data',
  unknown: 'reason.unknown',
};

const CONFIDENCE: Record<string, MessageKey> = {
  high: 'confidence.high',
  medium: 'confidence.medium',
  low: 'confidence.low',
};

const CATEGORY: Record<string, MessageKey> = {
  protected: 'category.protected',
  duplicate: 'category.duplicate',
  'old-version': 'category.old-version',
  orphan: 'category.orphan',
  unused: 'category.unused',
  'ai-debris': 'category.ai-debris',
  'ghost-envs': 'category.ghost-envs',
  unknown: 'category.unknown',
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

      <section className="ledgers" aria-label="Defterler">
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
        <section className="cards" aria-label="Risk kartları">
          {data.cards.map((card) => (
            <article key={`${card.id}-${card.target}`} className={`card card-${card.tone}`}>
              <span className="card-label">{t(CARD_LABEL[card.id])}</span>
              {card.count > 0 && <strong className="card-count">{card.count}</strong>}
              <span className="card-target dim">{card.target}</span>
            </article>
          ))}
        </section>
      )}

      <section className="panel">
        <h2>{t('dash.safeWins')}</h2>
        {data.safeWins.length === 0 ? (
          <p className="dim">{t('dash.safeWins.empty')}</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Cluster</th>
                <th>Category</th>
                <th className="num">Size</th>
                <th>Why</th>
              </tr>
            </thead>
            <tbody>
              {data.safeWins.map((win) => (
                <tr key={win.clusterKey}>
                  <td className="mono">{win.clusterKey}</td>
                  <td>{t(CATEGORY[win.category] ?? 'category.unknown')}</td>
                  <td className="num mono">{formatBytes(win.bytes)}</td>
                  <td className="dim">
                    {t(REASON[win.regenerability] ?? 'reason.unknown')} ·{' '}
                    {t(CONFIDENCE[win.confidence] ?? 'confidence.low')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel verdicts">
        <h2>{t('dash.verdicts')}</h2>
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
