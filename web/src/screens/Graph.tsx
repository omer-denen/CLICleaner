import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  GraphViewResponse,
  GraphWhatIfResponse,
} from '../../../src/core/contract.ts';
import { api, ApiError } from '../api.ts';
import { translate, type Lang, type MessageKey } from '../i18n.ts';
import {
  GRAPH_EDGE_LABEL,
  GRAPH_LEVEL_LABEL,
  GRAPH_NODE_LABEL,
  GRAPH_ROLE_LABEL,
  GRAPH_STATE_LABEL,
  GRAPH_STRENGTH_LABEL,
} from '../labels.ts';

interface Props {
  lang: Lang;
}

/**
 * GRAF — envanterden turetilen bagimlilik agi.
 *
 * Dugum/kenar, kok nedenler ve what-if sonucu MOTORDAN gelir; arayuz
 * yalnizca gosterir. Grafik SILME YAPMAZ; yalnizca "bu kaldirilirsa ne
 * kopar" sorusunu yanitlar.
 */
export function Graph({ lang }: Props) {
  const t = (key: MessageKey, vars?: Record<string, string | number>) =>
    translate(lang, key, vars);

  const [view, setView] = useState<GraphViewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [running, setRunning] = useState(false);
  const [whatIf, setWhatIf] = useState<GraphWhatIfResponse | null>(null);
  const [whatIfError, setWhatIfError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setView(await api.graph());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const labels = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of view?.nodes ?? []) map.set(node.id, node.label);
    return map;
  }, [view]);

  const labelOf = (id: string): string => labels.get(id) ?? id;

  const simulate = async (): Promise<void> => {
    const q = query.trim();
    if (!q) return;
    setRunning(true);
    setWhatIfError(null);
    setWhatIf(null);
    try {
      setWhatIf(await api.graphWhatIf(q));
    } catch (err) {
      setWhatIfError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="graph">
      <section className="graph-main">
        <header className="page-head">
          <div>
            <h1>{t('graph.title')}</h1>
            <p className="dim">{t('graph.subtitle')}</p>
          </div>
          <div className="page-actions">
            <button
              type="button"
              className="ghost"
              onClick={() =>
                document
                  .getElementById('graph-whatif')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
            >
              {t('graph.whatIf.title')}
            </button>
            <button type="button" className="ghost" onClick={() => void load()}>
              {t('graph.refresh')}
            </button>
          </div>
        </header>

        {loading && <div className="state">{t('graph.loading')}</div>}
        {error && <div className="banner danger">{error}</div>}

        {view && (
          <>
            <section className="graph-summary">
              {(
                [
                  ['nodes', view.summary.nodes],
                  ['edges', view.summary.edges],
                  ['broken', view.summary.broken],
                  ['shadowed', view.summary.shadowed],
                  ['cycles', view.summary.cycles],
                  ['critical', view.summary.critical],
                ] as const
              ).map(([key, value]) => (
                <div key={key} className="graph-stat">
                  <strong className="mono">{value}</strong>
                  <span className="dim">{t(`graph.summary.${key}` as MessageKey)}</span>
                </div>
              ))}
            </section>

            <section className="panel">
              <h2>{t('graph.rootCauses')}</h2>
              {view.rootCauses.length === 0 ? (
                <p className="dim">{t('graph.noRootCauses')}</p>
              ) : (
                <ul className="detail-list">
                  {view.rootCauses.map((root) => (
                    <li key={root.root}>
                      <span className="mono">{root.label}</span>
                      <span className="dim">
                        {t(GRAPH_NODE_LABEL[root.kind] ?? 'graph.node.unknown')} ·{' '}
                        {root.count} {t('graph.summary.edges')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {view.cycles.length > 0 && (
              <section className="panel">
                <h2>{t('graph.cycles')}</h2>
                <ul className="detail-list">
                  {view.cycles.map((cycle) => (
                    <li key={cycle.join('>')} className="mono">
                      {cycle.map(labelOf).join(' → ')}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="panel">
              <h2>{t('graph.nodes')}</h2>
              <div className="graph-scroll">
                <div className="graph-node-head">
                  <span>{t('graph.nodes')}</span>
                  <span>{t('graph.edge.kind')}</span>
                  <span>{t('graph.role')}</span>
                  <span>{t('graph.level')}</span>
                  <span>{t('graph.path')}</span>
                </div>
                {view.nodes.map((node) => (
                  <div className="graph-node-row" key={node.id}>
                    <span className="mono graph-label" title={node.id}>
                      {node.label}
                    </span>
                    <span className="badge">
                      {t(GRAPH_NODE_LABEL[node.kind] ?? 'graph.node.unknown')}
                    </span>
                    <span className="badge">
                      {t(GRAPH_ROLE_LABEL[node.role] ?? 'graph.role.isolated')}
                    </span>
                    <span
                      className={`badge graph-level-${node.level}`}
                    >
                      {t(GRAPH_LEVEL_LABEL[node.level] ?? 'graph.level.low')}
                    </span>
                    <span className="dim mono graph-path" title={node.path ?? ''}>
                      {node.path ?? '—'}
                    </span>
                    <span className="badges-right">
                      {node.active && (
                        <span className="badge git">{t('graph.node.active')}</span>
                      )}
                      {node.protected && (
                        <span className="badge">{t('graph.node.protected')}</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel">
              <h2>{t('graph.edges')}</h2>
              <div className="graph-scroll">
                <div className="graph-edge-head">
                  <span>{t('graph.edge.from')}</span>
                  <span>{t('graph.edge.to')}</span>
                  <span>{t('graph.edge.kind')}</span>
                  <span>{t('graph.edge.strength')}</span>
                  <span>{t('graph.edge.state')}</span>
                </div>
                {view.edges.map((edge) => (
                  <div className="graph-edge-row" key={edge.id}>
                    <span className="mono graph-label" title={edge.from}>
                      {labelOf(edge.from)}
                    </span>
                    <span className="mono graph-label" title={edge.to}>
                      {labelOf(edge.to)}
                    </span>
                    <span className="badge">
                      {t(GRAPH_EDGE_LABEL[edge.kind] ?? 'graph.edge.link')}
                    </span>
                    <span className="badge">
                      {t(GRAPH_STRENGTH_LABEL[edge.strength] ?? 'graph.strength.weak')}
                    </span>
                    <span
                      className={`badge ${
                        edge.state === 'broken' || edge.state === 'missing-chain'
                          ? 'warn'
                          : ''
                      }`}
                    >
                      {t(GRAPH_STATE_LABEL[edge.state] ?? 'graph.state.unknown')}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </section>

      <aside className="graph-detail" id="graph-whatif">
        <h2>{t('graph.whatIf.title')}</h2>
        <p className="dim">{t('graph.whatIf.hint')}</p>

        <div className="graph-whatif-form">
          <input
            className="control"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('graph.whatIf.placeholder')}
            aria-label={t('graph.whatIf.placeholder')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void simulate();
            }}
          />
          <button
            type="button"
            className="primary"
            disabled={running || query.trim().length === 0}
            onClick={() => void simulate()}
          >
            {running ? t('graph.whatIf.running') : t('graph.whatIf.run')}
          </button>
        </div>

        {whatIfError && <div className="banner danger">{whatIfError}</div>}

        {whatIf && (
          <>
            {whatIf.nodeIds.length === 0 ? (
              <p className="dim">{t('graph.whatIf.noMatch')}</p>
            ) : (
              <>
                <dl className="meta-list">
                  <dt>{t('graph.whatIf.allowed')}</dt>
                  <dd className="mono">{whatIf.result.allowed.length}</dd>
                  <dt>{t('graph.whatIf.blocked')}</dt>
                  <dd className="mono">{whatIf.result.blocked.length}</dd>
                </dl>

                {whatIf.result.blocked.length > 0 && (
                  <>
                    <h4>{t('graph.whatIf.blocked')}</h4>
                    <ul className="detail-list">
                      {whatIf.result.blocked.map((blocked) => (
                        <li key={blocked.id}>
                          <span className="mono">{blocked.label}</span>
                          <span className="dim">{blocked.reason}</span>
                          {blocked.dependents.length > 0 && (
                            <span className="dim">
                              {t('graph.whatIf.dependents')}:{' '}
                              {blocked.dependents.map((d) => d.label).join(', ')}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {whatIf.result.brokenEdges.length > 0 && (
                  <>
                    <h4>{t('graph.whatIf.brokenEdges')}</h4>
                    <ul className="detail-list">
                      {whatIf.result.brokenEdges.map((edge) => (
                        <li key={edge.id} className="mono">
                          {labelOf(edge.from)} → {labelOf(edge.to)} ·{' '}
                          {t(GRAPH_STATE_LABEL[edge.state] ?? 'graph.state.unknown')}
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {whatIf.result.isolated.length > 0 && (
                  <>
                    <h4>{t('graph.whatIf.isolated')}</h4>
                    <ul className="detail-list">
                      {whatIf.result.isolated.map((id) => (
                        <li key={id} className="mono">
                          {labelOf(id)}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
