import type {
  ApiErrorBody,
  CliExecuteRequest,
  CliExecuteResponse,
  CliInventoryRequest,
  CliInventoryStartResponse,
  CliPlanRequest,
  CliPlanResponse,
  CliRepairExecuteRequest,
  CliRepairExecuteResponse,
  CliRepairPlanRequest,
  CliRepairPlanResponse,
  CliQuarantineExecuteRequest,
  CliQuarantineExecuteResponse,
  CliQuarantinePlanRequest,
  CliQuarantinePlanResponse,
  ExecuteRequest,
  ExecuteStartResponse,
  LatestResponse,
  MetaResponse,
  PlanRequest,
  PlanResponse,
  ScanRequest,
  ScanStartResponse,
  ScanStatusResponse,
  SettingsResponse,
  VaultListResponse,
  VaultPurgeResponse,
  VaultRestoreAllResponse,
  VaultRestoreResponse,
} from '../../src/web/contract.ts';

/**
 * Tarayici API istemcisi.
 *
 * Token adres cubugundan BIR KEZ okunur, sessionStorage'a alinir ve
 * adres cubugundan silinir. SSE (EventSource) baslik gonderemedigi
 * icin yalnizca o istekte query parametresi kullanilir.
 */

const TOKEN_KEY = 'clicleaner.token';

export class ApiError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error || `HTTP ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

function initialToken(): string | null {
  try {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get('token');
    if (fromUrl) {
      window.sessionStorage.setItem(TOKEN_KEY, fromUrl);
      url.searchParams.delete('token');
      window.history.replaceState({}, '', url.pathname + url.hash);
      return fromUrl;
    }
    return window.sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

let token: string | null = initialToken();

export function getToken(): string | null {
  return token;
}

export function setToken(value: string): void {
  token = value.trim();
  try {
    window.sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* depolama kapali olabilir */
  }
}

export function clearToken(): void {
  token = null;
  try {
    window.sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* yoksay */
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!token) throw new ApiError(401, { error: 'Token yok. Terminaldeki baglantiyi kullan.' });

  const headers = new Headers(init.headers);
  headers.set('x-clicleaner-token', token);
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  const res = await fetch(path, { ...init, headers });
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { error: text.slice(0, 200) };
    }
  }

  if (!res.ok) {
    const err = (body ?? { error: `HTTP ${res.status}` }) as ApiErrorBody;
    throw new ApiError(res.status, err);
  }
  return body as T;
}

export function getMeta(): Promise<MetaResponse> {
  return request<MetaResponse>('/api/meta');
}

export function getLatest(): Promise<LatestResponse> {
  return request<LatestResponse>('/api/latest');
}

export function getScanStatus(): Promise<ScanStatusResponse> {
  return request<ScanStatusResponse>('/api/scan/status');
}

export function getSettings(): Promise<SettingsResponse> {
  return request<SettingsResponse>('/api/settings');
}

export function updateSettings(patch: {
  scanCacheHours?: number;
  vaultRetentionDays?: number;
}): Promise<SettingsResponse> {
  return request<SettingsResponse>('/api/settings', {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
}

export function startScan(body: ScanRequest): Promise<ScanStartResponse> {
  return request<ScanStartResponse>('/api/scan', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function scanStream(scanId: string): EventSource {
  if (!token) throw new ApiError(401, { error: 'Token yok' });
  return new EventSource(`/api/scan/${encodeURIComponent(scanId)}/events?token=${encodeURIComponent(token)}`);
}

export function cancelScan(scanId: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/scan/${encodeURIComponent(scanId)}/cancel`, {
    method: 'POST',
  });
}

export function createPlan(body: PlanRequest): Promise<PlanResponse> {
  return request<PlanResponse>('/api/plan', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function executePlan(body: ExecuteRequest): Promise<ExecuteStartResponse> {
  return request<ExecuteStartResponse>('/api/execute', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function executeStream(jobId: string): EventSource {
  if (!token) throw new ApiError(401, { error: 'Token yok' });
  return new EventSource(`/api/jobs/${encodeURIComponent(jobId)}/events?token=${encodeURIComponent(token)}`);
}

export function getVault(): Promise<VaultListResponse> {
  return request<VaultListResponse>('/api/vault');
}

export function restoreVault(id: string): Promise<VaultRestoreResponse> {
  return request<VaultRestoreResponse>('/api/vault/restore', {
    method: 'POST',
    body: JSON.stringify({ id }),
  });
}

export function restoreAllVault(): Promise<VaultRestoreAllResponse> {
  return request<VaultRestoreAllResponse>('/api/vault/restore-all', { method: 'POST' });
}

export function purgeVault(phrase: string): Promise<VaultPurgeResponse> {
  return request<VaultPurgeResponse>('/api/vault/purge', {
    method: 'POST',
    body: JSON.stringify({ phrase }),
  });
}

// ---------------------------------------------------------------------------
// CLI envanteri
// ---------------------------------------------------------------------------

export function startCliInventory(
  body: CliInventoryRequest,
): Promise<CliInventoryStartResponse> {
  return request<CliInventoryStartResponse>('/api/cli/inventory', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function cliInventoryStream(jobId: string): EventSource {
  if (!token) throw new ApiError(401, { error: 'Token yok' });
  return new EventSource(
    `/api/cli/inventory/${encodeURIComponent(jobId)}/events?token=${encodeURIComponent(token)}`,
  );
}

export function cancelCliInventory(jobId: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/cli/inventory/${encodeURIComponent(jobId)}/cancel`, {
    method: 'POST',
  });
}

export function cliPlan(body: CliPlanRequest): Promise<CliPlanResponse> {
  return request<CliPlanResponse>('/api/cli/plan', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function cliExecute(body: CliExecuteRequest): Promise<CliExecuteResponse> {
  return request<CliExecuteResponse>('/api/cli/execute', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function cliRepairPlan(body: CliRepairPlanRequest): Promise<CliRepairPlanResponse> {
  return request<CliRepairPlanResponse>('/api/cli/repair/plan', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function cliRepairExecute(
  body: CliRepairExecuteRequest,
): Promise<CliRepairExecuteResponse> {
  return request<CliRepairExecuteResponse>('/api/cli/repair/execute', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function cliQuarantinePlan(
  body: CliQuarantinePlanRequest,
): Promise<CliQuarantinePlanResponse> {
  return request<CliQuarantinePlanResponse>('/api/cli/quarantine/plan', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function cliQuarantineExecute(
  body: CliQuarantineExecuteRequest,
): Promise<CliQuarantineExecuteResponse> {
  return request<CliQuarantineExecuteResponse>('/api/cli/quarantine/execute', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
