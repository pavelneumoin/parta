import { describe, expect, it, beforeAll, vi } from "vitest";
import {
  strokePointsForViewport,
  strokeSizeForViewport,
  strokeToOutline,
  strokeToPath,
  uuid,
  type StrokeRecord,
} from "./stroke";

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

describe("ink v2 coordinate space", () => {
  const normalizedStroke: StrokeRecord = {
    ...baseStroke,
    coordinateSpace: "normalized",
    brushKind: "pen",
    renderVersion: 2,
    size: 0.01,
    points: [
      [0.1, 0.2, 0.4],
      [0.5, 0.8, 0.7],
    ],
  };

  it("масштабирует координаты относительно текущего листа", () => {
    expect(
      strokePointsForViewport(normalizedStroke, { width: 1000, height: 500 }),
    ).toEqual([
      [100, 100, 0.4],
      [500, 400, 0.7],
    ]);
  });

  it("масштабирует толщину по меньшей стороне листа", () => {
    expect(
      strokeSizeForViewport(normalizedStroke, { width: 1000, height: 500 }),
    ).toBe(5);
  });

  it("live и завершённый контуры строятся без ошибок", () => {
    expect(
      strokeToOutline(
        normalizedStroke,
        { width: 1000, height: 500 },
        false,
      ).length,
    ).toBeGreaterThan(1);
    expect(
      strokeToOutline(
        normalizedStroke,
        { width: 1000, height: 500 },
        true,
      ).length,
    ).toBeGreaterThan(1);
  });

  it("legacy-штрихи сохраняют исходные координаты и толщину", () => {
    expect(
      strokePointsForViewport(baseStroke, { width: 2000, height: 1000 }),
    ).toBe(baseStroke.points);
    expect(
      strokeSizeForViewport(baseStroke, { width: 2000, height: 1000 }),
    ).toBe(baseStroke.size);
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
