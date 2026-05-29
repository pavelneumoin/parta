import { getStroke } from "perfect-freehand";

export type StrokePoint = [number, number, number];

export type StrokeRecord = {
  id: string;
  color: string;
  size: number;
  simulatePressure: boolean;
  points: StrokePoint[];
  layer?: "student" | "teacher";
  pageIndex?: number;
};

export const STROKE_OPTIONS = {
  thinning: 0.55,
  smoothing: 0.55,
  streamline: 0.5,
  start: { taper: 0, cap: true },
  end: { taper: 0, cap: true },
} as const;

/**
 * Превратить штрих (массив точек) в Path2D — готовый к draw на Canvas.
 * Возвращает null, если штрих слишком короткий для отрисовки.
 */
export function strokeToPath(stroke: StrokeRecord): Path2D | null {
  const outline = getStroke(stroke.points, {
    ...STROKE_OPTIONS,
    size: stroke.size,
    simulatePressure: stroke.simulatePressure,
  });
  if (outline.length < 2) return null;
  const p = new Path2D();
  p.moveTo(outline[0]![0]!, outline[0]![1]!);
  for (let i = 1; i < outline.length; i++) {
    p.lineTo(outline[i]![0]!, outline[i]![1]!);
  }
  p.closePath();
  return p;
}

export function drawStroke(ctx: CanvasRenderingContext2D, stroke: StrokeRecord) {
  const path = strokeToPath(stroke);
  if (!path) return;
  ctx.fillStyle = stroke.color;
  ctx.fill(path);
}

export function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 10)
  );
}
