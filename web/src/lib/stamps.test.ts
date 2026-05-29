import { describe, it, expect } from "vitest";
import { STAMPS, STAMP_KINDS, STAMP_SIZE, stampToStrokes } from "./stamps";

describe("учительские штампы", () => {
  it("содержит все 4 канонических варианта", () => {
    expect(STAMP_KINDS).toEqual(["plus", "minus", "question", "check"]);
    expect(Object.keys(STAMPS).sort()).toEqual([...STAMP_KINDS].sort());
  });

  it("STAMP_SIZE — положительное число, видимое глазом", () => {
    expect(STAMP_SIZE).toBeGreaterThan(0);
    expect(STAMP_SIZE).toBeLessThan(20); // не должно перекрывать ученика
  });

  it.each(STAMP_KINDS)("'%s' имеет непустой label и хотя бы один stroke", (k) => {
    const spec = STAMPS[k];
    expect(spec.label.length).toBeGreaterThan(0);
    expect(spec.strokes.length).toBeGreaterThanOrEqual(1);
    for (const stroke of spec.strokes) {
      expect(stroke.length).toBeGreaterThanOrEqual(2);
      for (const [x, y, p] of stroke) {
        expect(typeof x).toBe("number");
        expect(typeof y).toBe("number");
        expect(p).toBeGreaterThan(0);
        expect(p).toBeLessThanOrEqual(1);
      }
    }
  });

  it("'+' — два пересекающихся штриха (горизонталь и вертикаль)", () => {
    expect(STAMPS.plus.strokes.length).toBe(2);
  });

  it("'−' — один горизонтальный штрих", () => {
    expect(STAMPS.minus.strokes.length).toBe(1);
    const stroke = STAMPS.minus.strokes[0]!;
    // все точки на одной горизонтали (y одинаковые)
    const ys = stroke.map((p) => p[1]);
    expect(new Set(ys).size).toBe(1);
  });

  it("'✓' — один штрих с тремя точками (вход, низ галки, верх)", () => {
    expect(STAMPS.check.strokes.length).toBe(1);
    expect(STAMPS.check.strokes[0]!.length).toBe(3);
  });

  it("'?' — два штриха: крючок + точка", () => {
    expect(STAMPS.question.strokes.length).toBe(2);
  });

  describe("stampToStrokes", () => {
    it("смещает относительные точки на центр клика", () => {
      const strokes = stampToStrokes("plus", 100, 200);
      expect(strokes.length).toBe(2);
      // Горизонталь plus идёт от (-14, 0) до (14, 0) — после сдвига на (100, 200):
      const horizontal = strokes[0]!;
      expect(horizontal[0]).toEqual([86, 200, 0.7]);
      expect(horizontal[1]).toEqual([114, 200, 0.7]);
      // Вертикаль:
      const vertical = strokes[1]!;
      expect(vertical[0]).toEqual([100, 186, 0.7]);
      expect(vertical[1]).toEqual([100, 214, 0.7]);
    });

    it("сохраняет давление точек неизменным", () => {
      const strokes = stampToStrokes("check", 0, 0);
      const pressures = strokes[0]!.map((p) => p[2]);
      expect(pressures).toEqual([0.55, 0.75, 0.75]);
    });

    it("возвращает пустой массив для неизвестного kind", () => {
      // @ts-expect-error — намеренно нарушаем тип
      const strokes = stampToStrokes("invalid", 0, 0);
      expect(strokes).toEqual([]);
    });

    it("каждый штамп умещается в ~40×40 px вокруг центра", () => {
      for (const k of STAMP_KINDS) {
        const strokes = stampToStrokes(k, 1000, 1000);
        const allPoints = strokes.flat();
        const xs = allPoints.map((p) => p[0]);
        const ys = allPoints.map((p) => p[1]);
        const w = Math.max(...xs) - Math.min(...xs);
        const h = Math.max(...ys) - Math.min(...ys);
        expect(w).toBeLessThan(40);
        expect(h).toBeLessThan(40);
      }
    });
  });
});
