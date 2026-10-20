/**
 * PLAN SAATI.
 *
 * Planin 10 dakikalik omrunu ve geri sayim etiketini hesaplar. Bu kural
 * arayuzde tekrarlanmaz; ayni plan her yerde ayni sekilde "suresi doldu"
 * olur.
 *
 * Bu modul SAF TypeScript'tir: node builtin importu YOKTUR.
 */

export interface PlanClockState {
  /** Planin suresi doldu mu? (expiresAt <= 0 ise asla dolmaz.) */
  expired: boolean;
  /** Kalan saniye (alt sinir 0). */
  remainingSec: number;
  /** Iki haneli dakika. */
  mm: string;
  /** Iki haneli saniye. */
  ss: string;
}

export class PlanClock {
  private readonly expiresAt: number;

  constructor(expiresAt: number) {
    this.expiresAt = expiresAt;
  }

  /** Plana bir son kullanma zamani atanmis mi? */
  get hasExpiry(): boolean {
    return this.expiresAt > 0;
  }

  /** Kalan saniye; sure yoksa 0. */
  remainingSec(now: number): number {
    if (!this.hasExpiry) return 0;
    return Math.max(0, Math.floor((this.expiresAt - now) / 1000));
  }

  /** Plan suresi doldu mu? */
  expired(now: number): boolean {
    return this.hasExpiry && now > this.expiresAt;
  }

  /** Gosterime hazir geri sayim durumu. */
  state(now: number): PlanClockState {
    const remainingSec = this.remainingSec(now);
    return {
      expired: this.expired(now),
      remainingSec,
      mm: pad2(Math.floor(remainingSec / 60)),
      ss: pad2(remainingSec % 60),
    };
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}
