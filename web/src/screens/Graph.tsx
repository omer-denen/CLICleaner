import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CliInventoryStreamEvent,
  GraphDependentView,
  GraphEdge,
  GraphNodeView,
  GraphViewResponse,
  GraphWhatIfResponse,
} from '../../../src/core/contract.ts';
import { api, ApiError } from '../api.ts';
import { translate, translateUpper, type Lang, type MessageKey } from '../i18n.ts';
import {
  GRAPH_EDGE_LABEL,
  GRAPH_LEVEL_LABEL,
  GRAPH_NODE_LABEL,
  GRAPH_ROLE_LABEL,
  GRAPH_STATE_LABEL,
  GRAPH_STRENGTH_LABEL,
} from '../labels.ts';
import { openEvents } from '../sse.ts';

interface Props {
  lang: Lang;
}

type ScreenProfile = 'protect' | 'experiment';
type RowMode = 'relations' | 'whatif';

interface ExpandedRow {
  nodeId: string;
  mode: RowMode;
  loading: boolean;
  result: GraphWhatIfResponse | null;
  error: string | null;
}

/** Grafik ekrani: karar MOTORDAN gelir; arayuz yalnizca gosterir. */
export function Graph({ lang }: Props) {
  const t = (key: MessageKey, vars?: Record<string, string | number>) =>
    translate(lang, key, vars);

  // Etiket/basliklar: dil bilincli buyuk harf (TR: i -> İ).
  const tu = (key: MessageKey, vars?: Record<string, string | number>) =>
    translateUpper(lang, key, vars);

  const [view, setView] = useState<GraphViewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'check' | 'inventory' | 'graph'>('check');
  const [toolCount, setToolCount] = useState(0);

  const [profile, setProfile] = useState<ScreenProfile>(() =>
    localStorage.getItem('residue.graphProfile') === 'experiment' ? 'experiment' : 'protect',
  );
  const [expanded, setExpanded] = useState<ExpandedRow | null>(null);

  const [query, setQuery] = useState('');
  const [running, setRunning] = useState(false);
  const [whatIf, setWhatIf] = useState<GraphWhatIfResponse | null>(null);
  const [whatIfError, setWhatIfError] = useState<string | null>(null);

  const closeStream = useRef<(() => void) | null>(null);

  useEffect(() => {
    localStorage.setItem('residue.graphProfile', profile);
  }, [profile]);

  useEffect(
    () => () => {
      closeStream.current?.();
      closeStream.current = null;
    },
    [],
  );

  const inventory = (): Promise<void> =>
    new Promise((resolve, reject) => {
      void (async () => {
        try {
          const { jobId } = await api.startCliInventory(21);
          closeStream.current?.();
          closeStream.current = openEvents<CliInventoryStreamEvent>(
            `/api/cli/inventory/${jobId}/events`,
            (event) => {
              if (event.type === 'tool') {
                setToolCount((n) => n + 1);
                return;
              }
              if (event.type === 'done' || event.type === 'cancelled') {
                closeStream.current?.();
                closeStream.current = null;
                resolve();
                return;
              }
              if (event.type === 'error') {
                closeStream.current?.();
                closeStream.current = null;
                reject(new Error(event.message));
              }
            },
            (fatal) => {
              if (!fatal) return; // EventSource kendisi yeniden baglanir
              closeStream.current?.();
              closeStream.current = null;
              reject(new Error(t('graph.progress.streamError')));
            },
          );
        } catch (err) {
          // 409: baska bir envanter calisiyor; graph() tek-flight bekler.
          if (err instanceof ApiError && err.status === 409) resolve();
          else reject(err);
        }
      })();
    });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setView(null);
    setExpanded(null);
    setWhatIf(null);
    setWhatIfError(null);
    try {
      setPhase('check');
      const cached = await api.cliView({
        text: '',
        status: 'all',
        source: 'all',
        sort: 'status',
      });
      if (!cached) {
        setPhase('inventory');
        setToolCount(0);
        await inventory();
      }
      setPhase('graph');
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

  const nodeById = useMemo(() => {
    const map = new Map<string, GraphNodeView>();
    for (const node of view?.nodes ?? []) map.set(node.id, node);
    return map;
  }, [view]);

  const labelOf = (id: string): string => labels.get(id) ?? id;

  const edgeMeta = (edge: GraphEdge): string =>
    [
      t(GRAPH_EDGE_LABEL[edge.kind] ?? 'graph.edge.link'),
      t(GRAPH_STRENGTH_LABEL[edge.strength] ?? 'graph.strength.weak'),
      t(GRAPH_STATE_LABEL[edge.state] ?? 'graph.state.unknown'),
    ].join(' · ');

  const relationLine = (other: GraphDependentView): string =>
    `${other.label} · ${edgeMeta(other.edge)}`;

  const toggleRelations = (node: GraphNodeView): void => {
    setExpanded((prev) =>
      prev?.nodeId === node.id && prev.mode === 'relations'
        ? null
        : { nodeId: node.id, mode: 'relations', loading: false, result: null, error: null },
    );
  };

  const toggleWhatIfRow = async (node: GraphNodeView): Promise<void> => {
    if (expanded?.nodeId === node.id && expanded.mode === 'whatif') {
      setExpanded(null);
      return;
    }
    setExpanded({ nodeId: node.id, mode: 'whatif', loading: true, result: null, error: null });
    try {
      const result = await api.graphWhatIfNode(node.id);
      setExpanded((prev) =>
        prev && prev.nodeId === node.id ? { ...prev, loading: false, result } : prev,
      );
    } catch (err) {
      setExpanded((prev) =>
        prev && prev.nodeId === node.id
          ? {
              ...prev,
              loading: false,
              error: err instanceof ApiError ? err.message : String(err),
            }
          : prev,
      );
    }
  };

  const toggleRow = (node: GraphNodeView): void => {
    if (profile === 'protect') toggleRelations(node);
    else void toggleWhatIfRow(node);
  };

  const switchProfile = (next: ScreenProfile): void => {
    setProfile(next);
    setExpanded(null);
  };

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
            <div className="profile-switch" role="group" aria-label={t('graph.profile.label')}>
              <button
                type="button"
                className={profile === 'protect' ? 'active' : ''}
                aria-pressed={profile === 'protect'}
                onClick={() => switchProfile('protect')}
              >
                {t('graph.profile.protect')}
              </button>
              <button
                type="button"
                className={profile === 'experiment' ? 'active' : ''}
                aria-pressed={profile === 'experiment'}
                onClick={() => switchProfile('experiment')}
              >
                {t('graph.profile.experiment')}
              </button>
            </div>
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

        <p className="graph-profile-note dim">
          {t(
            profile === 'protect'
              ? 'graph.profile.protectNote'
              : 'graph.profile.experimentNote',
          )}
        </p>

        {loading && (
          <div className="graph-progress" role="status" aria-live="polite">
            <div className="graph-progress-head">
              <strong>
                {phase === 'inventory'
                  ? t('graph.progress.inventory')
                  : phase === 'graph'
                    ? t('graph.progress.graph')
                    : t('graph.progress.check')}
              </strong>
              <span className="dim mono">
                {phase === 'inventory'
                  ? t('graph.progress.tools', { count: toolCount })
                  : t('graph.progress.step', { step: phase === 'graph' ? 2 : 1 })}
              </span>
            </div>
            <div
              className="progress indeterminate"
              role="progressbar"
              aria-label={t('graph.progress.label')}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span />
            </div>
            <p className="dim">{t('graph.progress.hint')}</p>
          </div>
        )}

        {error && (
          <div className="banner danger" role="alert">
            {error}
          </div>
        )}

        {view && (
          <>
            <section className="graph-summary" aria-label={t('graph.summary.nodes')}>
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

            <dl className="graph-legend">
              <div>
                <dt>{t('graph.legend.nodes')}</dt>
                <dd className="dim">{t('graph.legend.nodesNote')}</dd>
              </div>
              <div>
                <dt>{t('graph.legend.edges')}</dt>
                <dd className="dim">{t('graph.legend.edgesNote')}</dd>
              </div>
            </dl>

            <section className="panel">
              <h2>{tu('graph.rootCauses')}</h2>
              {view.rootCauses.length === 0 ? (
                <p className="dim">{t('graph.noRootCauses')}</p>
              ) : (
                <ul className="detail-list">
                  {view.rootCauses.map((root) => {
                    const node = nodeById.get(root.root);
                    return (
                      <li key={root.root} className="graph-root-row">
                        <span className="graph-root-main">
                          <span className="mono">{root.label}</span>
                          <span className="dim">
                            {t(GRAPH_NODE_LABEL[root.kind] ?? 'graph.node.unknown')} ·{' '}
                            {root.count} {t('graph.summary.edges')}
                          </span>
                        </span>
                        {node && (
                          <button
                            type="button"
                            className="ghost graph-sim"
                            disabled={
                              profile === 'experiment' &&
                              expanded?.nodeId === node.id &&
                              expanded.loading
                            }
                            aria-expanded={expanded?.nodeId === node.id}
                            aria-controls={`graph-inline-${node.id}`}
                            onClick={() => toggleRow(node)}
                          >
                            {profile === 'protect'
                              ? t('graph.row.relations')
                              : t('graph.row.simulate')}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {view.cycles.length > 0 && (
              <section className="panel">
                <h2>{tu('graph.cycles')}</h2>
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
              <h2>{tu('graph.nodes')}</h2>
              <div className="graph-scroll">
                <div className="graph-node-head">
                  <span>{tu('graph.nodes')}</span>
                  <span>{tu('graph.edge.kind')}</span>
                  <span>{tu('graph.role')}</span>
                  <span>{tu('graph.level')}</span>
                  <span>{tu('graph.path')}</span>
                  <span />
                  <span>{tu('graph.action')}</span>
                </div>
                {view.nodes.map((node) => {
                  const open = expanded?.nodeId === node.id;
                  return (
                    <div className={`graph-node-wrap${open ? ' active' : ''}`} key={node.id}>
                      <div className="graph-node-row">
                        <span className="mono graph-label" title={node.id}>
                          {node.label}
                        </span>
                        <span className="badge">
                          {t(GRAPH_NODE_LABEL[node.kind] ?? 'graph.node.unknown')}
                        </span>
                        <span className="badge">
                          {t(GRAPH_ROLE_LABEL[node.role] ?? 'graph.role.isolated')}
                        </span>
                        <span className={`badge graph-level-${node.level}`}>
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
                        <button
                          type="button"
                          className="ghost graph-sim"
                          disabled={
                            profile === 'experiment' &&
                            open &&
                            expanded?.loading === true
                          }
                          aria-expanded={open}
                          aria-controls={`graph-inline-${node.id}`}
                          aria-label={
                            profile === 'protect'
                              ? t('graph.row.relationsFor', { name: node.label })
                              : t('graph.whatIf.simulateNode', { name: node.label })
                          }
                          onClick={() => toggleRow(node)}
                        >
                          {profile === 'protect'
                            ? t('graph.row.relations')
                            : t('graph.row.simulate')}
                        </button>
                      </div>

                      {open && expanded && (
                        <div
                          className="graph-inline"
                          id={`graph-inline-${node.id}`}
                          role="region"
                          aria-label={t('graph.tree.title', { name: node.label })}
                        >
                          {expanded.loading && (
                            <p className="dim">{t('graph.whatIf.running')}</p>
                          )}
                          {expanded.error && (
                            <div className="banner danger" role="alert">
                              {expanded.error}
                            </div>
                          )}
                          {expanded.mode === 'relations' && (
                            <RelationsTree
                              node={node}
                              t={t}
                              tu={tu}
                              edgeMeta={edgeMeta}
                              labelOf={labelOf}
                            />
                          )}
                          {expanded.mode === 'whatif' && expanded.result && (
                            <>
                              {expanded.result.nodeIds.length === 0 ? (
                                <p className="dim">{t('graph.whatIf.noMatch')}</p>
                              ) : (
                                <WhatIfTree
                                  node={node}
                                  result={expanded.result}
                                  t={t}
                                  tu={tu}
                                  edgeMeta={edgeMeta}
                                  labelOf={labelOf}
                                />
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="panel">
              <h2>{tu('graph.edges')}</h2>
              <p className="dim graph-note">
                {t(
                  profile === 'protect'
                    ? 'graph.edges.noteProtect'
                    : 'graph.edges.noteExperiment',
                )}
              </p>
              <div className="graph-scroll">
                <div className="graph-edge-head">
                  <span>{tu('graph.edge.from')}</span>
                  <span>{tu('graph.edge.to')}</span>
                  <span>{tu('graph.edge.kind')}</span>
                  <span>{tu('graph.edge.strength')}</span>
                  <span>{tu('graph.edge.state')}</span>
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
        <h2>{tu('graph.whatIf.title')}</h2>
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

        {whatIfError && (
          <div className="banner danger" role="alert">
            {whatIfError}
          </div>
        )}

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
                    <h4>{tu('graph.whatIf.blocked')}</h4>
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
                    <h4>{tu('graph.whatIf.brokenEdges')}</h4>
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
                    <h4>{tu('graph.whatIf.isolated')}</h4>
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

interface TreeProps {
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  tu: (key: MessageKey, vars?: Record<string, string | number>) => string;
  edgeMeta: (edge: GraphEdge) => string;
  labelOf: (id: string) => string;
}

/** Koruma bakisi: dugumun gelen ve giden iliskileri (SALT OKUNUR). */
function RelationsTree({ node, ...rest }: TreeProps & { node: GraphNodeView }) {
  const { t, tu, edgeMeta } = rest;
  if (node.dependents.length === 0 && node.needs.length === 0) {
    return <p className="dim">{t('graph.tree.empty')}</p>;
  }
  return (
    <div className="graph-tree">
      <p className="graph-tree-root mono">{node.label}</p>
      {node.dependents.length > 0 && (
        <section>
          <h5>{tu('graph.tree.dependents', { count: node.dependents.length })}</h5>
          <ul>
            {node.dependents.map((item) => (
              <li key={item.edge.id}>
                <span className="mono">{item.label}</span>
                <span className="dim"> → </span>
                <span className="mono">{node.label}</span>
                <span className="dim"> · {edgeMeta(item.edge)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {node.needs.length > 0 && (
        <section>
          <h5>{tu('graph.tree.needs', { count: node.needs.length })}</h5>
          <ul>
            {node.needs.map((item) => (
              <li key={item.edge.id}>
                <span className="mono">{node.label}</span>
                <span className="dim"> → </span>
                <span className="mono">{item.label}</span>
                <span className="dim"> · {edgeMeta(item.edge)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="dim graph-tree-note">{t('graph.tree.readonly')}</p>
    </div>
  );
}

/** Deneme bakisi: kaldirma etkisi (MOTORDAN gelen what-if sonucu). */
function WhatIfTree({
  node,
  result,
  ...rest
}: TreeProps & { node: GraphNodeView; result: GraphWhatIfResponse }) {
  const { t, tu, edgeMeta, labelOf } = rest;
  const blocked = result.result.blocked;
  const broken = result.result.brokenEdges;
  const isolated = result.result.isolated;
  return (
    <div className="graph-tree">
      <p className="graph-tree-root">
        <span className="mono">{node.label}</span>{' '}
        <span className={`badge ${blocked.length > 0 ? 'warn' : 'git'}`}>
          {blocked.length > 0 ? t('graph.tree.blocked') : t('graph.tree.allowed')}
        </span>
      </p>
      <p className="dim">
        {blocked.length > 0
          ? t('graph.tree.blockedNote', { count: blocked.length })
          : t('graph.tree.allowedNote')}
      </p>
      {blocked.length > 0 && (
        <section>
          <h5>{tu('graph.whatIf.blocked')}</h5>
          <ul>
            {blocked.map((item) => (
              <li key={item.id}>
                <span className="mono">{item.label}</span>
                {item.dependents.length > 0 && (
                  <ul className="graph-tree-children">
                    {item.dependents.map((dep) => (
                      <li key={dep.id}>
                        <span className="mono">{dep.label}</span>
                        <span className="dim"> → {item.label} · {edgeMeta(dep.edge)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {broken.length > 0 && (
        <section>
          <h5>{tu('graph.tree.broken', { count: broken.length })}</h5>
          <ul>
            {broken.map((edge) => (
              <li key={edge.id}>
                <span className="mono">
                  {labelOf(edge.from)} → {labelOf(edge.to)}
                </span>
                <span className="dim"> · {edgeMeta(edge)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {isolated.length > 0 && (
        <section>
          <h5>{tu('graph.tree.isolated', { count: isolated.length })}</h5>
          <ul>
            {isolated.map((id) => (
              <li key={id} className="mono">
                {labelOf(id)}
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="dim graph-tree-note">{t('graph.tree.readonly')}</p>
    </div>
  );
}
