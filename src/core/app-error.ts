/**
 * Uygulama hata modeli.
 *
 * Amac: "hata"yi tek bir metin olarak degil, ISTENEN DAVRANISI belirleyen
 * bir tur olarak tasimak. HTTP katmani `toBody()` ile sozlesmeye cevirir.
 *
 *   transient  -> yeniden denenebilir (kilit, gecici IO)
 *   permission -> yetki yok; tekrar denemek sonucu degistirmez
 *   conflict   -> hedef dolu/cakisma
 *   missing    -> yol/oge yok
 *   no-space   -> disk dolu
 *   integrity  -> dogrulama basarisiz
 *   cancelled  -> kullanici iptali (HATA SAYILMAZ)
 *   validation -> gecersiz istek
 *   fatal      -> bilinmeyen/kurtarilamaz
 */

export type AppErrorCode =
  | 'transient'
  | 'permission'
  | 'conflict'
  | 'missing'
  | 'no-space'
  | 'integrity'
  | 'cancelled'
  | 'validation'
  | 'fatal';

const RETRYABLE = new Set<AppErrorCode>(['transient', 'no-space']);

export interface AppErrorBody {
  type: AppErrorCode;
  title: string;
  detail: string;
  operationId?: string;
  itemId?: string;
  retryable: boolean;
  /** "Dosyalariniz yerinde" guvencesi (yikici islem yapilmadiysa). */
  dataSafe: boolean;
}

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly retryable: boolean;
  readonly dataSafe: boolean;
  readonly operationId?: string;
  readonly itemId?: string;
  override readonly cause?: unknown;

  constructor(
    code: AppErrorCode,
    message: string,
    opts: {
      cause?: unknown;
      operationId?: string;
      itemId?: string;
      dataSafe?: boolean;
    } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.retryable = RETRYABLE.has(code);
    this.dataSafe = opts.dataSafe ?? true;
    this.operationId = opts.operationId;
    this.itemId = opts.itemId;
    this.cause = opts.cause;
  }

  toBody(title = TITLES[this.code]): AppErrorBody {
    return {
      type: this.code,
      title,
      detail: this.message,
      ...(this.operationId ? { operationId: this.operationId } : {}),
      ...(this.itemId ? { itemId: this.itemId } : {}),
      retryable: this.retryable,
      dataSafe: this.dataSafe,
    };
  }

  /** Bilinmeyen hatayi normalize eder; cause zinciri korunur. */
  static from(err: unknown, fallback: AppErrorCode = 'fatal'): AppError {
    if (err instanceof AppError) return err;
    const e = err as NodeJS.ErrnoException;
    const code = String(e?.code ?? '');
    let kind: AppErrorCode = fallback;
    if (code === 'EPERM' || code === 'EACCES') kind = 'permission';
    else if (code === 'ENOENT') kind = 'missing';
    else if (code === 'ENOSPC' || code === 'EDQUOT') kind = 'no-space';
    else if (code === 'EBUSY' || code === 'EEXIST' || code === 'ENOTEMPTY') kind = 'conflict';
    else if (code === 'ECANCELED' || code === 'ABORT_ERR') kind = 'cancelled';
    else if (code === 'EIO' || code === 'ETIMEDOUT' || code === 'EMFILE') kind = 'transient';
    return new AppError(kind, err instanceof Error ? err.message : String(err), { cause: err });
  }
}

const TITLES: Record<AppErrorCode, string> = {
  transient: 'Gecici hata',
  permission: 'Yetki reddedildi',
  conflict: 'Cakisma',
  missing: 'Bulunamadi',
  'no-space': 'Yer yok',
  integrity: 'Dogrulama basarisiz',
  cancelled: 'Iptal edildi',
  validation: 'Gecersiz istek',
  fatal: 'Beklenmeyen hata',
};

/** Yalnizca gecici hatalarda ve en fazla 3 denemede yeniden dene. */
export function shouldRetry(err: unknown, attempt: number): boolean {
  if (attempt >= 3) return false;
  return AppError.from(err).retryable;
}
