export type InputMode = "auto" | "pen" | "touch";

export type InkPointerType = "mouse" | "pen" | "touch" | (string & {});

/**
 * DOM-independent subset of PointerEvent used by the ink engine.
 * All dimensions are CSS pixels and timestamps must use the same clock.
 */
export type PointerSample = {
  pointerId: number;
  pointerType: InkPointerType;
  clientX: number;
  clientY: number;
  pressure: number;
  button?: number;
  buttons?: number;
  width?: number;
  height?: number;
  timeStamp?: number;
  isPrimary?: boolean;
};

export type PointerSampleSource = PointerSample & {
  getCoalescedEvents?: () => readonly PointerSample[] | null | undefined;
};

export type RectLike = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type BoardSize = {
  width: number;
  height: number;
};

export type NormalizedInkPoint = [x: number, y: number, pressure: number];

export type StabilizationLevel = "natural" | "neat";

export type AppendPointResult = "appended" | "deduplicated" | "replaced-at-limit";

export type Point2D = readonly [x: number, y: number];

export type PointerAcceptanceContext = {
  mode: InputMode;
  now: number;
  activePointerId?: number | null;
  lastPenAt?: number | null;
  recentPenWindowMs?: number;
  palmContactThresholdPx?: number;
};

export const RECENT_PEN_WINDOW_MS = 900;
export const PALM_CONTACT_THRESHOLD_PX = 32;
export const MAX_STROKE_POINTS = 4_000;

const STABILIZATION = {
  natural: {
    minimumDistancePx: 0.3,
    positionAlpha: 0.92,
    pressureAlpha: 0.55,
  },
  neat: {
    minimumDistancePx: 0.65,
    positionAlpha: 0.72,
    pressureAlpha: 0.32,
  },
} as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function clampPressure(pressure: number): number {
  return Number.isFinite(pressure) ? clamp(pressure, 0, 1) : 0.5;
}

function clampNormalized(value: number): number {
  return Number.isFinite(value) ? clamp(value, 0, 1) : 0;
}

/**
 * Pointer Events report the eraser end of many pens as button 5 / buttons bit 32.
 * `pointerType: "eraser"` is not part of the Pointer Events standard.
 */
export function isPenEraser(
  sample: Pick<PointerSample, "pointerType" | "button" | "buttons">,
): boolean {
  return (
    sample.pointerType === "pen" &&
    (sample.button === 5 || ((sample.buttons ?? 0) & 32) !== 0)
  );
}

/**
 * Contact dimensions are only a heuristic: they supplement, rather than replace,
 * explicit input modes and the recent-pen guard.
 */
export function isLikelyPalm(
  sample: Pick<PointerSample, "pointerType" | "width" | "height">,
  contactThresholdPx = PALM_CONTACT_THRESHOLD_PX,
): boolean {
  if (sample.pointerType !== "touch") return false;
  const width = Math.max(0, sample.width ?? 0);
  const height = Math.max(0, sample.height ?? 0);
  return Math.max(width, height) >= contactThresholdPx;
}

/**
 * Decides whether a pointer may start or continue the one active ink stroke.
 * Mouse remains available in auto mode; explicit pen/touch modes accept only
 * their named input device.
 */
export function shouldAcceptPointer(
  sample: PointerSample,
  context: PointerAcceptanceContext,
): boolean {
  if (sample.isPrimary === false) return false;

  if (
    context.activePointerId !== undefined &&
    context.activePointerId !== null &&
    context.activePointerId !== sample.pointerId
  ) {
    return false;
  }

  if (context.mode === "pen") return sample.pointerType === "pen";
  if (context.mode === "touch") {
    return (
      sample.pointerType === "touch" &&
      !isLikelyPalm(sample, context.palmContactThresholdPx)
    );
  }

  if (sample.pointerType === "pen" || sample.pointerType === "mouse") {
    return true;
  }
  if (sample.pointerType !== "touch") return false;
  if (isLikelyPalm(sample, context.palmContactThresholdPx)) return false;

  const lastPenAt = context.lastPenAt;
  if (lastPenAt !== undefined && lastPenAt !== null) {
    const elapsed = context.now - lastPenAt;
    const windowMs = context.recentPenWindowMs ?? RECENT_PEN_WINDOW_MS;
    if (elapsed >= 0 && elapsed < windowMs) return false;
  }

  return true;
}

/**
 * Converts a client-space pointer position into a stable 0..1 board position.
 * Captured pointers that move outside the board are clamped to its edges.
 */
export function clientToNormalizedPoint(
  sample: Pick<PointerSample, "clientX" | "clientY" | "pressure">,
  rect: RectLike,
): NormalizedInkPoint {
  if (
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height) ||
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    throw new RangeError("Board rectangle must have positive finite dimensions");
  }

  return [
    clampNormalized((sample.clientX - rect.left) / rect.width),
    clampNormalized((sample.clientY - rect.top) / rect.height),
    clampPressure(sample.pressure),
  ];
}

/**
 * Browsers may expose getCoalescedEvents but return an empty array. In that
 * case (or when the API throws) the original event must still be processed.
 */
export function collectPointerSamples(source: PointerSampleSource): PointerSample[] {
  if (typeof source.getCoalescedEvents !== "function") return [source];

  try {
    const coalesced = source.getCoalescedEvents();
    return coalesced && coalesced.length > 0 ? Array.from(coalesced) : [source];
  } catch {
    return [source];
  }
}

function assertBoardSize(boardSize: BoardSize) {
  if (
    !Number.isFinite(boardSize.width) ||
    !Number.isFinite(boardSize.height) ||
    boardSize.width <= 0 ||
    boardSize.height <= 0
  ) {
    throw new RangeError("Board size must have positive finite dimensions");
  }
}

function sanitizePoint(point: NormalizedInkPoint): NormalizedInkPoint {
  return [
    clampNormalized(point[0]),
    clampNormalized(point[1]),
    clampPressure(point[2]),
  ];
}

/**
 * Mutates `points` for low-allocation pointer handling.
 *
 * - distance thresholds are evaluated in board pixels, not normalized units;
 * - position and pressure use separate exponential moving averages;
 * - near-identical samples update pressure without adding another point;
 * - at 4000 points the tail is replaced so the visible endpoint stays current.
 */
export function appendStabilizedPoint(
  points: NormalizedInkPoint[],
  candidate: NormalizedInkPoint,
  boardSize: BoardSize,
  level: StabilizationLevel,
): AppendPointResult {
  assertBoardSize(boardSize);
  const next = sanitizePoint(candidate);
  const config = STABILIZATION[level];

  if (points.length === 0) {
    points.push(next);
    return "appended";
  }

  if (points.length > MAX_STROKE_POINTS) {
    points.length = MAX_STROKE_POINTS;
  }

  const previous = points[points.length - 1]!;
  const dxPx = (next[0] - previous[0]) * boardSize.width;
  const dyPx = (next[1] - previous[1]) * boardSize.height;
  const distancePx = Math.hypot(dxPx, dyPx);
  const smoothedPressure =
    previous[2] + (next[2] - previous[2]) * config.pressureAlpha;

  if (distancePx < config.minimumDistancePx) {
    previous[2] = clampPressure(smoothedPressure);
    return "deduplicated";
  }

  const stabilized: NormalizedInkPoint = [
    clampNormalized(previous[0] + (next[0] - previous[0]) * config.positionAlpha),
    clampNormalized(previous[1] + (next[1] - previous[1]) * config.positionAlpha),
    clampPressure(smoothedPressure),
  ];

  if (points.length >= MAX_STROKE_POINTS) {
    points[MAX_STROKE_POINTS - 1] = stabilized;
    return "replaced-at-limit";
  }

  points.push(stabilized);
  return "appended";
}

export function shouldSimulatePressure(
  pointer: InkPointerType | Pick<PointerSample, "pointerType">,
): boolean {
  const pointerType = typeof pointer === "string" ? pointer : pointer.pointerType;
  return pointerType !== "pen";
}

/**
 * perfect-freehand can render a dot from two identical points, while the stroke
 * upload API also requires at least two points.
 */
export function ensureTapStroke(
  points: readonly NormalizedInkPoint[],
): NormalizedInkPoint[] {
  if (points.length === 0) return [];
  if (points.length > 1) return Array.from(points, (point) => [...point]);

  const point = sanitizePoint(points[0]!);
  return [point, [...point]];
}

export function pointInCircle(
  point: Point2D,
  center: Point2D,
  radius: number,
): boolean {
  if (!Number.isFinite(radius) || radius < 0) return false;
  const dx = point[0] - center[0];
  const dy = point[1] - center[1];
  return dx * dx + dy * dy <= radius * radius;
}

export function pointToSegmentDistanceSquared(
  point: Point2D,
  start: Point2D,
  end: Point2D,
): number {
  const vx = end[0] - start[0];
  const vy = end[1] - start[1];
  const lengthSquared = vx * vx + vy * vy;

  if (lengthSquared === 0) {
    const dx = point[0] - start[0];
    const dy = point[1] - start[1];
    return dx * dx + dy * dy;
  }

  const wx = point[0] - start[0];
  const wy = point[1] - start[1];
  const t = clamp((wx * vx + wy * vy) / lengthSquared, 0, 1);
  const closestX = start[0] + t * vx;
  const closestY = start[1] + t * vy;
  const dx = point[0] - closestX;
  const dy = point[1] - closestY;
  return dx * dx + dy * dy;
}

export function segmentIntersectsCircle(
  start: Point2D,
  end: Point2D,
  center: Point2D,
  radius: number,
): boolean {
  if (!Number.isFinite(radius) || radius < 0) return false;
  return pointToSegmentDistanceSquared(center, start, end) <= radius * radius;
}
