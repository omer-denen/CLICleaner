import { useCallback, useEffect, useState } from 'react';
import type { DashboardResponse, MetaResponse } from '../../src/core/contract.ts';
import { api, ApiError } from './api.ts';
import { translate, type Lang, type MessageKey } from './i18n.ts';
import { formatBytes } from './format.ts';
import { Dashboard } from './screens/Dashboard.tsx';

type Screen =
  | 'dashboard'
  | 'disk'
  | 'projects'
  | 'tools'
  | 'env'
  | 'graph'
  | 'schedules'
  | 'vault'
  | 'settings';

const NAV: Array<{ id: Screen; label: MessageKey }> = [
  { id: 'dashboard', label: 'nav.dashboard' },
  { id: 'disk', label: 'nav.disk' },
  { id: 'projects', label: 'nav.projects' },
  { id: 'tools', label: 'nav.tools' },
  { id: 'env', label: 'nav.env' },
  { id: 'graph', label: 'nav.graph' },
  { id: 'schedules', label: 'nav.schedules' },
  { id: 'vault', label: 'nav.vault' },
  { id: 'settings', label: 'nav.settings' },
];

const SCAN_KEY: Record<DashboardResponse['scan']['state'], MessageKey> = {
  never: 'scan.never',
  current: 'scan.current',
  stale: 'scan.stale',
  scanning: 'scan.scanning',
};

export function App() {
  const [lang, setLang] = useState<Lang>(() =>
    localStorage.getItem('residue.lang') === 'en' ? 'en' : 'tr',
  );
  const [screen, setScreen] = useState<Screen>('dashboard');
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [meta, setMeta] = useState<MetaResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const t = (key: MessageKey, vars?: Record<string, string | number>) =>
    translate(lang, key, vars);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Iki istek de SALT OKUNUR; karar motorda verilir.
      const [nextDashboard, nextMeta] = await Promise.all([api.dashboard(), api.meta()]);
      setDashboard(nextDashboard);
      setMeta(nextMeta);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    localStorage.setItem('residue.lang', lang);
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            R
          </span>
          <div className="brand-text">
            <strong>Residue</strong>
            <span className="dim">{t('app.tagline')}</span>
          </div>
        </div>
        <div className="topbar-right">
          {dashboard && (
            <span className={`scan-chip scan-${dashboard.scan.state}`}>
              {t(SCAN_KEY[dashboard.scan.state])}
            </span>
          )}
          <button type="button" className="ghost" onClick={() => void load()}>
            {t('top.refresh')}
          </button>
          <button
            type="button"
            className="ghost"
            aria-label={t('top.lang')}
            onClick={() => setLang(lang === 'tr' ? 'en' : 'tr')}
          >
            {lang === 'tr' ? 'EN' : 'TR'}
          </button>
        </div>
      </header>

      <div className="shell">
        <nav className="rail" aria-label="Bölümler">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`rail-item${screen === item.id ? ' active' : ''}`}
              aria-current={screen === item.id ? 'page' : undefined}
              onClick={() => setScreen(item.id)}
            >
              {t(item.label)}
            </button>
          ))}
        </nav>

        <main className="main">
          {loading && <div className="state">{t('common.loading')}</div>}

          {!loading && error && (
            <div className="state error" role="alert">
              <strong>{t('common.error')}</strong>
              <span className="mono">{error}</span>
              <button type="button" className="ghost" onClick={() => void load()}>
                {t('common.retry')}
              </button>
            </div>
          )}

          {!loading && !error && screen === 'dashboard' && dashboard && (
            <Dashboard data={dashboard} lang={lang} />
          )}

          {!loading && !error && screen !== 'dashboard' && (
            <div className="state">{t('common.soon')}</div>
          )}
        </main>

        <aside className="context">
          <section className="context-block">
            <h2>{t('safety.title')}</h2>
            <p className="dim">{t('safety.body')}</p>
          </section>

          {meta && (
            <section className="context-block">
              <h2>{t('context.meta')}</h2>
              <dl className="meta-list">
                <dt>{t('context.ui')}</dt>
                <dd className="mono">{meta.ui ? 'web' : 'api'}</dd>
                <dt>{t('context.cwd')}</dt>
                <dd className="mono" title={meta.cwd}>
                  {meta.cwd ?? '—'}
                </dd>
                <dt>{t('context.home')}</dt>
                <dd className="mono" title={meta.home}>
                  {meta.home ?? '—'}
                </dd>
              </dl>
            </section>
          )}
        </aside>
      </div>

      <footer className="statusbar">
        {dashboard ? (
          <>
            <span>
              <strong className="mono">{dashboard.totals.clusters}</strong>{' '}
              {t('status.clusters')}
            </span>
            <span>
              <strong className="mono">{dashboard.totals.files}</strong> {t('status.files')}
            </span>
            <span>
              {t('ledger.reclaimable')}:{' '}
              <strong className="mono">
                {formatBytes(
                  dashboard.ledgers.find((l) => l.id === 'reclaimable')?.bytes ?? 0,
                )}
              </strong>
            </span>
          </>
        ) : (
          <span className="dim">{t('common.none')}</span>
        )}
        <span className="statusbar-spacer" />
        <span className="dim mono">v{meta?.version ?? '—'}</span>
      </footer>
    </div>
  );
}
