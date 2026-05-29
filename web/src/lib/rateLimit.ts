/**
 * In-memory sliding-window rate limiter.
 * Статeful в рамках одного Node.js-процесса — сбрасывается при cold start.
 * Достаточно для MVP-монолита; для multi-replica заменить на Redis.
 */

type Window = { ts: number[] };

const store = new Map<string, Window>();

/**
 * Проверяет, укладывается ли запрос в лимит.
 * @returns true — запрос разрешён, false — лимит исчерпан (429).
 */
export function checkRateLimit(key: string, limitPerMinute: number): boolean {
  const now = Date.now();
  const windowMs = 60_000;

  const entry = store.get(key) ?? { ts: [] };
  // убираем устаревшие метки за пределами скользящего окна
  entry.ts = entry.ts.filter((t) => now - t < windowMs);

  if (entry.ts.length >= limitPerMinute) {
    store.set(key, entry);
    return false; // rate limited
  }

  entry.ts.push(now);
  store.set(key, entry);
  return true;
}

/** Извлекает IP из заголовков Next.js Request (proxy-aware). */
export function getClientIp(headers: { get(name: string): string | null }): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headers.get("x-real-ip") ??
    "unknown"
  );
}

/**
 * Периодически очищает старые ключи, чтобы store не рос бесконечно.
 * Вызывается автоматически каждые 10 минут.
 */
function gc() {
  const cutoff = Date.now() - 60_000;
  for (const [key, win] of store) {
    if (win.ts.every((t) => t < cutoff)) {
      store.delete(key);
    }
  }
}

// Запускаем GC только в runtime (не в тестах / при импорте в edge)
if (typeof setInterval !== "undefined") {
  setInterval(gc, 10 * 60_000).unref?.();
}
