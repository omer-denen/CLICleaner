import type {
  ClusterDetailView,
  DashboardResponse,
  DiskViewResponse,
  ExecuteStartResponse,
  MetaResponse,
  PlanResponse,
  ProjectAnalysisResponse,
  ProjectListResponse,
  ProjectRootsResponse,
  ProjectSort,
  ProjectTab,
  ScanStartResponse,
  ScanStatusResponse,
  VaultListResponse,
  VaultPurgeResponse,
  VaultRestoreResponse,
} from '../../src/core/contract.ts';

/**
 * TEK API ISTEMCISI.
 *
 * Arayuz yalnizca ISTEK gonderir. Hesap, filtre, siralama, secim ozeti ve
 * onay kurallari sunucudadir; burada yalnizca HTTP tasima ve hata
 * normalizasyonu var.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: {
      accept: 'application/json',
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (body as { error?: string } | null)?.error ?? `HTTP ${res.status}`;
    throw new ApiError(message, res.status, body);
  }
  return body as T;
}

function post<T>(path: string, payload: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: JSON.stringify(payload) });
}

export interface DiskQuery {
  text: string;
  kind: string;
  category: string;
  sort: string;
  big: boolean;
  risky: boolean;
  zombie: boolean;
  selected: string[];
}

export interface ProjectDiscoverQuery {
  roots: string[];
  text: string;
  tab: ProjectTab;
  sort: ProjectSort;
  /** Kesif onbellegini atla (kullanici "Tara" dedi). */
  refresh?: boolean;
}

export const api = {
  meta: (): Promise<MetaResponse> => request<MetaResponse>('/api/meta'),
  dashboard: (): Promise<DashboardResponse> => request<DashboardResponse>('/api/dashboard'),
  scanStatus: (): Promise<ScanStatusResponse> =>
    request<ScanStatusResponse>('/api/scan/status'),

  disk: (q: DiskQuery): Promise<DiskViewResponse> => {
    const p = new URLSearchParams();
    if (q.text) p.set('text', q.text);
    p.set('kind', q.kind);
    p.set('category', q.category);
    p.set('sort', q.sort);
    if (q.big) p.set('big', '1');
    if (q.risky) p.set('risky', '1');
    if (q.zombie) p.set('zombie', '1');
    for (const key of q.selected) p.append('selected', key);
    return request<DiskViewResponse>(`/api/disk?${p.toString()}`);
  },

  cluster: (key: string): Promise<ClusterDetailView> =>
    request<ClusterDetailView>(`/api/cluster?key=${encodeURIComponent(key)}`),

  /** Onerilen kesif kokleri (salt okunur). */
  projectRoots: (): Promise<ProjectRootsResponse> =>
    request<ProjectRootsResponse>('/api/projects/roots'),

  /** Proje kesfi: filtre/siralama/sayim MOTORDAN gelir. */
  discoverProjects: (q: ProjectDiscoverQuery): Promise<ProjectListResponse> => {
    const p = new URLSearchParams();
    for (const root of q.roots) p.append('roots', root);
    if (q.text) p.set('text', q.text);
    p.set('tab', q.tab);
    p.set('sort', q.sort);
    if (q.refresh) p.set('refresh', '1');
    return request<ProjectListResponse>(`/api/projects/discover?${p.toString()}`);
  },

  /** Tek proje analizi (SALT OKUNUR; artifact + tarif + hash). */
  projectAnalysis: (path: string): Promise<ProjectAnalysisResponse> =>
    request<ProjectAnalysisResponse>(`/api/projects?path=${encodeURIComponent(path)}`),

  startScan: (body: {
    envs?: string[];
    profile?: string;
    minAgeDays?: number;
    roots?: string[];
  }): Promise<ScanStartResponse> => post<ScanStartResponse>('/api/scan', body),

  scanAction: (scanId: string, action: 'cancel' | 'pause' | 'resume'): Promise<{ ok: boolean }> =>
    post<{ ok: boolean }>(`/api/scan/${scanId}/${action}`, {}),

  /** Yalnizca kasaya tasima modu; kalici silme arayuzde YOK. */
  plan: (keys: string[]): Promise<PlanResponse> =>
    post<PlanResponse>('/api/plan', { keys, mode: 'recycle' }),

  execute: (
    planId: string,
    phrase: string | undefined,
    acknowledgeHigh: boolean,
  ): Promise<ExecuteStartResponse> =>
    post<ExecuteStartResponse>('/api/execute', { planId, phrase, acknowledgeHigh }),

  vault: (): Promise<VaultListResponse> => request<VaultListResponse>('/api/vault'),

  restore: (id: string): Promise<VaultRestoreResponse> =>
    post<VaultRestoreResponse>('/api/vault/restore', {
      id,
      mode: 'files',
      conflict: 'rename',
    }),

  purge: (ids: string[], phrase: string): Promise<VaultPurgeResponse> =>
    post<VaultPurgeResponse>('/api/vault/purge', { ids, phrase }),
};
