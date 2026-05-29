import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { formatScheduled, isToday, minutesUntil } from "./dates";

describe("formatScheduled", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Фиксируем "сегодня" = 15 марта 2026, 12:00
    vi.setSystemTime(new Date(2026, 2, 15, 12, 0, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("пустые входные → пустая строка", () => {
    expect(formatScheduled(null)).toBe("");
    expect(formatScheduled(undefined)).toBe("");
    expect(formatScheduled("")).toBe("");
  });

  it("невалидная дата → пустая строка", () => {
    expect(formatScheduled("not-a-date")).toBe("");
  });

  it("сегодня 10:30 → 'Сегодня в 10:30'", () => {
    const d = new Date(2026, 2, 15, 10, 30);
    expect(formatScheduled(d)).toBe("Сегодня в 10:30");
  });

  it("завтра → 'Завтра в HH:MM'", () => {
    const d = new Date(2026, 2, 16, 9, 0);
    expect(formatScheduled(d)).toBe("Завтра в 09:00");
  });

  it("вчера → 'Вчера в HH:MM'", () => {
    const d = new Date(2026, 2, 14, 16, 15);
    expect(formatScheduled(d)).toBe("Вчера в 16:15");
  });

  it("через 3 дня (понедельник) → 'пн в HH:MM' (15.03.2026 — воскр, 18.03 — ср)", () => {
    const d = new Date(2026, 2, 18, 8, 0);
    expect(formatScheduled(d)).toMatch(/^(пн|вт|ср|чт|пт|сб|воскр) в \d{2}:\d{2}$/);
  });

  it("далеко в будущем → '25 мар в HH:MM'", () => {
    const d = new Date(2026, 2, 25, 14, 0);
    expect(formatScheduled(d)).toBe("25 мар в 14:00");
  });

  it("принимает строку ISO", () => {
    const iso = new Date(2026, 2, 15, 10, 30).toISOString();
    expect(formatScheduled(iso)).toBe("Сегодня в 10:30");
  });
});

describe("isToday", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 1, 9, 0, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("сегодня (тот же день) → true", () => {
    expect(isToday(new Date(2026, 5, 1, 0, 0))).toBe(true);
    expect(isToday(new Date(2026, 5, 1, 23, 59))).toBe(true);
  });

  it("завтра → false", () => {
    expect(isToday(new Date(2026, 5, 2, 0, 0))).toBe(false);
  });

  it("null/undefined → false", () => {
    expect(isToday(null)).toBe(false);
    expect(isToday(undefined)).toBe(false);
  });
});

describe("minutesUntil", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("через 30 минут → 30", () => {
    const d = new Date(2026, 0, 1, 12, 30, 0);
    expect(minutesUntil(d)).toBe(30);
  });

  it("через час → 60", () => {
    const d = new Date(2026, 0, 1, 13, 0, 0);
    expect(minutesUntil(d)).toBe(60);
  });

  it("10 минут назад → -10", () => {
    const d = new Date(2026, 0, 1, 11, 50, 0);
    expect(minutesUntil(d)).toBe(-10);
  });
});
