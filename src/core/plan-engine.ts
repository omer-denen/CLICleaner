import type { CategoryKey } from './categories.ts';
import { categoryOf } from './categories.ts';
import type { Cluster, Risk } from './types.ts';

/**
 * Plan motoru (zamanlama dahil).
 *
 * Kural: PLANLI ISLEM YALNIZCA KASAYA TASIR. Kalici silme ve ortam
 * degiskeni duzenlemesi otomatik YAPILMAZ. Kural, sabit bir yol listesi
 * degil bir SECICI saklar; calisma aninda yeniden degerlendirilir.
 */

export type ScheduleFrequency = 'once' | 'daily' | 'weekly';
export type ScheduledStatus = 'pending' | 'running' | 'done' | 'missed' | 'failed' | 'cancelled';

export interface ScheduleSelector {
  /** Belirli kume anahtarlari (bos = kategori/risk secimi). */
  keys?: string[];
  categories?: CategoryKey[];
  /** Bu risk ve altindakiler. Varsayilan: yalnizca safe. */
  maxRisk?: Risk;
  /** En az bu kadar gundur dokunulmamis. */
  minIdleDays?: number;
  /** Tek calismada en fazla kume. */
  maxItems?: number;
}

export interface ScheduleRule {
  id: string;
  name: string;
  frequency: ScheduleFrequency;
  /** 0..23 */
  hour: number;
  /** 0..59 */
  minute: number;
  /** weekly icin 0=Pazar..6=Cumartesi */
  weekday?: number;
  /** once icin mutlak zaman (ms). */
  runAt?: number;
  selector: ScheduleSelector;
  mode: 'vault';
  enabled: boolean;
  createdAt: number;
  lastRunAt?: number;
  /**
   * Kacirilan calisma telafisi: true ise sunucu bir sonraki acilista
   * "kacirilan calisma" onerisi sunar; false ise yalnizca sonraki zaman.
   */
  compensateMissed: boolean;
}

export interface ScheduleRun {
  id: string;
  ruleId: string;
  plannedAt: number;
  startedAt?: number;
  finishedAt?: number;
  status: ScheduledStatus;
  itemCount: number;
  bytes: number;
  journalPath?: string;
  error?: string;
}

const RISK_ORDER: Record<Risk, number> = { safe: 0, low: 1, medium: 2, high: 3 };

function atTime(base: Date, hour: number, minute: number): number {
  const d = new Date(base);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

/** Kuralin bir sonraki calisma zamani; `once` gecmisse null. */
export function nextRunAt(rule: ScheduleRule, from = Date.now()): number | null {
  if (!rule.enabled) return null;
  if (rule.frequency === 'once') {
    return rule.runAt !== undefined && rule.runAt > from ? rule.runAt : null;
  }
  if (rule.frequency === 'daily') {
    const today = atTime(new Date(from), rule.hour, rule.minute);
    if (today > from) return today;
    const next = new Date(from);
    next.setDate(next.getDate() + 1);
    return atTime(next, rule.hour, rule.minute);
  }
  // weekly
  const target = rule.weekday ?? 1;
  const cur = new Date(from);
  const diff = (target - cur.getDay() + 7) % 7;
  const candidate = new Date(cur);
  candidate.setDate(cur.getDate() + diff);
  const t = atTime(candidate, rule.hour, rule.minute);
  if (t > from) return t;
  candidate.setDate(candidate.getDate() + 7);
  return atTime(candidate, rule.hour, rule.minute);
}

/** Kural su an calistirilmali mi? (gecikmis calismalar icin `missed`). */
export function dueNow(rule: ScheduleRule, now = Date.now()): boolean {
  if (!rule.enabled) return false;
  if (rule.frequency === 'once') {
    return rule.runAt !== undefined && rule.runAt <= now && rule.lastRunAt === undefined;
  }
  const prev = previousRunAt(rule, now);
  if (prev === null) return false;
  const last = rule.lastRunAt ?? rule.createdAt;
  return last < prev;
}

/** Bu andan onceki en yakin plan zamani. */
export function previousRunAt(rule: ScheduleRule, now = Date.now()): number | null {
  if (rule.frequency === 'once') {
    return rule.runAt !== undefined && rule.runAt <= now ? rule.runAt : null;
  }
  const d = new Date(now);
  if (rule.frequency === 'daily') {
    const today = atTime(d, rule.hour, rule.minute);
    if (today <= now) return today;
    d.setDate(d.getDate() - 1);
    return atTime(d, rule.hour, rule.minute);
  }
  const target = rule.weekday ?? 1;
  const diff = (d.getDay() - target + 7) % 7;
  const candidate = new Date(d);
  candidate.setDate(d.getDate() - diff);
  const t = atTime(candidate, rule.hour, rule.minute);
  if (t <= now) return t;
  candidate.setDate(candidate.getDate() - 7);
  return atTime(candidate, rule.hour, rule.minute);
}

/** Kacirilan calisma sayisi (son calismadan bu yana plan zamani gecen). */
export function missedRuns(rule: ScheduleRule, now = Date.now()): number {
  if (rule.frequency === 'once') return 0;
  const last = rule.lastRunAt;
  if (last === undefined) return 0;
  let count = 0;
  let cur = last;
  for (let i = 0; i < 366; i++) {
    const next = nextRunAt(rule, cur);
    if (next === null || next > now) break;
    count++;
    cur = next;
  }
  return count;
}

/** Seciciyi uygular: yalnizca kasa moduna uygun (safe, hedefli) kumeler. */
export function selectClusters(rule: ScheduleRule, clusters: Cluster[]): Cluster[] {
  const sel = rule.selector;
  const maxRisk = RISK_ORDER[sel.maxRisk ?? 'safe'];
  const wantedCats = new Set(sel.categories ?? []);
  const wantedKeys = new Set(sel.keys ?? []);
  const now = Date.now();
  const minIdle = (sel.minIdleDays ?? 0) * 86_400_000;

  const out = clusters.filter((c) => {
    if (c.verdict.kind !== 'recommend') return false;
    if (c.verdict.regenerability !== 'regenerable') return false;
    if (c.verdict.confidence === 'low') return false;
    if ((c.deleteTargets?.length ?? 0) === 0) return false;
    if (RISK_ORDER[c.verdict.risk] > maxRisk) return false;
    if (wantedKeys.size > 0 && !wantedKeys.has(c.key)) return false;
    if (wantedCats.size > 0 && !wantedCats.has(categoryOf(c))) return false;
    if (minIdle > 0 && c.lastTouched > 0 && now - c.lastTouched < minIdle) return false;
    return true;
  });
  const max = sel.maxItems ?? 10;
  return out.slice(0, Math.max(1, max));
}

export interface PlanPreview {
  ruleId: string;
  items: Array<{ key: string; title: string; bytes: number; category: CategoryKey; risk: Risk }>;
  totalBytes: number;
  skipped: Array<{ key: string; reason: string }>;
  mode: 'vault';
  envChanges: never[];
}

/** Calisma aninda onizleme; hicbir sey silmez/yazmaz. */
export function previewRule(rule: ScheduleRule, clusters: Cluster[]): PlanPreview {
  const selected = selectClusters(rule, clusters);
  return {
    ruleId: rule.id,
    mode: 'vault',
    envChanges: [],
    totalBytes: selected.reduce((a, c) => a + c.reclaimableBytes, 0),
    items: selected.map((c) => ({
      key: c.key,
      title: c.title,
      bytes: c.reclaimableBytes,
      category: categoryOf(c),
      risk: c.verdict.risk,
    })),
    skipped: clusters
      .filter((c) => !selected.includes(c))
      .slice(0, 50)
      .map((c) => ({ key: c.key, reason: 'secici kosullarini saglamadi veya limit disinda' })),
  };
}
