import { describe, it, expect } from "vitest";
import { compilePlot, toBases, truthTable, treeChildren, layoutTree, pickNext, timerLeft } from "./logic";

describe("compilePlot", () => {
  it("парсит полином и тригонометрию", () => {
    const f = compilePlot("x^2/4 - 2");
    expect(f).not.toBeNull();
    expect(f!(4)).toBeCloseTo(2);
    const g = compilePlot("sin(x) + cos(x)");
    expect(g!(0)).toBeCloseTo(1);
  });
  it("понимает pi и e", () => {
    const f = compilePlot("sin(pi*x)");
    expect(f!(0.5)).toBeCloseTo(1);
  });
  it("режет опасное и мусор", () => {
    expect(compilePlot("alert(1)")).toBeNull();
    expect(compilePlot("x; while(1){}")).toBeNull();
    expect(compilePlot("window")).toBeNull();
    expect(compilePlot("")).toBeNull();
  });
});

describe("toBases", () => {
  it("конвертирует 156₁₀", () => {
    const r = toBases("156", 10)!;
    expect(r[2]).toBe("10011100");
    expect(r[8]).toBe("234");
    expect(r[16]).toBe("9C");
  });
  it("конвертирует из 16", () => {
    expect(toBases("ff", 16)![10]).toBe("255");
  });
  it("отбрасывает мусор («12z8»)", () => {
    expect(toBases("12z8", 10)).toBeNull();
  });
});

describe("truthTable", () => {
  it("строит 8 строк для A,B,C", () => {
    const t = truthTable("(A or B) and not C")!;
    expect(t.vars).toEqual(["A", "B", "C"]);
    expect(t.rows).toHaveLength(8);
    // A=1,B=0,C=0 → 1
    expect(t.rows.find((r) => r.bits.join("") === "100")!.result).toBe(1);
    // C=1 всегда гасит
    expect(t.rows.filter((r) => r.bits[2] === 1).every((r) => r.result === 0)).toBe(true);
  });
  it("импликация A -> B ложна только на 1→0", () => {
    const t = truthTable("A -> B")!;
    expect(t.rows.map((r) => r.result)).toEqual([1, 1, 0, 1]);
  });
  it("режет мусор", () => {
    expect(truthTable("A + process.exit()")).toBeNull();
    expect(truthTable("42")).toBeNull();
  });
});

describe("tree", () => {
  it("ветвит по n+1 / n·2", () => {
    const [a, b] = treeChildren("3");
    expect(a.label).toBe("4");
    expect(b.label).toBe("6");
  });
  it("layoutTree раскладывает уровнями и помнит родителей", () => {
    const root = { label: "2", children: treeChildren("2") };
    const nodes = layoutTree(root);
    expect(nodes).toHaveLength(3);
    expect(nodes[0]!.depth).toBe(0);
    expect(nodes[1]!.parent).toBe(0);
    expect(nodes[2]!.parent).toBe(0);
  });
});

describe("pickNext", () => {
  it("не повторяет до полного круга", () => {
    const names = ["Аня", "Боря"];
    const first = pickNext(names, [])!;
    const second = pickNext(names, first.used)!;
    expect(second.name).not.toBe(first.name);
    const third = pickNext(names, second.used)!; // мешок пуст → новый круг
    expect(names).toContain(third.name);
    expect(third.used).toHaveLength(1);
  });
  it("null на пустом списке", () => {
    expect(pickNext(["  "], [])).toBeNull();
  });
});

describe("timerLeft", () => {
  it("считает от endsAt при running", () => {
    expect(timerLeft({ running: true, endsAt: 10_000 }, 4_000)).toBe(6);
    expect(timerLeft({ running: true, endsAt: 1_000 }, 5_000)).toBe(0);
  });
  it("берёт leftSec на паузе", () => {
    expect(timerLeft({ running: false, leftSec: 300 }, 999)).toBe(300);
  });
});
