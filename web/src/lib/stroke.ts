import { getStroke } from "perfect-freehand";

export type StrokePoint = [number, number, number];
export type CoordinateSpace = "legacy" | "normalized";
export type BrushKind = "legacy" | "pen" | "marker" | "shape";

export type StrokeViewport = {
  width: number;
  height: number;
};

export type StrokeRecord = {
  id: string;
  color: string;
  size: number;
  simulatePressure: boolean;
  points: StrokePoint[];
  layer?: "student" | "teacher";
  pageIndex?: number;
  coordinateSpace?: CoordinateSpace;
  brushKind?: BrushKind;
  renderVersion?: number;
  /** Client-only delivery target; серверные схемы неизвестные поля отбрасывают. */
  delivery?: "workspace" | "broadcast";
};

export const LEGACY_STROKE_OPTIONS = {
  thinning: 0.55,
  smoothing: 0.55,
  streamline: 0.5,
  start: { taper: 0, cap: true },
  end: { taper: 0, cap: true },
} as const;

export const PEN_V2_OPTIONS = {
  thinning: 0.48,
  smoothing: 0.72,
  streamline: 0.54,
  start: { taper: 0, cap: true },
  end: { taper: 0, cap: true },
} as const;

export const MARKER_V2_OPTIONS = {
  thinning: 0,
  smoothing: 0.82,
  streamline: 0.58,
  start: { taper: 0, cap: true },
  end: { taper: 0, cap: true },
} as const;

export const SHAPE_V2_OPTIONS = {
  thinning: 0,
  smoothing: 0.9,
  streamline: 0.08,
  start: { taper: 0, cap: true },
  end: { taper: 0, cap: true },
} as const;

// Backward-compatible export used by a few older imports/tests.
export const STROKE_OPTIONS = LEGACY_STROKE_OPTIONS;

function positiveDimension(value: number | undefined): number {
  return Number.isFinite(value) && (value ?? 0) > 0 ? value! : 1;
}

export function strokePointsForViewport(
  stroke: Pick<StrokeRecord, "points" | "coordinateSpace">,
  viewport?: StrokeViewport,
): StrokePoint[] {
  if (stroke.coordinateSpace !== "normalized") return stroke.points;
  const width = positiveDimension(viewport?.width);
  const height = positiveDimension(viewport?.height);
  return stroke.points.map(([x, y, pressure]) => [
    x * width,
    y * height,
    pressure,
  ]);
}

export function strokeSizeForViewport(
  stroke: Pick<StrokeRecord, "size" | "coordinateSpace">,
  viewport?: StrokeViewport,
): number {
  if (stroke.coordinateSpace !== "normalized") return stroke.size;
  const width = positiveDimension(viewport?.width);
  const height = positiveDimension(viewport?.height);
  return stroke.size * Math.min(width, height);
}

function optionsForStroke(stroke: StrokeRecord) {
  if ((stroke.renderVersion ?? 1) < 2) return LEGACY_STROKE_OPTIONS;
  if (stroke.brushKind === "marker") return MARKER_V2_OPTIONS;
  if (stroke.brushKind === "shape") return SHAPE_V2_OPTIONS;
  return PEN_V2_OPTIONS;
}

/**
 * Возвращает полигон контура без зависимости от Canvas/Path2D.
 * Это удобно и для тестов, и для превью незавершённого штриха.
 */
export function strokeToOutline(
  stroke: StrokeRecord,
  viewport?: StrokeViewport,
  complete = true,
): number[][] {
  return getStroke(strokePointsForViewport(stroke, viewport), {
    ...optionsForStroke(stroke),
    size: strokeSizeForViewport(stroke, viewport),
    simulatePressure: stroke.simulatePressure,
    last: complete,
  });
}

/**
 * Превратить штрих (массив точек) в Path2D — готовый к draw на Canvas.
 * Возвращает null, если штрих слишком короткий для отрисовки.
 */
export function strokeToPath(
  stroke: StrokeRecord,
  viewport?: StrokeViewport,
  complete = true,
): Path2D | null {
  const outline = strokeToOutline(stroke, viewport, complete);
  if (outline.length < 2) return null;
  const p = new Path2D();
  p.moveTo(outline[0]![0]!, outline[0]![1]!);
  for (let i = 1; i < outline.length; i++) {
    p.lineTo(outline[i]![0]!, outline[i]![1]!);
  }
  p.closePath();
  return p;
}

export function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: StrokeRecord,
  viewport?: StrokeViewport,
  complete = true,
) {
  const path = strokeToPath(stroke, viewport, complete);
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
