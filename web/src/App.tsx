import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { groupByVerdict } from '../../src/core/merge.ts';
import { defaultSelected } from '../../src/core/selection.ts';
import { formatBytes, formatCount } from '../../src/util/format.ts';
import type { Cluster, ScanResult } from '../../src/core/types.ts';
import type {
  DeleteMode,
  ExecuteEvent,
  PlanResponse,
  RiskLevel,
  ScanStatusResponse,
  ScanStreamEvent,
  SettingsResponse,
} from '../../src/web/contract.ts';
import {
  ApiError,
  cancelScan,
  createPlan,
  executePlan,
  executeStream,
  getLatest,
  getScanStatus,
  getSettings,
  getToken,
  openRecycleBin,
  scanStream,
  setToken,
  startScan,
  updateSettings,
} from './api.ts';
import { CliView } from './components/CliView.tsx';
import { ClusterRow } from './components/ClusterRow.tsx';
import { ConfirmDialog } from './components/ConfirmDialog.tsx';
import { ProgressPanel } from './components/ProgressPanel.tsx';
import { ScanStatusBar } from './components/ScanStatusBar.tsx';
import { useI18n } from './i18n.tsx';
import { VERDICT_HINT } from './labels.ts';

type Phase = 'idle' | 'scanning' | 'review' | 'planning' | 'confirm' | 'deleting' | 'done';
type KindFilter = 'all' | 'recommend' | 'ask' | 'report-only' | 'keep' | 'git';
type SortMode = 'size' | 'risk' | 'recent' | 'name';

/** Risk siralama: once yuksek risk, en sonda guvenli. */
const RISK_ORDER: Record<RiskLevel, number> = { high: 0, medium: 1, low: 2, safe: 3 };

interface DeletingState {
  index: number;
  total: number;
  label: string;
  path: string;
  freed: number;
  skipped: number;
  failed: number;
  elapsedMs: number;
}

interface DoneState {
  freed: number;
  removed: number;
  skipped: number;
  failed: number;
  journalPath: string;
  mode: DeleteMode;
  rows: Array<{ label: string; bytes: number; note: string; ok: boolean }>;
}

/** Tarama surerken: tum alanlar, o an tarananlar, bitenler ve bulunanlar. */
interface LiveScan {
  paths: string[];
  found: Array<{ path: string; cluster: Cluster }>;
  active: string[];
  finished: string[];
}

/** Tarama bitince gosterilen onay diyalogu; "Tamam" ile listeye gecilir. */
interface ScanDoneInfo {
  clusters: number;
  totalBytes: number;
  reclaimableBytes: number;
  durationMs: number;
}

const SECTION_ORDER: Array<{ key: 'recommend' | 'ask' | 'report-only' | 'keep'; title: string }> = [
  { key: 'recommend', title: 'Önerilen' },
  { key: 'ask', title: 'Doğrulama' },
  { key: 'report-only', title: 'Rapor' },
  { key: 'keep', title: 'Korunuyor' },
];

/** Disk listesinin sekmeleri: tek listede kategori secimi. */
const LIST_TABS: Array<{ key: KindFilter; title: string }> = [
  { key: 'all', title: 'Tümü' },
  ...SECTION_ORDER.map((s) => ({ key: s.key, title: s.title })),
  { key: 'git', title: 'Git' },
];

export default function App() {
  const { t, lang, setLang } = useI18n();
  const [tokenReady, setTokenReady] = useState<boolean>(() => !!getToken());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [view, setView] = useState<'disk' | 'cli'>('disk');


  const [phase, setPhase] = useState<Phase>('idle');
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [projectRoot, setProjectRoot] = useState<string>('');
  const [pickerOpen, setPickerOpen] = useState<boolean>(false);
  const [pickerPath, setPickerPath] = useState<string>('');
  const [pickerDirs, setPickerDirs] = useState<Array<{ name: string; path: string }>>([]);
  const [pickerLoading, setPickerLoading] = useState<boolean>(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [pickerParent, setPickerParent] = useState<string | null>(null);
  /** Yarisan klasor istekleri: ekrana yalnizca son cevap yazilir. */
  const pickerSeq = useRef(0);

  const loadPicker = useCallback(async (path: string) => {
    const seq = ++pickerSeq.current;
    setPickerLoading(true);
    setPickerError(null);
    try {
      const token = getToken();
      const res = await fetch(`/api/fs/dirs?path=${encodeURIComponent(path)}`, {
        headers: token ? { 'x-clicleaner-token': token } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        path: string;
        parent: string | null;
        dirs: Array<{ name: string; path: string }>;
      };
      if (seq !== pickerSeq.current) return;
      setPickerPath(data.path);
      setPickerDirs(data.dirs ?? []);
      setPickerParent(data.parent);
    } catch (e) {
      if (seq !== pickerSeq.current) return;
      setPickerError(e instanceof Error ? e.message : String(e));
    } finally {
      if (seq === pickerSeq.current) setPickerLoading(false);
    }
  }, []);

  const openPicker = useCallback(() => {
    setPickerOpen(true);
    void loadPicker(pickerPath || projectRoot || '');
  }, [loadPicker, pickerPath, projectRoot]);

  const [lastScanAt, setLastScanAt] = useState<number | null>(null);
  const [scanId, setScanId] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState({ done: 0, total: 0, bytes: 0 });
  const [scanLive, setScanLive] = useState<LiveScan>({
    paths: [],
    found: [],
    active: [],
    finished: [],
  });
  const [scanDone, setScanDone] = useState<ScanDoneInfo | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('size');
  /** Ayni anda gosterilen satir sayisi: liste sonsuza uzamasin. */
  const [listLimit, setListLimit] = useState(30);
  const [mode, setMode] = useState<DeleteMode>('recycle');

  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [deleting, setDeleting] = useState<DeletingState | null>(null);
  const [done, setDone] = useState<DoneState | null>(null);
  const [scanStatus, setScanStatus] = useState<ScanStatusResponse | null>(null);
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hoursDraft, setHoursDraft] = useState('24');

  const streamRef = useRef<EventSource | null>(null);

  const closeStream = useCallback(() => {
    streamRef.current?.close();
    streamRef.current = null;
  }, []);

  const notify = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => {
      setNotice(null);
      noticeTimer.current = null;
    }, 6000);
  }, []);

  const dismissNotice = useCallback(() => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = null;
    setNotice(null);
  }, []);

  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    [],
  );

  const refreshScanStatus = useCallback(async () => {
    try {
      setScanStatus(await getScanStatus());
    } catch {
      /* durum alinamadi: bant gizli kalir */
    }
  }, []);

  const openSettings = useCallback(async () => {
    try {
      const s = await getSettings();
      setSettings(s);
      setHoursDraft(String(s.scanCacheHours));
    } catch (e) {
      setError(errText(e));
    }
    setSettingsOpen(true);
  }, []);

  const saveHours = useCallback(async () => {
    const n = Number(hoursDraft);
    if (!Number.isFinite(n)) return;
    try {
      const s = await updateSettings(n);
      setSettings(s);
      setSettingsOpen(false);
      await refreshScanStatus();
      notify(t('Ayarlar kaydedildi.'));
    } catch (e) {
      setError(errText(e));
    }
  }, [hoursDraft, refreshScanStatus, notify, t]);

  const showPreviousScan = useCallback(async () => {
    if (scan) {
      setPhase('review');
      return;
    }
    try {
      const latest = await getLatest();
      if (!latest.scan) return;
      setScan(latest.scan);
      setScanId(null);
      setSelected(defaultSelection(latest.scan));
      setLastScanAt(latest.at ?? latest.scan.finishedAt);
      setPhase('review');
    } catch (e) {
      setError(errText(e));
    }
  }, [scan]);

  // Tarama tamamlandi diyalogu: Enter/Esc ile de kapanir.
  useEffect(() => {
    if (!scanDone) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault();
        setScanDone(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [scanDone]);

  const beginScan = useCallback(async (rootOverride?: string) => {
    // Proje taramasi: secilen kok korunur. Argumansiz cagri = tam
    // tarama; onceki proje koku temizlenir (ust bar yaniltici olmasin).
    const root = rootOverride?.trim() || '';
    setProjectRoot(root);
    closeStream();
    setError(null);
    setNotice(null);
    setScan(null);
    setScanId(null);
    setPlan(null);
    setDone(null);
    setDeleting(null);
    setSelected(new Set());
    setExpanded(new Set());
    setScanProgress({ done: 0, total: 0, bytes: 0 });
    setScanLive({ paths: [], found: [], active: [], finished: [] });
    setScanDone(null);
    setPhase('scanning');

    try {
      let id: string;
      try {
        const r = await startScan({
          envs: ['dotfolders', 'localappdata', 'roamingappdata'],
          root: root || undefined,
        });
        id = r.scanId;
      } catch (e) {
        // Ayni anda calisan tarama varsa ona baglan.
        if (e instanceof ApiError && e.status === 409 && e.body.scanId) {
          id = e.body.scanId;
        } else {
          throw e;
        }
      }

      setScanId(id);
      const es = scanStream(id);
      streamRef.current = es;
      let finished = false;

      es.onmessage = (ev) => {
        let data: ScanStreamEvent;
        try {
          data = JSON.parse(ev.data) as ScanStreamEvent;
        } catch {
          return;
        }
        if (data.type === 'targets') {
          // Sol sutun: taranacak dizinlerin tam listesi.
          setScanLive((prev) => ({ ...prev, paths: data.paths }));
        } else if (data.type === 'target-start') {
          // Ayni anda 6 dizin taranir; hangileri oldugu gorunur.
          setScanLive((prev) =>
            prev.active.includes(data.path)
              ? prev
              : { ...prev, active: [...prev.active, data.path] },
          );
        } else if (data.type === 'target-done') {
          setScanLive((prev) => {
            const active = prev.active.filter((p) => p !== data.path);
            const finishedPaths = prev.finished.includes(data.path)
              ? prev.finished
              : [...prev.finished, data.path];
            const alreadyFound = prev.found.some((f) => f.path === data.path);
            if (!data.cluster || alreadyFound) {
              return { ...prev, active, finished: finishedPaths };
            }
            return {
              ...prev,
              found: [...prev.found, { path: data.path, cluster: data.cluster }],
              active,
              finished: finishedPaths,
            };
          });
        } else if (data.type === 'progress') {
          setScanProgress({ done: data.done, total: data.total, bytes: data.bytes });
        } else if (data.type === 'done') {
          finished = true;
          closeStream();
          setScanLive({ paths: [], found: [], active: [], finished: [] });
          setScan(data.result);
          setSelected(defaultSelection(data.result));
          setLastScanAt(Date.now());
          void refreshScanStatus();
          setPhase('review');
          // Proje taramasi rapor-only'dir; bunu sessizce yapmayalim.
          if (root) notify(t('Proje taraması salt rapordur; silme hedefi üretilmez.'));
          // Kalici bir isaret degil: "Tamam" denince liste gorunur.
          setScanDone({
            clusters: data.result.clusters.length,
            totalBytes: data.result.clusters.reduce((a, c) => a + c.totalBytes, 0),
            reclaimableBytes: data.result.clusters.reduce((a, c) => a + c.reclaimableBytes, 0),
            durationMs: data.result.finishedAt - data.result.startedAt,
          });
        } else if (data.type === 'cancelled') {
          finished = true;
          closeStream();
          setScanLive({ paths: [], found: [], active: [], finished: [] });
          notify(t('Tarama iptal edildi.'));
          setPhase('idle');
        } else if (data.type === 'error') {
          finished = true;
          closeStream();
          setScanLive({ paths: [], found: [], active: [], finished: [] });
          setError(data.message);
          setPhase('review');
        }
      };

      es.onerror = () => {
        if (finished) return;
        closeStream();
        setError('Tarama bağlantısı koptu. Yeniden taramayı dene.');
        setPhase('review');
      };
    } catch (e) {
      setError(errText(e));
      setPhase('review');
    }
  }, [closeStream, t, notify]);

  const cancelCurrentScan = useCallback(async () => {
    if (!scanId) return;
    notify(t('İptal ediliyor…'));
    try {
      await cancelScan(scanId);
    } catch (e) {
      setError(errText(e));
      setNotice(null);
    }
  }, [scanId, t, notify]);

  // Ilk acilista TARAMA YAPILMAZ. Sunucu 24 saatten yeni bir sonuc
  // donduruyorsa dogrudan gosterilir (diskteki onbellek); yoksa
  // kullanici "Incele"ye basana kadar beklenir.
  useEffect(() => {
    if (!tokenReady) return;
    let alive = true;
    void refreshScanStatus();
    getSettings()
      .then((s) => {
        if (alive) setSettings(s);
      })
      .catch(() => {
        /* ayar alinamadi */
      });
    (async () => {
      try {
        const latest = await getLatest();
        if (!alive) return;
        if (latest.scan) {
          setScan(latest.scan);
          setScanId(null);
          setSelected(defaultSelection(latest.scan));
          setLastScanAt(latest.at ?? latest.scan.finishedAt);
          setPhase('review');
        }
      } catch (e) {
        if (alive) setError(errText(e));
      }
    })();
    return () => {
      alive = false;
      closeStream();
    };
  }, [tokenReady, closeStream, refreshScanStatus]);

  // Sekme, arama veya siralama degisince ilk 30 kayda don.
  useEffect(() => {
    setListLimit(30);
  }, [kindFilter, filter, sortMode]);

  const groups = useMemo(() => (scan ? groupByVerdict(scan.clusters) : null), [scan]);

  const activeItems = useMemo(() => {
    if (!scan) return [];
    const f = filter.trim().toLowerCase();
    const match = (c: Cluster) =>
      !f ||
      c.title.toLowerCase().includes(f) ||
      c.key.toLowerCase().includes(f) ||
      c.verdict.what.toLowerCase().includes(f) ||
      c.parts.some((p) => p.path.toLowerCase().includes(f));

    let base: Cluster[];
    if (kindFilter === 'all') base = scan.clusters;
    else if (kindFilter === 'git') base = scan.clusters.filter((c) => (c.evidence.markers ?? []).includes('git-tracked'));
    else base = (groups?.[kindFilter] ?? []);
    return [...base].filter(match).sort((a, b) => compareClusters(a, b, sortMode));
  }, [scan, groups, filter, kindFilter, sortMode]);

  // Uzayan liste yerine kademeli gosterim: once ilk 30 kayit.
  const shownItems = activeItems.slice(0, listLimit);

  const selectedClusters = useMemo(
    () => (scan?.clusters ?? []).filter((c) => selected.has(c.key)),
    [scan, selected],
  );
  const selectedBytes = useMemo(
    () => selectedClusters.reduce((a, c) => a + c.reclaimableBytes, 0),
    [selectedClusters],
  );
  const targetCount = useMemo(
    () => selectedClusters.reduce((a, c) => a + (c.deleteTargets?.length ?? 0), 0),
    [selectedClusters],
  );

  const toggleSelect = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleExpand = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectVisible = useCallback(
    (on: boolean) => {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const c of activeItems) {
          const selectable = c.verdict.kind !== 'report-only' && (c.deleteTargets?.length ?? 0) > 0;
          if (!selectable) continue;
          if (on) next.add(c.key);
          else next.delete(c.key);
        }
        return next;
      });
    },
    [activeItems],
  );

  const openPlan = useCallback(async () => {
    if (!scan || selected.size === 0) return;
    setError(null);
    setPhase('planning');
    try {
      const p = await createPlan({
        scanId: scanId ?? undefined,
        keys: [...selected],
        mode,
      });
      setPlan(p);
      setPhase('confirm');
    } catch (e) {
      setError(errText(e));
      setPhase('review');
    }
  }, [scan, scanId, selected, mode]);

  const confirmDelete = useCallback(
    async (phrase: string, acknowledgeHigh: boolean) => {
      if (!plan) return;
      setError(null);
      setPhase('deleting');
      setDeleting({
        index: 0,
        total: plan.plan.targets.length,
        label: 'Hazırlanıyor…',
        path: '',
        freed: 0,
        skipped: 0,
        failed: 0,
        elapsedMs: 0,
      });

      try {
        const { jobId } = await executePlan({
          planId: plan.planId,
          phrase,
          acknowledgeHigh,
        });
        const es = executeStream(jobId);
        streamRef.current = es;

        const rows: DoneState['rows'] = [];
        const planTargets = plan.plan.targets;
        let finished = false;

        es.onmessage = (ev) => {
          let data: ExecuteEvent;
          try {
            data = JSON.parse(ev.data) as ExecuteEvent;
          } catch {
            return;
          }

          if (data.type === 'start') {
            setDeleting((d) =>
              d ? { ...d, total: data.total, index: 0, label: 'Başlıyor…' } : d,
            );
          } else if (data.type === 'target-start') {
            setDeleting((d) =>
              d
                ? {
                    ...d,
                    index: data.index,
                    label: data.label,
                    path: data.path,
                    elapsedMs: 0,
                  }
                : d,
            );
          } else if (data.type === 'heartbeat') {
            setDeleting((d) => (d ? { ...d, elapsedMs: data.elapsedMs } : d));
          } else if (data.type === 'target-done') {
            const target = planTargets[data.index];
            rows.push({
              label: target?.target.label ?? `Hedef ${data.index + 1}`,
              bytes: data.bytesFreed,
              note:
                data.failed > 0
                  ? `${data.failed} hata`
                  : data.skipped > 0
                    ? `${data.skipped} atlandı`
                    : 'ok',
              ok: data.failed === 0,
            });
            setDeleting((d) =>
              d
                ? {
                    ...d,
                    index: data.index + 1,
                    freed: d.freed + data.bytesFreed,
                    skipped: d.skipped + data.skipped,
                    failed: d.failed + data.failed,
                  }
                : d,
            );
          } else if (data.type === 'done') {
            finished = true;
            closeStream();
            setDone({
              freed: data.freed,
              removed: data.removed,
              skipped: data.skipped,
              failed: data.failed,
              journalPath: data.journalPath,
              mode: data.mode,
              rows,
            });
            setPlan(null);
            setDeleting(null);
            // Disk degisti: tarama sonucu artik "eski".
            void refreshScanStatus();
            setPhase('done');
          } else if (data.type === 'error') {
            finished = true;
            closeStream();
            setError(data.message);
            setPlan(null);
            setDeleting(null);
            setPhase('done');
          }
        };

        es.onerror = () => {
          if (finished) return;
          closeStream();
          setError('Silme bağlantısı koptu. Günlüğü kontrol et.');
          setPlan(null);
          setDeleting(null);
          setPhase('done');
        };
      } catch (e) {
        setError(errText(e));
        setPlan(null);
        setPhase('review');
      }
    },
    [plan, closeStream],
  );

  const openRecycle = useCallback(async () => {
    try {
      await openRecycleBin();
    } catch (e) {
      setError(errText(e));
    }
  }, []);

  if (!tokenReady) {
    return (
      <TokenScreen
        onSubmit={(value) => {
          setToken(value);
          setTokenReady(true);
        }}
      />
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">CLICleaner</span>
          <span className="dim">{t('kanıt görünür, silme onaylı')}</span>
        </div>

        <nav className="view-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={view === 'disk'}
            className={view === 'disk' ? 'active' : ''}
            onClick={() => setView('disk')}
            disabled={phase === 'deleting'}
          >
            {t('Disk')}
          </button>
          <button
            role="tab"
            aria-selected={view === 'cli'}
            className={view === 'cli' ? 'active' : ''}
            onClick={() => {
              // CliView yeniden mount olacagi icin ust bar durumunu sifirla.
              setView('cli');
            }}
            disabled={phase === 'deleting'}
          >
            {t("CLI'lar")}
          </button>
        </nav>

        <div className="top-actions">
          <div className="lang-switch" role="group" aria-label={t('Dil')}>
            <button className={lang === 'tr' ? 'active' : ''} onClick={() => setLang('tr')}>
              TR
            </button>
            <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>
              EN
            </button>
          </div>
          {view === 'disk' && projectRoot && (
            <span className="dim" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={projectRoot}>
              {projectRoot}
            </span>
          )}

          {view === 'disk' && (
            <button
              className="btn"
              onClick={() => void beginScan()}
              disabled={phase === 'scanning' || phase === 'deleting'}
              title={t('İncele (tüm yapıyı tara)')}
            >
              {scan ? t('Yeniden tara') : t('İncele')}
            </button>
          )}

          {view === 'disk' && (
            <button
              className="btn btn-primary"
              onClick={openPicker}
              disabled={phase === 'scanning' || phase === 'deleting'}
              title={t('Projeyi tara (klasör seç ve tara)')}
            >
              {t('Projeyi Tara')}
            </button>
          )}

          {view === 'disk' && (
            <div className="mode-switch" role="group" aria-label={t('Silme modu')}>
              <button
                className={mode === 'recycle' ? 'active' : ''}
                onClick={() => setMode('recycle')}
                disabled={phase === 'deleting'}
                title={t('Aracın kendi kasasına taşınır; geri alınabilir')}
              >
                {t('Kasaya taşı')}
              </button>
              <button
                className={mode === 'purge' ? 'active danger' : 'danger'}
                onClick={() => setMode('purge')}
                disabled={phase === 'deleting'}
                title={t('Kalıcı silme; geri alınamaz')}
              >
                {t('Kalıcı sil')}
              </button>
            </div>
          )}
        </div>
      </header>

      {error && (
        <div className="alert alert-danger">
          <span>{error}</span>
          <button className="icon-btn" onClick={() => setError(null)} aria-label={t('Kapat')}>
            ×
          </button>
        </div>
      )}

      {notice && (
        <div className="alert alert-info" role="status">
          <span>{notice}</span>
          <button className="icon-btn" onClick={dismissNotice} aria-label={t('Kapat')}>
            ×
          </button>
        </div>
      )}

      {phase !== 'deleting' && (
        <ScanStatusBar
          status={scanStatus}
          hasPrevious={!!scan || scanStatus?.lastScanAt != null}
          onShowPrevious={() => void showPreviousScan()}
          onRescan={() => void beginScan()}
          onOpenSettings={() => void openSettings()}
        />
      )}

      {view === 'disk' && (
        <>
      {phase === 'idle' && (
        <section className="idle-hero">
          <h1>{t('Disk incelemesi')}</h1>
          <p className="dim">
            {t(
              'Diskini tarar, hangi klasörün ne olduğunu kanıtlarıyla gösterir; hiçbir şeyi sen onaylamadan silmez.',
            )}
          </p>
          <button className="btn btn-primary" onClick={() => void beginScan()}>
            {t('İncele')}
          </button>

          <p className="dim small">{t('Hiçbir şey sen onaylamadan silinmez.')}</p>
        </section>
      )}

      {phase === 'scanning' && (
        <ProgressPanel
          kind="scan"
          {...scanProgress}
          paths={scanLive.paths}
          found={scanLive.found}
          active={scanLive.active}
          finished={scanLive.finished}
          onCancel={() => void cancelCurrentScan()}
        />
      )}

      {phase === 'planning' && (
        <div className="overlay">
          <div className="overlay-card">
            <h3>{t('Plan hazırlanıyor…')}</h3>
            <p className="dim">{t('Seçilen kümeler ve silinecek yollar doğrulanıyor.')}</p>
          </div>
        </div>
      )}

      {scanDone && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={t('Tarama tamamlandı')}
        >
          <div className="modal done-modal">
            <div className="done-check" aria-hidden="true">
              ✓
            </div>
            <h2>{t('Tarama tamamlandı')}</h2>
            <p className="dim">
              {t('{n} küme · {duration}s', {
                n: scanDone.clusters,
                duration: (scanDone.durationMs / 1000).toFixed(1),
              })}
            </p>
            <p>
              <strong>{formatBytes(scanDone.totalBytes)}</strong>{' '}
              <span className="dim">{t('tarandı')}</span> ·{' '}
              <strong className="green">{formatBytes(scanDone.reclaimableBytes)}</strong>{' '}
              <span className="dim">{t('silinebilir')}</span>
            </p>
            <footer className="modal-actions">
              <button className="btn btn-primary" autoFocus onClick={() => setScanDone(null)}>
                {t('Tamam')}
              </button>
            </footer>
          </div>
        </div>
      )}

      {scan && phase !== 'scanning' && (
        <>
          {lastScanAt && (
            <div className="scan-note dim small">
              {t('Son inceleme: {date}', {
                date: new Date(lastScanAt).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US'),
              })}
            </div>
          )}
          <Summary scan={scan} selectedBytes={selectedBytes} targetCount={targetCount} clusterCount={selectedClusters.length} />

          <div className="toolbar">
            <input
              className="search"
              type="search"
              placeholder={t('Ara: başlık, anahtar, yol…')}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <label className="sort-select">
              <span className="dim small">{t('Sırala')}</span>
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
              >
                <option value="size">{t('Boyut (büyük → küçük)')}</option>
                <option value="risk">{t('Risk (yüksek → güvenli)')}</option>
                <option value="recent">{t('Son hareket (yeni → eski)')}</option>
                <option value="name">{t('Ad (A → Z)')}</option>
              </select>
            </label>
            <div className="select-actions">
              <button className="btn small" onClick={() => selectVisible(true)} disabled={phase === 'deleting'}>
                {t('Görünenleri seç')}
              </button>
              <button className="btn small" onClick={() => selectVisible(false)} disabled={phase === 'deleting'}>
                {t('Seçimi temizle')}
              </button>
            </div>
          </div>

          <div className="list-tabs" role="tablist" aria-label={t('Kategoriler')}>
            {LIST_TABS.map((s) => (
              <button
                key={s.key}
                role="tab"
                aria-selected={kindFilter === s.key}
                className={`list-tab list-tab-${s.key} ${kindFilter === s.key ? 'active' : ''}`}
                onClick={() => setKindFilter(s.key)}
              >
                {t(s.title)}
                <span className="tab-count">
                  {s.key === 'all'
                    ? scan.clusters.length
                    : s.key === 'git'
                      ? scan.clusters.filter((c) => (c.evidence.markers ?? []).includes('git-tracked')).length
                      : (groups?.[s.key]?.length ?? 0)}
                </span>
              </button>
            ))}
          </div>

          <main className="sections">
            {activeItems.length === 0 && (
              <div className="empty">
                {scan.clusters.length === 0
                  ? t('Taranacak klasör bulunamadı.')
                  : t('Aramanla eşleşen küme yok.')}
              </div>
            )}
            {activeItems.length > 0 && (
              <section className={`section section-${kindFilter}`}>
                <div className="section-head">
                  <h2>{t(LIST_TABS.find((x) => x.key === kindFilter)?.title ?? 'Tümü')}</h2>
                  <span className="dim">
                    {t('{n} küme', { n: activeItems.length })} ·{' '}
                    {kindFilter === 'all'
                      ? t('Tüm kategoriler')
                      : t(VERDICT_HINT[kindFilter] ?? '')}
                  </span>
                </div>
                {shownItems.map((c) => {
                  const selectable = c.verdict.kind !== 'report-only' && (c.deleteTargets?.length ?? 0) > 0;
                  return (
                    <ClusterRow
                      key={c.key}
                      cluster={c}
                      selected={selected.has(c.key)}
                      expanded={expanded.has(c.key)}
                      selectable={selectable}
                      onToggle={() => toggleSelect(c.key)}
                      onExpand={() => toggleExpand(c.key)}
                    />
                  );
                })}
                {activeItems.length > shownItems.length && (
                  <div className="list-more">
                    <button className="btn" onClick={() => setListLimit((n) => n + 30)}>
                      {t('Daha fazla göster ({n})', {
                        n: activeItems.length - shownItems.length,
                      })}
                    </button>
                  </div>
                )}
              </section>
            )}
          </main>

          <footer className="actionbar">
            <div className="selection-info">
              <strong>{formatBytes(selectedBytes)}</strong>
              <span className="dim">
                {' '}
                {t('seçili · {clusters} küme · {targets} hedef', {
                  clusters: selectedClusters.length,
                  targets: targetCount,
                })}
              </span>
            </div>
            <button
              className="btn btn-primary"
              disabled={selected.size === 0 || phase === 'planning' || phase === 'deleting'}
              onClick={() => void openPlan()}
            >
              {t('Planla ve onayla')}
            </button>
          </footer>
        </>
      )}

      {plan && phase === 'confirm' && (
        <ConfirmDialog plan={plan} busy={false} onCancel={() => { setPlan(null); setPhase('review'); }} onConfirm={(p, a) => void confirmDelete(p, a)} />
      )}

      {phase === 'deleting' && deleting && (
        <ProgressPanel
          kind="delete"
          index={deleting.index}
          total={deleting.total}
          label={deleting.label}
          path={deleting.path}
          freed={deleting.freed}
          skipped={deleting.skipped}
          failed={deleting.failed}
          elapsedMs={deleting.elapsedMs}
        />
      )}

      {phase === 'done' && done && (
        <DoneView
          done={done}
          onRescan={() => void beginScan()}
          onOpenRecycle={() => void openRecycle()}
        />
      )}
        </>
      )}

      {/*
        CliView HER ZAMAN bagli kalir; yalnizca gizlenir. Aksi halde
        Disk sekmesine gidip donunce envanter, filtreler ve bulunan
        araclar sifirlaniyordu.
      */}
      <div style={{ display: view === 'cli' ? undefined : 'none' }}>
        <CliView onError={setError} onNotice={notify} />
      </div>

      {settingsOpen && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={t('Ayarlar')}
          onClick={() => setSettingsOpen(false)}
        >
          <div className="modal modal-small" onClick={(e) => e.stopPropagation()}>
            <header className="modal-head">
              <h2>{t('Ayarlar')}</h2>
              <button
                className="icon-btn"
                onClick={() => setSettingsOpen(false)}
                aria-label={t('Kapat')}
              >
                ×
              </button>
            </header>
            <label className="settings-field">
              <span>{t('Tarama önbelleği (saat)')}</span>
              <input
                type="number"
                min={settings?.minCacheHours ?? 1}
                max={settings?.maxCacheHours ?? 720}
                value={hoursDraft}
                onChange={(e) => setHoursDraft(e.target.value)}
                autoFocus
              />
              <span className="dim small">
                {t(
                  'Son tarama bu süre içinde güncel sayılır. Varsayılan 24 saat; tarama hiçbir zaman engellenmez.',
                )}
              </span>
            </label>
            <footer className="modal-actions">
              <button className="btn" onClick={() => setSettingsOpen(false)}>
                {t('İptal')}
              </button>
              <button
                className="btn btn-primary"
                disabled={!Number.isFinite(Number(hoursDraft))}
                onClick={() => void saveHours()}
              >
                {t('Kaydet')}
              </button>
            </footer>
          </div>
        </div>
      )}

      {pickerOpen && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={t('Proje klasörü seç')}
          onClick={() => setPickerOpen(false)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <header className="modal-head">
              <h2>{t('Proje klasörü seç')}</h2>
              <button
                className="icon-btn"
                onClick={() => setPickerOpen(false)}
                aria-label={t('Kapat')}
              >
                ×
              </button>
            </header>
            <p className="modal-lead dim">
              {t('Seçilen klasörün doğrudan alt klasörleri taranacak (proje kökünü seçin).')}
            </p>
            <div className="picker-path" title={pickerPath}>
              {pickerPath || t('Yükleniyor...')}
            </div>
            {pickerError && <div className="error">{pickerError}</div>}
            <div className="modal-list picker-list">
              {pickerLoading && <div className="dim">{t('Yükleniyor...')}</div>}
              {!pickerLoading && pickerDirs.length === 0 && (
                <div className="dim">{t('Alt klasör yok')}</div>
              )}
              {!pickerLoading &&
                pickerDirs.map((d) => (
                  <button
                    key={d.path}
                    type="button"
                    className="picker-item"
                    onClick={() => void loadPicker(d.path)}
                  >
                    {d.name}
                  </button>
                ))}
            </div>
            <footer className="modal-actions">
              {pickerParent && (
                <button className="btn small" onClick={() => void loadPicker(pickerParent)}>
                  {t('Üst klasör')}
                </button>
              )}
              <button className="btn" onClick={() => setPickerOpen(false)}>
                {t('İptal')}
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  const root = pickerPath.trim();
                  setPickerOpen(false);
                  if (root) void beginScan(root);
                }}
              >
                {t('Seç ve Tara')}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}

/** Liste siralamasi: boyut, risk, son hareket veya ad. */
function compareClusters(a: Cluster, b: Cluster, mode: SortMode): number {
  switch (mode) {
    case 'risk': {
      const d = RISK_ORDER[a.verdict.risk] - RISK_ORDER[b.verdict.risk];
      return d !== 0 ? d : b.reclaimableBytes - a.reclaimableBytes;
    }
    case 'recent':
      return b.lastTouched - a.lastTouched;
    case 'name':
      return a.title.localeCompare(b.title);
    case 'size':
    default:
      return b.reclaimableBytes - a.reclaimableBytes;
  }
}

function defaultSelection(result: ScanResult): Set<string> {
  const out = new Set<string>();
  for (const c of result.clusters) {
    if (defaultSelected(c)) out.add(c.key);
  }
  return out;
}

function errText(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return e instanceof Error ? e.message : String(e);
}

function Summary({
  scan,
  selectedBytes,
  targetCount,
  clusterCount,
}: {
  scan: ScanResult;
  selectedBytes: number;
  targetCount: number;
  clusterCount: number;
}) {
  const { t } = useI18n();
  const total = scan.clusters.reduce((a, c) => a + c.totalBytes, 0);
  const reclaim = scan.clusters.reduce((a, c) => a + c.reclaimableBytes, 0);
  const rec = scan.clusters.filter((c) => c.verdict.kind === 'recommend').length;
  const ask = scan.clusters.filter((c) => c.verdict.kind === 'ask').length;
  const ro = scan.clusters.filter((c) => c.verdict.kind === 'report-only').length;
  const files = scan.clusters.reduce((a, c) => a + c.parts.reduce((b, p) => b + p.files, 0), 0);

  return (
    <section className="summary">
      <div className="card">
        <span className="card-label">{t('Taranan')}</span>
        <strong>{formatBytes(total)}</strong>
        <span className="dim">
          {t('{files} dosya · {clusters} küme', {
            files: formatCount(files),
            clusters: scan.clusters.length,
          })}
        </span>
      </div>
      <div className="card">
        <span className="card-label">{t('Silinebilir')}</span>
        <strong className="green">{formatBytes(reclaim)}</strong>
        <span className="dim">{t('yeniden üretilebilir veya kullanılamaz')}</span>
      </div>
      <div className="card">
        <span className="card-label">{t('Seçili')}</span>
        <strong>{formatBytes(selectedBytes)}</strong>
        <span className="dim">
          {t('{clusters} küme · {targets} hedef', {
            clusters: clusterCount,
            targets: targetCount,
          })}
        </span>
      </div>
      <div className="card">
        <span className="card-label">{t('Kararlar')}</span>
        <strong>{rec + ask}</strong>
        <span className="dim">
          {t('{rec} önerilen · {ask} doğrulama · {ro} rapor', { rec, ask, ro })}
        </span>
      </div>
    </section>
  );
}

function DoneView({
  done,
  onRescan,
  onOpenRecycle,
}: {
  done: DoneState;
  onRescan: () => void;
  onOpenRecycle: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="done">
      <div className="done-card">
        <h2>{t('Tamamlandı')}</h2>
        <p className="big green">
          {done.mode === 'purge'
            ? t('{bytes} boşaltıldı', { bytes: formatBytes(done.freed) })
            : t('{bytes} kasaya taşındı', { bytes: formatBytes(done.freed) })}
        </p>
        <p className="dim">
          {t('{n} dosya/klasör işlendi', { n: done.removed })}
          {done.skipped > 0 ? ` ${t('· {n} atlandı', { n: done.skipped })}` : ''}
          {done.failed > 0 ? ` ${t('· {n} hata', { n: done.failed })}` : ''}
        </p>
        {done.mode === 'purge' ? (
          <div className="alert alert-danger">{t('Kalıcı silindi; geri alınamaz.')}</div>
        ) : (
          <div className="alert alert-info">
            {t('Kasada. Geri almak için kasayı aç veya {cmd} kullan.', {
              cmd: 'clicleaner undo --restore',
            })}
          </div>
        )}
        {done.journalPath && (
          <p className="dim small">
            {t('Günlük:')} <code>{done.journalPath}</code>
          </p>
        )}
        {done.rows.length > 0 && (
          <ul className="done-rows">
            {done.rows.map((r, i) => (
              <li key={i} className={r.ok ? '' : 'row-failed'}>
                <span>{r.ok ? '✓' : '✗'}</span>
                <span className="grow">{r.label}</span>
                <span>{formatBytes(r.bytes)}</span>
                <span className="dim">{r.note}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="done-actions">
          <button className="btn" onClick={onRescan}>
            {t('Yeni tarama')}
          </button>
          {done.mode === 'recycle' && (
            <button className="btn btn-primary" onClick={onOpenRecycle}>
              {t('Kasayı aç')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function TokenScreen({ onSubmit }: { onSubmit: (value: string) => void }) {
  const { t } = useI18n();
  const [value, setValue] = useState('');
  return (
    <div className="token-screen">
      <div className="token-card">
        <h1>CLICleaner</h1>
        <p className="dim">
          {t(
            'Web arayüzü her başlatmada rastgele bir bağlantı üretir. Terminalde yazan adresi açtıysan bu adımı atlayabilirsin; olmadıysa tokeni buraya yapıştır.',
          )}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim()) onSubmit(value.trim());
          }}
        >
          <input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Token"
            autoFocus
          />
          <button className="btn btn-primary" type="submit">
            {t('Bağlan')}
          </button>
        </form>
        <p className="dim small">
          {t('Bağlantıyı yeniden üretmek için terminalde {cmd} komutunu çalıştır.', {
            cmd: 'clicleaner ui --web',
          })}
        </p>
      </div>
    </div>
  );
}
