// Чистая логика предметных инструментов доски — без DOM, тестируется vitest.

/** Компилирует y=f(x) из безопасного подмножества: числа, x, + - * / ^ ( ),
 *  sin cos tan sqrt abs ln log exp, pi, e. Возвращает функцию или null. */
export function compilePlot(src: string): ((x: number) => number) | null {
  const cleaned = src.replace(/\s+/g, "").replace(/,/g, ".");
  if (!cleaned || cleaned.length > 120) return null;
  // разрешённая лексика до подстановок
  if (!/^[0-9x+\-*/^().a-z]+$/i.test(cleaned)) return null;
  const js = cleaned
    .replace(/(sin|cos|tan|sqrt|abs|exp)/g, "Math.$1")
    .replace(/\bln\b/g, "Math.log")
    .replace(/\blog\b/g, "Math.log10")
    .replace(/\bpi\b/g, "Math.PI")
    .replace(/\be\b/g, "Math.E")
    .replace(/\^/g, "**");
  // после подстановок не должно остаться «голых» идентификаторов кроме x и Math.*
  const residue = js.replace(/Math\.(sin|cos|tan|sqrt|abs|exp|log10|log|PI|E)/g, "").replace(/x/g, "");
  if (/[a-zA-Z]/.test(residue)) return null;
  try {
    const f = new Function("x", `"use strict"; return (${js});`) as (x: number) => number;
    const probe = f(1.234);
    if (typeof probe !== "number") return null;
    return f;
  } catch {
    return null;
  }
}

/** Число в системах счисления 2/8/10/16. null — не разобрали. */
export function toBases(value: string, from: number): Record<number, string> | null {
  const v = value.trim().toLowerCase();
  if (!v || v.length > 24) return null;
  const n = parseInt(v, from);
  if (!Number.isFinite(n) || n < 0) return null;
  // parseInt терпит мусор в хвосте («12z8» → 12) — проверяем круговой конверсией
  if (n.toString(from) !== v.replace(/^0+(?=.)/, "")) return null;
  const out: Record<number, string> = {};
  for (const base of [2, 8, 10, 16]) out[base] = n.toString(base).toUpperCase();
  return out;
}

export type TruthTable = { vars: string[]; rows: { bits: number[]; result: number }[] };

/** Таблица истинности для выражения из A,B,C и and/or/not/xor/->. null — ошибка разбора. */
export function truthTable(expr: string): TruthTable | null {
  if (!expr.trim() || expr.length > 120) return null;
  const vars = [...new Set(expr.toUpperCase().match(/[ABC]/g) ?? [])].sort();
  if (!vars.length) return null;
  let js = expr
    .replace(/->/g, "<=")
    .replace(/\bxor\b/gi, "!==")
    .replace(/\band\b/gi, "&&")
    .replace(/\bor\b/gi, "||")
    .replace(/\bnot\b/gi, "!")
    .replace(/[ABC]/gi, (m) => m.toLowerCase());
  if (!/^[abc\s()!&|<=>]+$/.test(js)) return null;
  let f: (...bits: number[]) => boolean;
  try {
    f = new Function(...vars.map((v) => v.toLowerCase()), `"use strict"; return !!(${js});`) as typeof f;
    f(...vars.map(() => 0));
  } catch {
    return null;
  }
  const rows: TruthTable["rows"] = [];
  for (let i = 0; i < 1 << vars.length; i++) {
    const bits = vars.map((_, j) => (i >> (vars.length - 1 - j)) & 1);
    rows.push({ bits, result: f(...bits) ? 1 : 0 });
  }
  return { vars, rows };
}

export type TreeNode = { label: string; children: TreeNode[] };

/** Потомки узла для дерева «n+1 / n·2» (задания 19–21); нечисловые — «?». */
export function treeChildren(label: string): [TreeNode, TreeNode] {
  const v = parseInt(label, 10);
  if (Number.isNaN(v)) {
    return [{ label: "?", children: [] }, { label: "?", children: [] }];
  }
  return [
    { label: String(v + 1), children: [] },
    { label: String(v * 2), children: [] },
  ];
}

/** Раскладка дерева по уровням: возвращает узлы с координатами в [0..1]. */
export function layoutTree(root: TreeNode): { node: TreeNode; x: number; y: number; parent: number | null; depth: number }[] {
  const out: { node: TreeNode; x: number; y: number; parent: number | null; depth: number }[] = [];
  const levels: TreeNode[][] = [];
  (function collect(n: TreeNode, d: number) {
    (levels[d] ??= []).push(n);
    n.children.forEach((c) => collect(c, d + 1));
  })(root, 0);
  const depthMax = Math.max(1, levels.length - 1);
  const index = new Map<TreeNode, number>();
  levels.forEach((nodes, d) =>
    nodes.forEach((n, i) => {
      index.set(n, out.length);
      out.push({
        node: n,
        x: (i + 1) / (nodes.length + 1),
        y: depthMax === 0 ? 0.5 : d / depthMax,
        parent: null,
        depth: d,
      });
    }),
  );
  // проставляем родителей вторым проходом
  (function link(n: TreeNode) {
    n.children.forEach((c) => {
      out[index.get(c)!]!.parent = index.get(n)!;
      link(c);
    });
  })(root);
  return out;
}

/** «Мешок без повторов»: выбирает следующее имя, обновляя использованные. */
export function pickNext(names: string[], used: string[]): { name: string; used: string[] } | null {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  if (!clean.length) return null;
  let bag = clean.filter((n) => !used.includes(n));
  let nextUsed = used;
  if (!bag.length) {
    bag = clean;
    nextUsed = [];
  }
  const name = bag[Math.floor(Math.random() * bag.length)]!;
  return { name, used: [...nextUsed, name] };
}

/** Оставшиеся секунды таймера из сериализованного состояния (синк по endsAt). */
export function timerLeft(state: { running?: boolean; endsAt?: number | null; leftSec?: number; durSec?: number }, now: number): number {
  if (state.running && typeof state.endsAt === "number") {
    return Math.max(0, Math.round((state.endsAt - now) / 1000));
  }
  return Math.max(0, Math.round(state.leftSec ?? state.durSec ?? 0));
}
