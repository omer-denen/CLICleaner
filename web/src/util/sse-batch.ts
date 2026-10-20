/**
 * SSE olaylarini kucuk pencerelerde toplayip TEK guncellemeye indirir.
 *
 * Tarama akisi saniyede yuzlerce olay uretebilir; her olay icin ayri
 * `setState` cagirmak listeyi yeniden cizmekten pahaliya gelir. Tampon
 * 120 ms bekler, sonra `requestAnimationFrame` ile boyama karesine
 * hizalanir. Terminal olaylar (`done`/`cancelled`/`error`) icin
 * `flush()` cagrilir; boylece sonuc gecikmeden gorunur.
 */

export interface SseBatcher<T> {
  push(event: T): void;
  /** Beklemeden bosalt (bitis olaylari, iptal, kapanis). */
  flush(): void;
  /** Zamanlayiciyi iptal et ve kuyrugu at (bilesen kapanirken). */
  dispose(): void;
}

export function createSseBatcher<T>(
  onBatch: (events: T[]) => void,
  intervalMs = 120,
): SseBatcher<T> {
  let queue: T[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let frame: number | null = null;
  let disposed = false;

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const clearFrame = () => {
    if (frame !== null) {
      cancelAnimationFrame(frame);
      frame = null;
    }
  };

  const flush = () => {
    clearTimer();
    clearFrame();
    if (queue.length === 0) return;
    const batch = queue;
    queue = [];
    onBatch(batch);
  };

  const schedule = () => {
    if (disposed || timer !== null || frame !== null) return;
    timer = setTimeout(() => {
      timer = null;
      // Boyama karesine hizala: tek render, tek layout.
      if (typeof requestAnimationFrame === 'function') {
        frame = requestAnimationFrame(() => {
          frame = null;
          flush();
        });
      } else {
        flush();
      }
    }, intervalMs);
  };

  return {
    push(event) {
      if (disposed) return;
      queue.push(event);
      schedule();
    },
    flush() {
      if (disposed) return;
      flush();
    },
    dispose() {
      disposed = true;
      clearTimer();
      clearFrame();
      queue = [];
    },
  };
}
