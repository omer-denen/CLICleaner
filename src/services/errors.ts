/**
 * Servis katmani hatalari.
 *
 * HTTP'den bagimsizdir: yalnizca "bu istek 4xx ile reddedilmeli"
 * bilgisini tasir. `src/web/server.ts` bunu HTTP durum koduna cevirir.
 */
export class ServiceError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ServiceError';
    this.status = status;
  }
}

export function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
