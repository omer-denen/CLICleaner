import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
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
import { Schedules } from './screens/Schedules.tsx';
import { Settings } from './screens/Settings.tsx';
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

/** Yazı alanında mı? Kısayollar orada devre dışı kalır. */
function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true
  );
}

const WIDE: Screen[] = [
  'disk',
  'plan',
  'vault',
  'projects',
  'tools',
  'env',
  'graph',
  'schedules',
  'settings',
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
  const [help, setHelp] = useState(false);

  const railRef = useRef<HTMLElement | null>(null);
  const helpRef = useRef<HTMLDivElement | null>(null);
  const helpCloseRef = useRef<HTMLButtonElement | null>(null);
  const helpOpenerRef = useRef<HTMLElement | null>(null);

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

  // Klavye: `/` arama, `?` kısayollar, `Esc` kapat / odaktan çık.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === 'Escape') {
        if (help) {
          setHelp(false);
          return;
        }
        if (isTypingTarget(e.target)) (e.target as HTMLElement).blur();
        return;
      }

      if (isTypingTarget(e.target)) return;

      if (e.key === '?') {
        e.preventDefault();
        setHelp(true);
        return;
      }

      if (e.key === '/') {
        const field = document.querySelector<HTMLInputElement>('main [data-search]');
        if (!field) return;
        e.preventDefault();
        field.focus();
        field.select();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [help]);

  // Kısayol penceresi: odak tuzağı + kapanınca odağı geri ver.
  useEffect(() => {
    if (!help) return;
    helpOpenerRef.current = document.activeElement as HTMLElement | null;
    helpCloseRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        const focusable = Array.from(
          helpRef.current?.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
          ) ?? [],
        ).filter((el) => !el.hasAttribute('disabled'));
        if (focusable.length === 0) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === helpRef.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setHelp(false);
      }
    };

    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      helpOpenerRef.current?.focus?.();
    };
  }, [help]);

  // Rail: roving tabindex + ok tuşları (klavye-only tur).
  const onRailKey = (e: ReactKeyboardEvent<HTMLElement>) => {
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    const buttons = Array.from(
      railRef.current?.querySelectorAll<HTMLButtonElement>('.rail-item') ?? [],
    );
    if (buttons.length === 0) return;
    const index = buttons.findIndex((b) => b === document.activeElement);
    const next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? buttons.length - 1
          : e.key === 'ArrowDown'
            ? (index + 1 + buttons.length) % buttons.length
            : (index - 1 + buttons.length) % buttons.length;
    e.preventDefault();
    buttons[next]?.focus();
  };

  const wide = WIDE.includes(screen);

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        {t('a11y.skip')}
      </a>

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
            <span className={`scan-chip scan-${status.state}`}>{t(SCAN_KEY[status.state])}</span>
          )}
          <button type="button" className="ghost" onClick={() => void load()}>
            {t('top.refresh')}
          </button>
          <button
            type="button"
            className="ghost key-help"
            aria-label={t('a11y.shortcuts')}
            aria-keyshortcuts="?"
            title={t('a11y.shortcuts')}
            onClick={() => setHelp(true)}
          >
            ?
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
        <nav
          className="rail"
          aria-label={t('nav.sections')}
          ref={railRef}
          onKeyDown={onRailKey}
        >
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`rail-item${screen === item.id ? ' active' : ''}`}
              aria-current={screen === item.id ? 'page' : undefined}
              tabIndex={screen === item.id ? 0 : -1}
              onClick={() => setScreen(item.id)}
            >
              {t(item.label)}
            </button>
          ))}
        </nav>

        <main className="main" id="main" tabIndex={-1} aria-label={t('a11y.main')} aria-busy={loading}>
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

          {!loading && !error && screen === 'schedules' && (
            <Schedules lang={lang} />
          )}

          {!loading && !error && screen === 'settings' && (
            <Settings lang={lang} version={meta?.version} />
          )}

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
              'schedules',
              'settings',
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

      {help && (
        <div className="shortcuts-backdrop" onClick={() => setHelp(false)}>
          <div
            className="shortcuts"
            role="dialog"
            aria-modal="true"
            aria-labelledby="shortcuts-title"
            ref={helpRef}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shortcuts-head">
              <h2 id="shortcuts-title">{t('a11y.shortcuts')}</h2>
              <button
                type="button"
                className="ghost"
                ref={helpCloseRef}
                onClick={() => setHelp(false)}
                aria-label={t('a11y.shortcuts.close')}
              >
                {t('common.close')}
              </button>
            </div>
            <dl className="shortcuts-list">
              <div>
                <dt>
                  <kbd>{t('a11y.shortcut.nav.keys')}</kbd>
                </dt>
                <dd>{t('a11y.shortcut.nav')}</dd>
              </div>
              <div>
                <dt>
                  <kbd>{t('a11y.shortcut.search.keys')}</kbd>
                </dt>
                <dd>{t('a11y.shortcut.search')}</dd>
              </div>
              <div>
                <dt>
                  <kbd>{t('a11y.shortcut.row.keys')}</kbd>
                </dt>
                <dd>{t('a11y.shortcut.row')}</dd>
              </div>
              <div>
                <dt>
                  <kbd>{t('a11y.shortcut.select.keys')}</kbd>
                </dt>
                <dd>{t('a11y.shortcut.select')}</dd>
              </div>
              <div>
                <dt>
                  <kbd>{t('a11y.shortcut.escape.keys')}</kbd>
                </dt>
                <dd>{t('a11y.shortcut.escape')}</dd>
              </div>
              <div>
                <dt>
                  <kbd>{t('a11y.shortcut.help.keys')}</kbd>
                </dt>
                <dd>{t('a11y.shortcut.help')}</dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
