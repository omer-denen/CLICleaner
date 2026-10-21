import { useCallback, useEffect, useState } from 'react';
import type {
  DashboardResponse,
  MetaResponse,
  PlanResponse,
  ScanStatusResponse,
} from '../../src/core/contract.ts';
import { api, ApiError } from './api.ts';
import { translate, type Lang, type MessageKey } from './i18n.ts';
import { formatBytes } from './format.ts';
import { Dashboard } from './screens/Dashboard.tsx';
import { Disk } from './screens/Disk.tsx';
import { Env } from './screens/Env.tsx';
import { Graph } from './screens/Graph.tsx';
import { PlanScreen } from './screens/PlanScreen.tsx';
import { Projects } from './screens/Projects.tsx';
import { Tools } from './screens/Tools.tsx';
import { Vault } from './screens/Vault.tsx';

type Screen =
  | 'dashboard'
  | 'disk'
  | 'plan'
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
  { id: 'plan', label: 'nav.plan' },
  { id: 'projects', label: 'nav.projects' },
  { id: 'tools', label: 'nav.tools' },
  { id: 'env', label: 'nav.env' },
  { id: 'graph', label: 'nav.graph' },
  { id: 'schedules', label: 'nav.schedules' },
  { id: 'vault', label: 'nav.vault' },
  { id: 'settings', label: 'nav.settings' },
];

const SCAN_KEY: Record<ScanStatusResponse['state'], MessageKey> = {
  never: 'scan.never',
  current: 'scan.current',
  stale: 'scan.stale',
  scanning: 'scan.scanning',
};

const WIDE: Screen[] = [
  'disk',
  'plan',
  'vault',
  'projects',
  'tools',
  'env',
  'graph',
];

export function App() {
  const [lang, setLang] = useState<Lang>(() =>
    localStorage.getItem('residue.lang') === 'en' ? 'en' : 'tr',
  );
  const [screen, setScreen] = useState<Screen>('dashboard');
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [meta, setMeta] = useState<MetaResponse | null>(null);
  const [status, setStatus] = useState<ScanStatusResponse | null>(null);
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const t = (key: MessageKey, vars?: Record<string, string | number>) =>
    translate(lang, key, vars);

  const load = useCallback(async () => {
    setError(null);
    try {
      // Tum istekler SALT OKUNUR; karar motorda verilir.
      const [nextDashboard, nextMeta, nextStatus] = await Promise.all([
        api.dashboard(),
        api.meta(),
        api.scanStatus(),
      ]);
      setDashboard(nextDashboard);
      setMeta(nextMeta);
      setStatus(nextStatus);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshStatus = useCallback(async (): Promise<void> => {
    try {
      setStatus(await api.scanStatus());
    } catch {
      /* durum yenilenemezse eski deger kalir */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    localStorage.setItem('residue.lang', lang);
    document.documentElement.lang = lang;
  }, [lang]);

  const wide = WIDE.includes(screen);

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
          {status && (
            <span className={`scan-chip scan-${status.state}`}>
              {t(SCAN_KEY[status.state])}
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

      <div className={`shell${wide ? ' shell-wide' : ''}`}>
        <nav className="rail" aria-label={t('nav.sections')}>
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

          {!loading && !error && screen === 'disk' && (
            <Disk
              meta={meta}
              status={status}
              lang={lang}
              onStatus={() => void refreshStatus()}
              onPlan={(nextPlan) => {
                setPlan(nextPlan);
                setScreen('plan');
              }}
            />
          )}

          {!loading && !error && screen === 'plan' && (
            <PlanScreen
              plan={plan}
              lang={lang}
              onBack={() => setScreen('disk')}
              onVault={() => setScreen('vault')}
              onReplace={setPlan}
              onExecuted={() => void load()}
            />
          )}

          {!loading && !error && screen === 'projects' && (
            <Projects lang={lang} />
          )}

          {!loading && !error && screen === 'tools' && <Tools lang={lang} />}

          {!loading && !error && screen === 'env' && <Env lang={lang} />}

          {!loading && !error && screen === 'graph' && <Graph lang={lang} />}

          {!loading && !error && screen === 'vault' && (
            <Vault lang={lang} onChanged={() => void load()} />
          )}

          {!loading &&
            !error &&
            ![
              'dashboard',
              'disk',
              'plan',
              'projects',
              'tools',
              'env',
              'graph',
              'vault',
            ].includes(screen) && <div className="state">{t('common.soon')}</div>}
        </main>

        {!wide && (
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
        )}
      </div>

      <footer className="statusbar">
        {dashboard ? (
          <>
            <span>
              <strong className="mono">
                {dashboard.totals.clusters.toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US')}
              </strong>{' '}
              {t('status.clusters')}
            </span>
            <span>
              <strong className="mono">
                {dashboard.totals.files.toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US')}
              </strong>{' '}
              {t('status.files')}
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
