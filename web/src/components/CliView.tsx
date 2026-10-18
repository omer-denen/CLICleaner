import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CliInventory, CliStatus, CliTool } from '../../../src/core/cli-inventory-types.ts';
import type {
  CliExecuteResponse,
  CliInventoryStreamEvent,
  CliPlanResponse,
} from '../../../src/web/contract.ts';
import { formatBytes } from '../../../src/util/format.ts';
import {
  cancelCliInventory,
  cliExecute,
  cliInventoryStream,
  cliPlan,
  startCliInventory,
} from '../api.ts';
import { useI18n } from '../i18n.tsx';
import { shortPath } from '../labels.ts';

type Filter = 'all' | CliStatus;

interface Props {
  onError: (message: string) => void;
  onNotice?: (message: string) => void;
}

const SOURCE_LABEL: Record<string, string> = {
  'npm-global': 'npm -g',
  'uv-tool': 'uv tool',
  'dotnet-tool': 'dotnet tool',
  'pip-user': 'pip --user',
  standalone: 'standalone',
};

export function CliView({ onError, onNotice }: Props) {
  const { t, lang } = useI18n();
  const [inventory, setInventory] = useState<CliInventory | null>(null);
  const [loading, setLoading] = useState(false);
  const [unusedDays, setUnusedDays] = useState(21);
  const [filter, setFilter] = useState<Filter>('unused');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [backup, setBackup] = useState(true);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<CliPlanResponse | null>(null);
  const [phrase, setPhrase] = useState('');
  const [results, setResults] = useState<CliExecuteResponse | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [lastInspectedAt, setLastInspectedAt] = useState<number | null>(null);
  /** Tarama surerken bulunan araclar; bitince yerini `inventory` alir. */
  const [liveTools, setLiveTools] = useState<CliTool[]>([]);
  const esRef = useRef<EventSource | null>(null);
  const jobRef = useRef<string | null>(null);
  const finishRef = useRef<(() => void) | null>(null);
  const loadingRef = useRef(false);
  const aliveRef = useRef(true);

  // Baska sekmeye gecince yalnizca akis kapatilir; sunucu isi
  // bitirir. Donuste "Incele" ayni ise baglanir ve bulunanlari replay eder.
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      esRef.current?.close();
      esRef.current = null;
    };
  }, []);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setResults(null);
    setSelected(new Set());
    setElapsed(0);
    setLiveTools([]);
    const started = Date.now();
    const tick = setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    try {
      // Is sunucuda baslar; araclar SSE ile bulundukca gelir.
      const { jobId } = await startCliInventory({ unusedDays });
      jobRef.current = jobId;
      if (!aliveRef.current) {
        // Sekme bu arada kapandi: bosa is birakma.
        void cancelCliInventory(jobId).catch(() => {});
        return;
      }

      await new Promise<void>((resolve) => {
        let settled = false;
        const es = cliInventoryStream(jobId);
        esRef.current = es;
        const finish = () => {
          if (settled) return;
          settled = true;
          es.close();
          if (esRef.current === es) esRef.current = null;
          if (finishRef.current === finish) finishRef.current = null;
          resolve();
        };
        finishRef.current = finish;

        es.onmessage = (ev) => {
          if (!aliveRef.current) {
            finish();
            return;
          }
          let data: CliInventoryStreamEvent;
          try {
            data = JSON.parse(ev.data) as CliInventoryStreamEvent;
          } catch {
            return;
          }
          switch (data.type) {
            case 'start':
              break;
            case 'tool': {
              const tool = data.tool;
              setLiveTools((prev) =>
                prev.some((x) => x.id === tool.id) ? prev : [...prev, tool],
              );
              break;
            }
            case 'done':
              setInventory(data.inventory);
              setLiveTools([]);
              setLastInspectedAt(Date.now());
              onNotice?.(
                t('Envanter güncellendi: {tools} araç · {unused} atıl.', {
                  tools: data.inventory.tools.length,
                  unused: data.inventory.tools.filter((x) => x.status === 'unused').length,
                }),
              );
              finish();
              break;
            case 'cancelled':
              onNotice?.(t('Envanter iptal edildi.'));
              finish();
              break;
            case 'error':
              onError(data.message);
              finish();
              break;
          }
        };

        // EventSource kendisi yeniden baglanmayi dener; yalnizca
        // kalici olarak kapandiysa hata bildir.
        es.onerror = () => {
          if (settled || !aliveRef.current) return;
          if (es.readyState === EventSource.CLOSED) {
            onError(t('Envanter bağlantısı koptu.'));
            finish();
          }
        };
      });
    } catch (e) {
      if (aliveRef.current) onError(errText(e));
    } finally {
      clearInterval(tick);
      jobRef.current = null;
      loadingRef.current = false;
      if (aliveRef.current) setLoading(false);
    }
  }, [unusedDays, onError, onNotice, t]);

  // Sunucudaki isi gercekten iptal eder; akistan 'cancelled' gelince biter.
  const cancelLoad = () => {
    const id = jobRef.current;
    if (!id) return;
    void cancelCliInventory(id).catch((e) => {
      onError(errText(e));
      finishRef.current?.();
    });
  };

  // Tarama surerken bulunanlar canli gosterilir; bitince tam envanter.
  const allTools = useMemo(
    () => (loading ? liveTools : (inventory?.tools ?? [])),
    [loading, liveTools, inventory],
  );

  const tools = useMemo(() => {
    const sorted = [...allTools].sort(
      (a, b) => statusOrder(a.status) - statusOrder(b.status) || b.totalBytes - a.totalBytes,
    );
    return filter === 'all' ? sorted : sorted.filter((x) => x.status === filter);
  }, [allTools, filter]);

  const unused = inventory?.tools.filter((x) => x.status === 'unused') ?? [];
  const unusedBytes = unused.reduce((a, x) => a + x.totalBytes, 0);

  const selectable = (x: CliTool) => x.status !== 'protected' && x.uninstall !== null;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(tools.filter(selectable).map((x) => x.id)));
  };

  // `ids` verilmezse mevcut secim kullanilir. Cakisma kartindan yalnizca
  // golgede kalan kurulumun kimligi gecilir; aktif kurulum plana girmez.
  const openPlan = async (ids: string[] = [...selected]) => {
    if (ids.length === 0) return;
    setBusy(true);
    try {
      const p = await cliPlan({
        commands: ids,
        backup,
        unusedDays,
      });
      setPlan(p);
      setPhrase('');
    } catch (e) {
      onError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const applyPlan = async () => {
    if (!plan || phrase.trim() !== 'SIL') return;
    setBusy(true);
    try {
      const r = await cliExecute({ planId: plan.planId, phrase: phrase.trim() });
      setResults(r);
      setPlan(null);
      await load();
    } catch (e) {
      onError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="cli-view">
      <div className="cli-head">
        <div>
          <h1>{t('Kurulu CLI envanteri')}</h1>
          <p className="dim">{t('Kullanılmayan komutları, kurulum kaynağını ve son kullanım kanıtını gösterir; hiçbir şey silmez.')}</p>
          <p className="dim small">{t('Hiçbir şey silinmez; önce plan gösterilir.')}</p>
        </div>
        <div className="cli-head-actions">
          <label className="cli-threshold">
            <span>{t('Atıl eşiği (gün)')}</span>
            <input
              type="number"
              min={1}
              max={3650}
              value={unusedDays}
              onChange={(e) => setUnusedDays(Math.max(1, Number(e.target.value) || 21))}
            />
          </label>
          {inventory && (
            <button
              className="btn"
              onClick={() => void load()}
              disabled={loading || busy}
              title={t('Envanteri yenile')}
            >
              {loading ? `${t('İnceleniyor…')} ${elapsed}s` : t('Yenile')}
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="cli-loading">
          <div className="spinner" aria-hidden="true" />
          <div className="grow">
            <strong>
              {t('Envanter inceleniyor…')} · {elapsed}s
            </strong>
            <p className="dim small">
              {t("Kurulu CLI'lar taranıyor; bu işlem biraz zaman alabilir…")}
            </p>
            {liveTools.length > 0 && (
              <p className="dim small">
                {t('{n} araç bulundu; liste canlı güncelleniyor.', { n: liveTools.length })}
              </p>
            )}
          </div>
          <button className="btn" onClick={cancelLoad}>
            {t('Vazgeç')}
          </button>
        </div>
      )}

      {!loading && lastInspectedAt && (
        <p className="dim small">
          {t('Son inceleme: {date}', {
            date: new Date(lastInspectedAt).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US'),
          })}
        </p>
      )}

      {!inventory && !loading && (
        <div className="cli-empty-cta">
          <h2>{t('Kurulu CLI envanterini incele')}</h2>
          <p className="dim">
            {t('Kurulu araçları, atıllık kanıtlarını ve kaldırma planlarını görün. Hiçbir şey silinmez.')}
          </p>
          <button className="btn btn-primary btn-lg" onClick={() => void load()}>
            {t('İncele')}
          </button>
        </div>
      )}

      {inventory && (
        <div className="summary cli-summary">
          <div className="card">
            <span className="card-label">{t('Araç')}</span>
            <strong>{inventory.tools.length}</strong>
            <span className="dim">{inventory.roots.length} {t('Kaynak')}</span>
          </div>
          <div className="card">
            <span className="card-label">{t('Atıl')}</span>
            <strong className="red">{unused.length}</strong>
            <span className="dim">{formatBytes(unusedBytes)}</span>
          </div>
          <div className="card">
            <span className="card-label">{t('Bilinmiyor')}</span>
            <strong>{inventory.tools.filter((x) => x.status === 'unknown').length}</strong>
            <span className="dim">{t('Son sinyal')}</span>
          </div>
          <div className="card">
            <span className="card-label">{t('Korunan')}</span>
            <strong>{inventory.tools.filter((x) => x.status === 'protected').length}</strong>
            <span className="dim">{t('Yedek')}: {inventory.tools.filter((x) => x.stateDirs.length > 0).length}</span>
          </div>
        </div>
      )}

      {inventory && inventory.duplicates.length > 0 && (
        <section className="conflicts">
          <h3>{t('Aynı komutun birden fazla kurulumu')}</h3>
          <p className="dim small">
            {t(
              "Aynı komutu iki paket sağlıyor. Shim'in gösterdiği aktif kurulum korunur; gölgede kalan eski paket kaldırılabilir.",
            )}
          </p>
          {inventory.duplicates.map((d) => {
            const keep = inventory.tools.find((x) => x.id === d.keepId);
            const remove = d.removeIds
              .map((id) => inventory.tools.find((x) => x.id === id))
              .filter((x): x is CliTool => !!x);
            const bytes = remove.reduce((a, x) => a + x.totalBytes, 0);
            return (
              <div className="conflict" key={d.command}>
                <div className="conflict-main">
                  <div className="conflict-head">
                    <strong>{d.command}</strong>
                    <span className="dim small">{d.reason}</span>
                  </div>
                  <div className="conflict-versions">
                    <span>
                      <span className="dim">{t('Aktif')}: </span>
                      <code>{keep ? `${keep.packageName}@${keep.version}` : '-'}</code>
                    </span>
                    <span>
                      <span className="dim">{t('Gölgede')}: </span>
                      <code>
                        {remove.map((x) => `${x.packageName}@${x.version}`).join(', ') || '-'}
                      </code>
                    </span>
                    {bytes > 0 && <span className="dim">{formatBytes(bytes)}</span>}
                  </div>
                </div>
                <button
                  className="btn"
                  disabled={busy || remove.length === 0}
                  onClick={() => void openPlan(d.removeIds)}
                >
                  {t('Eski sürümü planla')}
                </button>
              </div>
            );
          })}
        </section>
      )}

      <div className="toolbar" style={{ display: inventory || loading ? undefined : 'none' }}>
        <div className="filters">
          {(
            [
              ['unused', 'Atıl'],
              ['unknown', 'Bilinmiyor'],
              ['recent', 'Yakında'],
              ['protected', 'Korunan'],
              ['all', 'Tümü'],
            ] as Array<[Filter, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              className={filter === key ? 'chip active' : 'chip'}
              onClick={() => setFilter(key)}
            >
              {t(label)}
            </button>
          ))}
        </div>
        <div className="select-actions">
          <button className="btn small" onClick={selectAll} disabled={loading}>
            {t('Görünenleri seç')}
          </button>
          <button className="btn small" onClick={() => setSelected(new Set())} disabled={loading}>
            {t('Seçimi temizle')}
          </button>
        </div>
      </div>

      <div className="cli-list" style={{ display: inventory || loading ? undefined : 'none' }}>
        {inventory && !loading && tools.length === 0 && (
          <div className="empty">{t('Aramanla eşleşen küme yok.')}</div>
        )}
        {tools.map((tool) => {
          const isSelected = selected.has(tool.id);
          const canSelect = !loading && selectable(tool);
          const isExpanded = expanded.has(tool.id);
          return (
            <div className={`cluster cli-item ${isExpanded ? 'is-expanded' : ''}`} key={tool.id}>
              <div className="cli-row">
                <label className="cell check" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={!canSelect}
                    onChange={() => toggle(tool.id)}
                    aria-label={`${t('Araç')}: ${tool.command}`}
                  />
                </label>
                <div className="cli-command">
                  <strong>{tool.command}</strong>
                  <span className="dim">
                    {tool.packageName}
                    {tool.version ? `@${tool.version}` : ''}
                    {tool.activeShim === false && (
                      <span className="tag tag-shadowed">{t('Gölgede')}</span>
                    )}
                  </span>
                </div>
                <div className="cli-source">{SOURCE_LABEL[tool.source] ?? tool.source}</div>
                <div className="cli-idle">{idleDaysLabel(tool.idleDays, lang)}</div>
                <div className="cli-size">{formatBytes(tool.totalBytes)}</div>
                <span className={`tag cli-status cli-status-${tool.status}`}>
                  {t(STATUS_LABEL[tool.status])}
                </span>
                <button
                  className="icon-btn"
                  aria-label={isExpanded ? t('Kapat') : t('Kanıtlar')}
                  onClick={() => {
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      if (next.has(tool.id)) next.delete(tool.id);
                      else next.add(tool.id);
                      return next;
                    });
                  }}
                >
                  {isExpanded ? '▾' : '▸'}
                </button>
              </div>

              {isExpanded && (
                <div className="cluster-detail">
                  <div className="detail-grid">
                    <section>
                      <h4>{t('Kanıtlar')}</h4>
                      <ul className="because">
                        {tool.evidence.map((e, i) => (
                          <li key={i}>{e}</li>
                        ))}
                      </ul>
                      <h4>{t('Kaldırma komutu')}</h4>
                      <code>{tool.uninstall?.display ?? t('Bilinmiyor')}</code>
                      <h4>{t('Geri kurulum komutu')}</h4>
                      <code>{reinstallText(tool)}</code>
                      <h4>{t('Yedek')}</h4>
                      {tool.stateDirs.length === 0 ? (
                        <p className="dim">{t('Yedek yok')}</p>
                      ) : (
                        <ul className="targets">
                          {tool.stateDirs.map((d) => (
                            <li key={d}>
                              <code>{shortPath(d)}</code>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                    <section>
                      <h4>{t('Durum')}</h4>
                      <p>
                        {t(STATUS_LABEL[tool.status])} · {t('Son sinyal')}: {idleDaysLabel(tool.idleDays, lang)}
                      </p>
                      <h4>{t('Kaynak')}</h4>
                      <p>
                        {SOURCE_LABEL[tool.source] ?? tool.source} · {shortPath(tool.installPath)}
                      </p>
                      <h4>{t('Sürüm')}</h4>
                      <p>{tool.version || t('Bilinmiyor')}</p>
                    </section>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {results && (
        <div className="cli-results">
          <h3>{t('Kaldırma planı')}</h3>
          <ul>
            {results.results.map((r, i) => (
              <li key={i} className={r.ok ? '' : 'row-failed'}>
                <strong>{r.command}</strong> — {r.ok ? 'ok' : r.manual ? t('Bilinmiyor') : (r.error ?? 'error')}
                {r.backupDir && <div className="dim small">{t('Yedek')}: {r.backupDir}</div>}
                {r.output && <div className="dim small"><code>{r.output}</code></div>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <footer
        className="actionbar cli-actionbar"
        style={{ display: inventory ? undefined : 'none' }}
      >
        <div className="selection-info">
          <strong>{t('{n} araç seçildi', { n: selected.size })}</strong>
          <label className="backup-toggle">
            <input type="checkbox" checked={backup} onChange={(e) => setBackup(e.target.checked)} />
            {t('Yedekle (durum klasörleri)')}
          </label>
        </div>
        <button
          className="btn btn-primary"
          disabled={selected.size === 0 || busy || loading}
          onClick={() => void openPlan()}
        >
          {busy ? t('Başlatılıyor…') : t('Seçilenleri planla')}
        </button>
      </footer>

      {plan && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={t('Kaldırma planı')}>
          <div className="modal">
            <header className="modal-head">
              <h2>{t('Kaldırma planı')}</h2>
              <span className="tag tag-danger">{t('KALICI SİLME')}</span>
            </header>
            <p className="dim">
              {t('{n} araç seçildi', { n: plan.items.length })} · {formatBytes(plan.totalBytes)}
              {plan.backupBytes > 0 ? ` · ${t('Yedek')}: ${formatBytes(plan.backupBytes)}` : ` · ${t('Yedek yok')}`}
            </p>
            <div className="modal-list">
              {plan.items.map((item) => (
                <div className="plan-cluster" key={item.id}>
                  <div className="plan-head">
                    <span className={`tag cli-status-${item.status}`}>{t(STATUS_LABEL[item.status as CliStatus] ?? item.status)}</span>
                    <strong>{item.command}</strong>
                    <span className="dim">
                      {item.packageName}
                      {item.version ? `@${item.version}` : ''}
                    </span>
                    <span className="dim">{SOURCE_LABEL[item.source] ?? item.source}</span>
                  </div>
                  <div className="dim plan-reason">{shortPath(item.installPath)}</div>
                  <ul>
                    <li>
                      <span className="dim">{t('Kaldırma komutu')}:</span> <code>{item.uninstallCommand}</code>
                    </li>
                    <li>
                      <span className="dim">{t('Geri kurulum komutu')}:</span> <code>{item.reinstallCommand}</code>
                    </li>
                    {item.backupPaths.length > 0 && (
                      <li>
                        <span className="dim">{t('Yedek')}:</span> {item.backupPaths.map(shortPath).join(', ')}
                      </li>
                    )}
                    {item.manual && (
                      <li className="row-failed">{t('Bilinmiyor')}: {t('Kaldırma paket yöneticisinin kendisiyle yapılmalı.')}</li>
                    )}
                  </ul>
                </div>
              ))}
            </div>
            <div className="alert alert-danger">
              {t('Kaldırma paket yöneticisinin kendisiyle yapılır; kurulum klasörü elle silinmez.')}
            </div>
            <label className="phrase">
              <span>{t('Onaylamak için SIL yaz:')}</span>
              <input
                type="text"
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                placeholder="SIL"
                disabled={busy}
                autoFocus
              />
            </label>
            <footer className="modal-actions">
              <button className="btn" onClick={() => setPlan(null)} disabled={busy}>
                {t('Vazgeç')}
              </button>
              <button
                className="btn btn-danger"
                disabled={busy || phrase.trim() !== 'SIL'}
                onClick={() => void applyPlan()}
              >
                {busy ? t('Başlatılıyor…') : t('Planı uygula')}
              </button>
            </footer>
          </div>
        </div>
      )}
    </section>
  );
}

const STATUS_LABEL: Record<CliStatus, string> = {
  unused: 'Atıl',
  unknown: 'Bilinmiyor',
  recent: 'Yakında',
  protected: 'Korunan',
};

/** Sunucudaki siralama ile ayni: once atil, sonra bilinmiyor, yakinda, korunan. */
function statusOrder(status: CliStatus): number {
  switch (status) {
    case 'unused':
      return 0;
    case 'unknown':
      return 1;
    case 'recent':
      return 2;
    case 'protected':
      return 3;
  }
}

function idleDaysLabel(days: number, lang: 'tr' | 'en'): string {
  if (!Number.isFinite(days)) return '?';
  const n = Math.max(0, Math.floor(days));
  return lang === 'tr' ? `${n} gün` : `${n} days`;
}

function reinstallText(tool: CliTool): string {
  switch (tool.source) {
    case 'npm-global':
      return `npm install -g ${tool.packageName}${tool.version ? `@${tool.version}` : ''}`;
    case 'uv-tool':
      return `uv tool install ${tool.packageName}${tool.version ? `==${tool.version}` : ''}`;
    case 'dotnet-tool':
      return `dotnet tool install --global ${tool.packageName}${tool.version ? ` --version ${tool.version}` : ''}`;
    case 'pip-user':
      return `python -m pip install ${tool.packageName}${tool.version ? `==${tool.version}` : ''}`;
    case 'standalone':
      return '-';
  }
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
