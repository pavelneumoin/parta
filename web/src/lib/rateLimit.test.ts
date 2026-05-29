import { describe, it, expect, beforeEach, vi } from "vitest";
import { checkRateLimit, getClientIp } from "./rateLimit";

// Изолируем store между тестами через уникальные ключи
const uid = () => Math.random().toString(36).slice(2);

describe("checkRateLimit", () => {
  it("разрешает первые N запросов за минуту", () => {
    const key = uid();
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(key, 5)).toBe(true);
    }
  });

  it("блокирует (N+1)-й запрос", () => {
    const key = uid();
    for (let i = 0; i < 5; i++) checkRateLimit(key, 5);
    expect(checkRateLimit(key, 5)).toBe(false);
  });

  it("разные ключи не влияют друг на друга", () => {
    const k1 = uid(), k2 = uid();
    for (let i = 0; i < 5; i++) checkRateLimit(k1, 5);
    // k2 — чистый, первый запрос разрешён
    expect(checkRateLimit(k2, 5)).toBe(true);
  });

  it("limit=1 — второй запрос заблокирован", () => {
    const key = uid();
    expect(checkRateLimit(key, 1)).toBe(true);
    expect(checkRateLimit(key, 1)).toBe(false);
  });

  it("после истечения окна счётчик сбрасывается (мок времени)", () => {
    const key = uid();
    const realNow = Date.now;

    // Заполняем лимит
    let fakeNow = 0;
    vi.spyOn(Date, "now").mockImplementation(() => fakeNow);
    for (let i = 0; i < 3; i++) checkRateLimit(key, 3);
    expect(checkRateLimit(key, 3)).toBe(false);

    // Прыгаем на 61 секунду вперёд
    fakeNow = 61_000;
    expect(checkRateLimit(key, 3)).toBe(true);

    vi.restoreAllMocks();
    void realNow;
  });
});

describe("getClientIp", () => {
  it("берёт первый адрес из x-forwarded-for", () => {
    const headers = { get: (n: string) => n === "x-forwarded-for" ? "1.2.3.4, 5.6.7.8" : null };
    expect(getClientIp(headers)).toBe("1.2.3.4");
  });

  it("фолбэк на x-real-ip", () => {
    const headers = { get: (n: string) => n === "x-real-ip" ? "9.10.11.12" : null };
    expect(getClientIp(headers)).toBe("9.10.11.12");
  });

  it("возвращает 'unknown' если нет заголовков", () => {
    const headers = { get: () => null };
    expect(getClientIp(headers)).toBe("unknown");
  });
});
