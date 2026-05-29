import { describe, expect, it, beforeAll, vi } from "vitest";
import { strokeToPath, uuid, type StrokeRecord } from "./stroke";

// Path2D — браузерное API. В Node-среде делаем минимальный stub: считаем вызовы
// и сохраняем, чтобы strokeToPath отработал и можно было утверждать, что он
// возвращает «что-то Path2D-подобное».
beforeAll(() => {
  class FakePath2D {
    public ops: string[] = [];
    moveTo() { this.ops.push("moveTo"); }
    lineTo() { this.ops.push("lineTo"); }
    closePath() { this.ops.push("closePath"); }
  }
  vi.stubGlobal("Path2D", FakePath2D);
});

const baseStroke: StrokeRecord = {
  id: "test-1",
  color: "#0c0d10",
  size: 4,
  simulatePressure: false,
  points: [
    [10, 10, 0.5],
    [20, 20, 0.5],
    [30, 30, 0.5],
    [40, 40, 0.5],
  ],
};

describe("strokeToPath", () => {
  it("возвращает non-null для штриха ≥2 точек", () => {
    const p = strokeToPath(baseStroke);
    expect(p).not.toBeNull();
  });

  it("слишком короткий штрих не падает", () => {
    const p = strokeToPath({ ...baseStroke, points: [[0, 0, 0.5]] });
    // perfect-freehand может вернуть null или Path-подобное — главное не выбрасывает
    expect(() => p).not.toThrow();
  });

  it("делает moveTo + lineTo минимум один раз", () => {
    const p = strokeToPath(baseStroke) as unknown as { ops: string[] } | null;
    expect(p).not.toBeNull();
    expect(p!.ops).toContain("moveTo");
    expect(p!.ops).toContain("lineTo");
  });
});

describe("uuid", () => {
  it("выдаёт уникальные значения", () => {
    const set = new Set<string>();
    for (let i = 0; i < 100; i++) set.add(uuid());
    expect(set.size).toBe(100);
  });

  it("длина разумная (≥16 символов)", () => {
    expect(uuid().length).toBeGreaterThanOrEqual(16);
  });
});
