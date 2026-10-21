/**
 * SSE yardimcisi. EventSource cerezi otomatik gonderir; yeniden baglanmayi
 * tarayici yonetir (`Last-Event-ID`).
 */
export function openEvents<T>(
  path: string,
  onEvent: (event: T) => void,
  onError?: (fatal: boolean) => void,
): () => void {
  const source = new EventSource(path);
  source.onmessage = (message) => {
    try {
      onEvent(JSON.parse(message.data) as T);
    } catch {
      /* bozuk olay akisi durdurmaz */
    }
  };
  source.onerror = () => {
    onError?.(source.readyState === EventSource.CLOSED);
  };
  return () => source.close();
}
