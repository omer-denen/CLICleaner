import type { DashboardResponse, MetaResponse } from '../../src/core/contract.ts';

/**
 * TEK API ISTEMCISI.
 *
 * Arayuz yalnizca ISTEK gonderir. Hesap, filtre, siralama ve karar
 * sunucudadir; burada yalnizca HTTP tasima ve hata normalizasyonu var.
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

async function request<T>(path: string): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (body as { error?: string } | null)?.error ?? `HTTP ${res.status}`;
    throw new ApiError(message, res.status, body);
  }
  return body as T;
}

export const api = {
  meta: (): Promise<MetaResponse> => request<MetaResponse>('/api/meta'),
  dashboard: (): Promise<DashboardResponse> => request<DashboardResponse>('/api/dashboard'),
};
