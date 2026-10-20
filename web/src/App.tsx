import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { groupByVerdict } from '../../src/core/merge.ts';
import { DefaultSelection } from '../../src/core/selection.ts';
import { formatBytes } from '../../src/util/format.ts';
import type { ScanResult } from '../../src/core/types.ts';
import type {
  DeleteMode,
  DesktopShortcutView,
  ExecuteEvent,
  FindingView,
  PlanResponse,
  ScanStatusResponse,
  ScanStreamEvent,
  SettingsResponse,
} from '../../src/web/contract.ts';
import {
  ApiError,
  cancelScan,
  createDesktopShortcut,
  createPlan,
  deleteDesktopShortcut,
  executePlan,
  executeStream,
  getDesktopShortcut,
  getLatest,
  getScanStatus,
  getSettings,
  getToken,
  scanStream,
  setToken,
  startScan,
  updateSettings,
} from './api.ts';
import { ApprovalWall } from './components/ApprovalWall.tsx';
import { CliFindingPanel } from './components/CliFindingPanel.tsx';
import { CliView } from './components/CliView.tsx';
import { ContextPanel } from './components/ContextPanel.tsx';
import { FindingsView } from './components/FindingsView.tsx';
import { PlanWorkspace } from './components/PlanWorkspace.tsx';
import { ProgressPanel } from './components/ProgressPanel.tsx';
import { Rail, type PlanState } from './components/Rail.tsx';
import { ScanStatusBar } from './components/ScanStatusBar.tsx';
import { StatusStrip } from './components/StatusStrip.tsx';
import { VaultView } from './components/VaultView.tsx';
import { VirtualClusterList } from './components/VirtualClusterList.tsx';
import { useI18n } from './i18n.tsx';
import { VERDICT_HINT } from './labels.ts';
import {
  agentClutter,
  categoryStats,
  type CategoryKey,
} from '../../src/core/categories.ts';
import {
  ClusterQuery,
  type KindFilter,
  type SortMode,
} from '../../src/core/cluster-query.ts';
import { SelectionScope } from '../../src/core/selection-scope.ts';
import { ScanSummary } from '../../src/core/scan-summary.ts';
import {
  EMPTY_LIVE_SCAN,
  EMPTY_SCAN_PROGRESS,
  reduceScanBatch,
  type ScanBatchState,
} from './util/live-scan.ts';
import { createSseBatcher, type SseBatcher } from './util/sse-batch.ts';

type Phase = 'idle' | 'scanning' | 'review' | 'planning' | 'confirm' | 'deleting' | 'done';

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
  const [view, setView] = useState<'disk' | 'cli' | 'vault' | 'unified'>('disk');


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
  /** Canli tarama: olaylar tamponlanarak TEK guncellemede uygulanir. */
  const [scanBatch, setScanBatch] = useState<ScanBatchState>({
    live: EMPTY_LIVE_SCAN,
    progress: EMPTY_SCAN_PROGRESS,
  });
  const [scanDone, setScanDone] = useState<ScanDoneInfo | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('size');
  const [mode, setMode] = useState<DeleteMode>('recycle');
  /** Sol sutun kategorisi (kanittan turetilir; ayrica filtre degildir). */
  const [category, setCategory] = useState<CategoryKey | 'all'>('all');
  /** Sol sutun gorunur mu (dar ekranda veya elle kapatilabilir). */
  const [railOpen, setRailOpen] = useState(true);
  /** Klavye imleci (odaklanan satir). P2'de sag panel bunu okur. */
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  /** Sabitlenen oge (Enter). Panelde kalici gorunur. */
  const [pinnedKey, setPinnedKey] = useState<string | null>(null);
  /** Onay duvarina odaklanma sinyali (plan "Enter"). */
  const [approveSignal, setApproveSignal] = useState(0);
  /** Birlesik gorunumde odaklanan bulgu (P5). */
  const [unifiedFocus, setUnifiedFocus] = useState<FindingView | null>(null);
  /** Masaustu kisayolu durumu (T40). */
  const [shortcut, setShortcut] = useState<DesktopShortcutView | null>(null);
  const [shortcutBusy, setShortcutBusy] = useState(false);
  /** Satir yogunlugu: yogun (32px) / rahat (40px). */
  const [density, setDensity] = useState<'dense' | 'comfortable'>('dense');
  /** Triyaj cipleri: hizli eleme (boyut / risk / zombi). */
  const [triage, setTriage] = useState({ big: false, risky: false, zombie: false });
  const searchRef = useRef<HTMLInputElement | null>(null);

  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [deleting, setDeleting] = useState<DeletingState | null>(null);
  const [done, setDone] = useState<DoneState | null>(null);
  const [scanStatus, setScanStatus] = useState<ScanStatusResponse | null>(null);
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** Güncelleme politikası bilgi ekranı (ağ isteği YAPMAZ). */
  const [policyOpen, setPolicyOpen] = useState(false);
  const [hoursDraft, setHoursDraft] = useState('24');
  const [daysDraft, setDaysDraft] = useState('30');

  const streamRef = useRef<EventSource | null>(null);
  /** SSE tamponu: bilesen kapanirken zamanlayici de iptal edilir. */
  const batchRef = useRef<SseBatcher<ScanStreamEvent> | null>(null);

  const closeStream = useCallback(() => {
    streamRef.current?.close();
    streamRef.current = null;
    batchRef.current?.dispose();
    batchRef.current = null;
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
      setDaysDraft(String(s.vaultRetentionDays));
    } catch (e) {
      setError(errText(e));
    }
    setSettingsOpen(true);
  }, []);

  const saveHours = useCallback(async () => {
    const n = Number(hoursDraft);
    const days = Number(daysDraft);
    if (!Number.isFinite(n) || !Number.isFinite(days)) return;
    try {
      const s = await updateSettings({
        scanCacheHours: n,
        vaultRetentionDays: days,
      });
      setSettings(s);
      setSettingsOpen(false);
      await refreshScanStatus();
      notify(t('Ayarlar kaydedildi.'));
    } catch (e) {
      setError(errText(e));
    }
  }, [hoursDraft, daysDraft, refreshScanStatus, notify, t]);

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
      setSelected(DefaultSelection.keys(latest.scan.clusters));
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
    setScanBatch({ live: EMPTY_LIVE_SCAN, progress: EMPTY_SCAN_PROGRESS });
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

      // Olaylari 120 ms'lik pencerelerde topla: yuzlerce olay tek render.
      const batcher = createSseBatcher<ScanStreamEvent>((events) => {
        setScanBatch((prev) => reduceScanBatch(prev, events));
      });
      batchRef.current = batcher;

      let finished = false;
      /** EventSource kendisi yeniden baglanir; ust sinir bizde. */
      let retries = 0;

      es.onopen = () => {
        retries = 0;
      };

      es.onmessage = (ev) => {
        let data: ScanStreamEvent;
        try {
          data = JSON.parse(ev.data) as ScanStreamEvent;
        } catch {
          return;
        }
        if (data.type === 'done') {
          // Bekleyen oge olaylarini once uygula: sonuc ekrani eksik kalmasin.
          batcher.flush();
          finished = true;
          closeStream();
          setScanBatch({ live: EMPTY_LIVE_SCAN, progress: EMPTY_SCAN_PROGRESS });
          setScan(data.result);
          setSelected(DefaultSelection.keys(data.result.clusters));
          setLastScanAt(Date.now());
          void refreshScanStatus();
          setPhase('review');
          // Proje taramasi rapor-only'dir; bunu sessizce yapmayalim.
          if (root) notify(t('Proje taraması salt rapordur; silme hedefi üretilmez.'));
          // Kalici bir isaret degil: "Tamam" denince liste gorunur.
          setScanDone({
            clusters: data.result.clusters.length,
            totalBytes: (new ScanSummary(data.result.clusters).totals().totalBytes),
            reclaimableBytes: (new ScanSummary(data.result.clusters).totals().reclaimableBytes),
            durationMs: data.result.finishedAt - data.result.startedAt,
          });
        } else if (data.type === 'cancelled') {
          finished = true;
          closeStream();
          setScanBatch({ live: EMPTY_LIVE_SCAN, progress: EMPTY_SCAN_PROGRESS });
          notify(t('Tarama iptal edildi.'));
          setPhase('idle');
        } else if (data.type === 'error') {
          finished = true;
          closeStream();
          setScanBatch({ live: EMPTY_LIVE_SCAN, progress: EMPTY_SCAN_PROGRESS });
          setError(data.message);
          setPhase('review');
        } else {
          // targets / target-start / target-done / item / progress
          batcher.push(data);
        }
      };

      es.onerror = () => {
        if (finished) return;
        // `CONNECTING`: tarayici ayni adrese Last-Event-ID ile kendisi
        // yeniden baglaniyor. Bu bir hata degil; kacirilan olaylar
        // sunucudaki tampondan tekrar oynatilir.
        if (es.readyState === EventSource.CONNECTING && retries < 10) {
          retries++;
          return;
        }
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
          setSelected(DefaultSelection.keys(latest.scan.clusters));
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

  const groups = useMemo(() => (scan ? groupByVerdict(scan.clusters) : null), [scan]);

  /**
   * Gorunen liste: filtre + arama + siralama MOTORDA yapilir
   * (`src/core/cluster-query.ts`). Arayuz yalnizca sonucu gosterir.
   */
  const activeItems = useMemo(() => {
    if (!scan) return [];
    return new ClusterQuery(scan.clusters).filter({
      text: filter,
      kind: kindFilter,
      category,
      triage,
      sort: sortMode,
    });
  }, [scan, filter, kindFilter, sortMode, category, triage]);

  /** Sol sutun: kategori ozeti + saglik olcumleri (yalniz tarama sonucundan). */
  const cats = useMemo(() => categoryStats(scan?.clusters ?? []), [scan]);
  const aiRatio = useMemo(() => agentClutter(scan?.clusters ?? []), [scan]);
  const scannedBytes = useMemo(
    () => new ScanSummary(scan?.clusters ?? []).totals().totalBytes,
    [scan],
  );
  const scannedReclaimable = useMemo(
    () => new ScanSummary(scan?.clusters ?? []).totals().reclaimableBytes,
    [scan],
  );

  const selectedTotals = useMemo(
    () => new SelectionScope(scan?.clusters ?? []).totals(selected),
    [scan, selected],
  );
  const selectedBytes = selectedTotals.bytes;
  const targetCount = selectedTotals.targetCount;

  const toggleSelect = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  /** Aralık secimi (Shift+ok): verilen anahtarlari acık/kapatik yapar. */
  const setSelectionFor = useCallback((keys: string[], on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (on) next.add(k);
        else next.delete(k);
      }
      return next;
    });
  }, []);

  /** Secimi birak (durum seridindeki "Secilenleri temizle"). */
  const clearSelection = useCallback(() => setSelected(new Set()), []);

  /** Arama kutusuna odaklanma ("/"). */
  const focusSearch = useCallback(() => {
    searchRef.current?.focus();
    searchRef.current?.select();
  }, []);

  /** Masaustu kisayolunu yukler (ayarlar modalini acinca). */
  const loadShortcut = useCallback(async () => {
    try {
      setShortcut(await getDesktopShortcut());
    } catch {
      /* kisayol bilgisi alinamadi: dugmeler gizli kalir */
    }
  }, []);

  useEffect(() => {
    if (settingsOpen) void loadShortcut();
  }, [settingsOpen, loadShortcut]);

  const addShortcut = useCallback(async () => {
    setShortcutBusy(true);
    try {
      const s = await createDesktopShortcut();
      setShortcut(s);
      notify(s.error ? s.error : t('Masaüstü kısayolu eklendi.'));
    } catch (e) {
      setError(errText(e));
    } finally {
      setShortcutBusy(false);
    }
  }, [notify, t]);

  const removeShortcut = useCallback(async () => {
    setShortcutBusy(true);
    try {
      const s = await deleteDesktopShortcut();
      setShortcut(s);
      notify(s.error ? s.error : t('Masaüstü kısayolu kaldırıldı.'));
    } catch (e) {
      setError(errText(e));
    } finally {
      setShortcutBusy(false);
    }
  }, [notify, t]);

  /**
   * Odak (imleç) degisimi. Sag panel SECIM/IMLECE gore guncellenir;
   * gezinirken sabitleme kalkar (panel her zaman odaktakini gosterir).
   */
  const focusItem = useCallback((key: string) => {
    setFocusedKey(key);
    setPinnedKey(null);
  }, []);

  /** Enter/düğme ile sabitleme: ayni ogeye ikinci kez basmak sabitlemeyi kaldirir. */
  const togglePin = useCallback((key: string) => {
    setFocusedKey(key);
    setPinnedKey((prev) => (prev === key ? null : key));
  }, []);

  /** Sag panelin gosterdigi oge: odaklanan (secili) kume. */
  const contextCluster = useMemo(() => {
    if (!focusedKey || !scan) return null;
    return scan.clusters.find((c) => c.key === focusedKey) ?? null;
  }, [focusedKey, scan]);

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
          if (!SelectionScope.isSelectable(c)) continue;
          if (on) next.add(c.key);
          else next.delete(c.key);
        }
        return next;
      });
    },
    [activeItems],
  );

  /**
   * Ozet kartindaki "Sec": tarama sonucundaki TUM silinebilir kumeleri
   * (hedefi olan, report-only/keep olmayan) tek tikla sec. Iki asamali
   * onay degismez; bu yalnizca secim kolayligidir.
   */
  const selectReclaimable = useCallback(() => {
    if (!scan) return;
    setSelected((prev) => {
      const next = new Set(prev);
      for (const c of scan.clusters) {
        if (!SelectionScope.isPlannable(c)) continue;
        next.add(c.key);
      }
      return next;
    });
  }, [scan]);

  const reclaimableSelectable = useMemo(
    () => new SelectionScope(scan?.clusters ?? []).plannableCount(),
    [scan],
  );

  /**
   * Verilen kume anahtarlari icin gerekceli plan uretir.
   * Hicbir sey tasinmaz/silinmez; yalnizca plan ekrani acilir.
   */
  const openPlanFor = useCallback(
    async (keys: string[]) => {
      if (!scan || keys.length === 0) return;
      setError(null);
      setPhase('planning');
      try {
        const p = await createPlan({
          scanId: scanId ?? undefined,
          keys,
          mode,
        });
        setPlan(p);
        setPhase('confirm');
      } catch (e) {
        setError(errText(e));
        setPhase('review');
      }
    },
    [scan, scanId, mode],
  );

  const openPlan = useCallback(async () => {
    await openPlanFor([...selected]);
  }, [openPlanFor, selected]);

  /**
   * "Tumunu planla" KAPSAMI: aktif kategori + aktif filtre sonucu gorunen,
   * silme hedefi OLAN kumeler. "Nuke All" YOKTUR: buton yalnizca PLAN
   * uretir; uygulama icin ayrica yazili onay gerekir.
   */
  const scopeKeys = useMemo(() => new SelectionScope(activeItems).planScopeKeys(), [activeItems]);

  const planAll = useCallback(async () => {
    if (scopeKeys.length === 0) return;
    setSelected(new Set(scopeKeys));
    await openPlanFor(scopeKeys);
  }, [scopeKeys, openPlanFor]);

  /**
   * Plandan bir kumeyi cikarir (onay ekraninda secim duzeltme).
   *
   * Sunucu tarafi yeniden plan uretilir: uygulanan plan ile gosterilen plan
   * birebir ayni kalir. Kalan kume yoksa plan birakilir (hicbir sey silinmez).
   */
  const deselectFromPlan = useCallback(
    async (key: string) => {
      if (!plan) return;
      const remaining = [...selected].filter((k) => k !== key);
      if (remaining.length === 0) {
        setPlan(null);
        setPhase('review');
        setSelected(new Set());
        notify(t('Plan boşaldı; hiçbir şey silinmedi.'));
        return;
      }
      try {
        const p = await createPlan({ scanId: scanId ?? undefined, keys: remaining, mode });
        setPlan(p);
        setSelected(new Set(remaining));
      } catch (e) {
        setError(errText(e));
        setPlan(null);
        setPhase('review');
      }
    },
    [plan, selected, scanId, mode, notify, t],
  );

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

  /** Silme sonrasi "Kasayi ac": uygulamanin kendi Kasa sekmesine gecer. */
  const openVaultView = useCallback(() => {
    setView('vault');
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

  /** Sol sutun rozeti icin plan durumu. */
  const planState: PlanState =
    phase === 'planning'
      ? 'planning'
      : phase === 'confirm'
        ? 'confirm'
        : phase === 'deleting'
          ? 'deleting'
          : 'idle';

  /** Sag sutun Disk ve Birlesik sekmelerinde acik (CLI/Kasa kendi ekraninda). */
  const ctxOpen = view === 'disk' || view === 'unified';

  return (
    <div className={`app${railOpen ? '' : ' rail-closed'}${ctxOpen ? ' with-ctx' : ''}`}>
      {railOpen && (
        <Rail
          stats={cats}
          active={category}
          onSelect={setCategory}
          totalBytes={scannedBytes}
          reclaimableBytes={scannedReclaimable}
          aiRatio={aiRatio}
          disk={scanStatus?.disk ?? null}
          selectedCount={selected.size}
          selectedBytes={selectedBytes}
          planState={planState}
          onPlan={() => void openPlan()}
          onPlanAll={() => void planAll()}
          hasScan={!!scan}
          scopeCount={scopeKeys.length}
        />
      )}

      <div className="console-main">
      <header className="topbar">
        <button
          className="icon-btn rail-toggle"
          onClick={() => setRailOpen((v) => !v)}
          aria-expanded={railOpen}
          aria-label={t('Sol menüyü aç/kapat')}
          title={t('Sol menüyü aç/kapat')}
        >
          {railOpen ? '«' : '»'}
        </button>

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
          <button
            role="tab"
            aria-selected={view === 'vault'}
            className={view === 'vault' ? 'active' : ''}
            onClick={() => setView('vault')}
            disabled={phase === 'deleting'}
          >
            {t('Kasa')}
          </button>
          <button
            role="tab"
            aria-selected={view === 'unified'}
            className={view === 'unified' ? 'active' : ''}
            onClick={() => setView('unified')}
            disabled={phase === 'deleting'}
            title={t('Disk ve CLI bulguları tek listede (salt okunur)')}
          >
            {t('Birleşik')}
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
          {...scanBatch.progress}
          paths={scanBatch.live.paths}
          found={scanBatch.live.items}
          active={scanBatch.live.active}
          finished={scanBatch.live.finished}
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

      {scan && phase !== 'scanning' && phase !== 'confirm' && (
        <>
          {lastScanAt && (
            <div className="scan-note dim small">
              {t('Son inceleme: {date}', {
                date: new Date(lastScanAt).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US'),
              })}
            </div>
          )}
          <StatusStrip
            scan={scan}
            selectedBytes={selectedBytes}
            selectedCount={selectedTotals.clusterCount}
            targetCount={targetCount}
            reclaimableSelectable={reclaimableSelectable}
            onSelectReclaimable={selectReclaimable}
            onClearSelection={clearSelection}
          />

          <div className="toolbar">
            <input
              ref={searchRef}
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
            <div className="triage" role="group" aria-label={t('Triyaj')}>
              <button
                className={`chip chip-toggle${triage.big ? ' active' : ''}`}
                onClick={() => setTriage((p) => ({ ...p, big: !p.big }))}
                title={t('Silinebilir boyutu 1 GB üzeri olanlar')}
              >
                {t('Boyut ≥ 1 GB')}
              </button>
              <button
                className={`chip chip-toggle${triage.risky ? ' active' : ''}`}
                onClick={() => setTriage((p) => ({ ...p, risky: !p.risky }))}
                title={t('Risk seviyesi orta veya yüksek olanlar')}
              >
                {t('Risk: orta+')}
              </button>
              <button
                className={`chip chip-toggle${triage.zombie ? ' active' : ''}`}
                onClick={() => setTriage((p) => ({ ...p, zombie: !p.zombie }))}
                title={t('30 günden uzun süredir dokunulmamış')}
              >
                {t('Zombi ≥ 30 gün')}
              </button>
              <button
                className="chip chip-toggle density-toggle"
                onClick={() => setDensity((d) => (d === 'dense' ? 'comfortable' : 'dense'))}
                title={t('Satır yoğunluğu')}
              >
                {density === 'dense' ? t('Yoğun') : t('Rahat')}
              </button>
            </div>
            <div className="select-actions">
              <button className="btn small" onClick={() => selectVisible(true)} disabled={phase === 'deleting'}>
                {t('Görünenleri seç')}
              </button>
              <button className="btn small" onClick={clearSelection} disabled={phase === 'deleting'}>
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
                      ? new ScanSummary(scan.clusters).gitTrackedCount()
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
                {/*
                  Sanal liste: yalnizca gorunen satirlar DOM'a girer.
                  Kaydirma konusu korunur; filtre/siralama degisince basa doner.
                */}
                <VirtualClusterList
                  items={activeItems}
                  selected={selected}
                  expanded={expanded}
                  focusedKey={focusedKey}
                  density={density}
                  resetKey={`${kindFilter}|${sortMode}|${filter}|${category}|${scan.finishedAt}`}
                  onToggle={toggleSelect}
                  onExpand={toggleExpand}
                  onFocus={focusItem}
                  onPin={togglePin}
                  onSelectMany={setSelectionFor}
                  onSearchFocus={focusSearch}
                  onEscape={clearSelection}
                />
              </section>
            )}
          </main>

          <footer className="actionbar">
            <div className="selection-info">
              <strong>{formatBytes(selectedBytes)}</strong>
              <span className="dim">
                {' '}
                {t('seçili · {clusters} küme · {targets} hedef', {
                  clusters: selectedTotals.clusterCount,
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
        <PlanWorkspace
          plan={plan}
          protectedCount={Math.max(0, selected.size - plan.plan.clusters.length)}
          busy={false}
          onCancel={() => {
            setPlan(null);
            setPhase('review');
          }}
          onApprove={() => setApproveSignal((n) => n + 1)}
          onDeselect={(key) => void deselectFromPlan(key)}
        />
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
          onOpenVault={openVaultView}
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

      <div style={{ display: view === 'vault' ? undefined : 'none' }}>
        <VaultView active={view === 'vault'} onError={setError} onNotice={notify} />
      </div>

      {view === 'unified' && (
        <FindingsView
          focusedId={unifiedFocus?.id ?? null}
          onFocus={(f) => {
            setUnifiedFocus(f);
            if (f?.source === 'disk') setFocusedKey(f.id.replace(/^disk:/, ''));
          }}
        />
      )}

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
            <label className="settings-field">
              <span>{t('Kasa saklama süresi (gün)')}</span>
              <input
                type="number"
                min={1}
                max={3650}
                value={daysDraft}
                onChange={(e) => setDaysDraft(e.target.value)}
              />
              <span className="dim small">
                {t('Yalnızca bilgi amaçlıdır; kasa otomatik silinmez.')}
              </span>
            </label>
            <div className="settings-policy">
              <div>
                <strong>{t('Güncelleme Politikası')}</strong>
                <p className="dim small">
                  {t(
                    'Varsayılan olarak kapalıdır: uygulama hiçbir ağ isteği yapmaz. Neden ve ne gönderileceğini oku.',
                  )}
                </p>
              </div>
              <button className="btn small" onClick={() => setPolicyOpen(true)}>
                {t('Politikayı aç')}
              </button>
            </div>

            {/*
              Masaustu kisayolu (T40): kisayol sadece araci baslatir; her
              baslatmada yeni guvenlik jetonu uretilir ve jeton .lnk icine
              YAZILMAZ.
            */}
            <div className="settings-policy">
              <div>
                <strong>{t('Masaüstü kısayolu')}</strong>
                <p className="dim small">
                  {shortcut?.exists && shortcut.ours
                    ? t('Kısayol hazır: {path}', { path: shortcut.path })
                    : t('Masaüstüne bir kısayol ekle; arayüzü tek tıkla aç.')}
                </p>
              </div>
              {shortcut?.exists && shortcut.ours ? (
                <button className="btn small" onClick={() => void removeShortcut()} disabled={shortcutBusy}>
                  {t('Kısayolu kaldır')}
                </button>
              ) : (
                <button className="btn small" onClick={() => void addShortcut()} disabled={shortcutBusy}>
                  {t('Kısayol ekle')}
                </button>
              )}
            </div>
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

      {policyOpen && (
        <div
          className="modal-overlay policy-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={t('Güncelleme Politikası')}
          onClick={() => setPolicyOpen(false)}
        >
          <div className="modal modal-small" onClick={(e) => e.stopPropagation()}>
            <header className="modal-head">
              <h2>{t('Güncelleme Politikası')}</h2>
              <button
                className="icon-btn"
                onClick={() => setPolicyOpen(false)}
                aria-label={t('Kapat')}
              >
                ×
              </button>
            </header>

            <div className="policy-body">
              <section>
                <h3>{t('Bugün nasıl?')}</h3>
                <p>
                  {t(
                    'Hiçbir güncelleme kontrolü yapılmaz ve hiçbir veri dışarı gönderilmez. Yeni sürümü npm sayfasından veya {cmd} ile kontrol edebilirsin.',
                    { cmd: 'npm view clicleaner version' },
                  )}
                </p>
              </section>

              <section>
                <h3>{t('Neden bir kontrol?')}</h3>
                <p>
                  {t(
                    'npx her çalıştırmada güncel sürümü alır; global kurulum (npm i -g) ise eski sürümde kalır. Sürüm bildirimi olmadan düzeltmeler ve güvenlik güncellemeleri görünmez.',
                  )}
                </p>
              </section>

              <section>
                <h3>{t('Açarsan ne gönderilir?')}</h3>
                <p>
                  {t(
                    'Yalnızca bir sürüm sorusu: registry.npmjs.org/clicleaner/latest. Kimlik, disk yolu, tarama sonucu ve kullanım verisi GÖNDERİLMEZ. Sonuç 24 saat önbellekte tutulur.',
                  )}
                </p>
              </section>

              <section>
                <h3>{t('Sonuç')}</h3>
                <p>
                  {t(
                    'Kapalıyken ağ isteği yoktur. Açıkken günde veya haftada bir tek HTTPS isteği gider. Kendi kendine güncelleme YAPILMAZ; güncellemeyi sen {cmd} ile yaparsın.',
                    { cmd: 'npm i -g clicleaner' },
                  )}
                </p>
              </section>

              <section>
                <h3>{t('Manuel güncelleme')}</h3>
                <p>{t('Otomatik kontrolü beklemeden güncelleyebilirsin:')}</p>
                <ul className="policy-links">
                  <li>
                    {t('Global kurulum:')} <code>npm i -g clicleaner</code>
                  </li>
                  <li>
                    {t('Kurulum yapmadan:')} <code>npx clicleaner@latest</code>
                  </li>
                </ul>
                <p>{t('Sürümü şu adreslerden doğrulayabilirsin:')}</p>
                <ul className="policy-links">
                  <li>
                    <a
                      href="https://github.com/omer-denen/CLICleaner/releases"
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      {t('GitHub sürümleri')} — github.com/omer-denen/CLICleaner/releases
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://www.npmjs.com/package/clicleaner"
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      {t('npm paketi')} — npmjs.com/package/clicleaner
                    </a>
                  </li>
                </ul>
                <p className="dim small">
                  {t('Sürümü terminalde görmek için: {cmd}', { cmd: 'npm view clicleaner version' })}
                </p>
              </section>

              <p className="dim small">
                {t(
                  'Bu ekran bilgilendirir. Otomatik kontrol henüz uygulanmadı (T41); sen açmadan etkinleşmez.',
                )}
              </p>
            </div>

            <footer className="modal-actions">
              <button className="btn btn-primary" onClick={() => setPolicyOpen(false)}>
                {t('Anladım')}
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

      {ctxOpen && (
        plan && phase === 'confirm' ? (
          <ApprovalWall
            plan={plan}
            busy={false}
            focusSignal={approveSignal}
            onCancel={() => {
              setPlan(null);
              setPhase('review');
            }}
            onConfirm={(p, a) => void confirmDelete(p, a)}
          />
        ) : view === 'unified' && unifiedFocus?.source === 'cli' ? (
          <CliFindingPanel finding={unifiedFocus} />
        ) : (
          <ContextPanel
            cluster={contextCluster}
            pinned={pinnedKey !== null && pinnedKey === contextCluster?.key}
            onTogglePin={() => {
              if (contextCluster) togglePin(contextCluster.key);
            }}
          />
        )
      )}
    </div>
  );
}

/** Liste siralamasi: boyut, risk, son hareket veya ad. */
function errText(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return e instanceof Error ? e.message : String(e);
}

function DoneView({
  done,
  onRescan,
  onOpenVault,
}: {
  done: DoneState;
  onRescan: () => void;
  onOpenVault: () => void;
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
            <button className="btn btn-primary" onClick={onOpenVault}>
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
