// Учительские штампы — пакеты из 1-2 strokes вокруг центра клика.
// Координаты относительные (центр = 0,0). Применяются как обычные штрихи
// со стандартным perfect-freehand рендером.

export type StampKind = "plus" | "minus" | "question" | "check";

export const STAMP_SIZE = 6;

export const STAMPS: Record<StampKind, {
  label: string;
  strokes: [number, number, number][][];
}> = {
  plus: {
    label: "Хорошо",
    strokes: [
      [[-14, 0, 0.7], [14, 0, 0.7]],
      [[0, -14, 0.7], [0, 14, 0.7]],
    ],
  },
  minus: {
    label: "Спорно",
    strokes: [[[-14, 0, 0.7], [14, 0, 0.7]]],
  },
  question: {
    label: "Подумай",
    strokes: [
      [
        [-8, -8, 0.55],
        [-4, -13, 0.7],
        [2, -13, 0.75],
        [8, -9, 0.7],
        [4, -3, 0.7],
        [0, 1, 0.7],
        [0, 6, 0.7],
      ],
      [
        [0, 11, 0.8],
        [0.5, 11.5, 0.8],
      ],
    ],
  },
  check: {
    label: "Верно",
    strokes: [
      [
        [-12, 0, 0.55],
        [-4, 9, 0.75],
        [12, -10, 0.75],
      ],
    ],
  },
};

export const STAMP_KINDS: StampKind[] = ["plus", "minus", "question", "check"];

/** Превращает stamp-spec в массив абсолютных точек вокруг центра клика. */
export function stampToStrokes(
  kind: StampKind,
  cx: number,
  cy: number,
): [number, number, number][][] {
  const spec = STAMPS[kind];
  if (!spec) return [];
  return spec.strokes.map((rel) =>
    rel.map<[number, number, number]>(([rx, ry, p]) => [cx + rx, cy + ry, p]),
  );
}
