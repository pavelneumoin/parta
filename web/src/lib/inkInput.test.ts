import { describe, expect, it } from "vitest";
import {
  MAX_STROKE_POINTS,
  PALM_CONTACT_THRESHOLD_PX,
  RECENT_PEN_WINDOW_MS,
  appendStabilizedPoint,
  clientToNormalizedPoint,
  collectPointerSamples,
  ensureTapStroke,
  isLikelyPalm,
  isPenEraser,
  pointInCircle,
  pointToSegmentDistanceSquared,
  segmentIntersectsCircle,
  shouldAcceptPointer,
  shouldSimulatePressure,
  type NormalizedInkPoint,
  type PointerSample,
  type PointerSampleSource,
} from "./inkInput";

function sample(overrides: Partial<PointerSample> = {}): PointerSample {
  return {
    pointerId: 1,
    pointerType: "touch",
    clientX: 50,
    clientY: 75,
    pressure: 0.5,
    width: 10,
    height: 12,
    isPrimary: true,
    ...overrides,
  };
}

describe("pen eraser and palm detection", () => {
  it("recognizes the standard pen eraser button and buttons bit", () => {
    expect(isPenEraser(sample({ pointerType: "pen", button: 5 }))).toBe(true);
    expect(isPenEraser(sample({ pointerType: "pen", button: 0, buttons: 32 }))).toBe(true);
    expect(isPenEraser(sample({ pointerType: "pen", button: 0, buttons: 1 }))).toBe(false);
  });

  it("does not mistake a mouse button mask for a pen eraser", () => {
    expect(isPenEraser(sample({ pointerType: "mouse", button: 5, buttons: 32 }))).toBe(false);
  });

  it("treats only a wide touch contact as a likely palm", () => {
    expect(
      isLikelyPalm(sample({ width: PALM_CONTACT_THRESHOLD_PX - 1, height: 12 })),
    ).toBe(false);
    expect(
      isLikelyPalm(sample({ width: 12, height: PALM_CONTACT_THRESHOLD_PX })),
    ).toBe(true);
    expect(
      isLikelyPalm(sample({ pointerType: "pen", width: 80, height: 80 })),
    ).toBe(false);
  });
});

describe("shouldAcceptPointer", () => {
  const now = 10_000;

  it("accepts a narrow touch in auto mode when no pen was seen recently", () => {
    expect(
      shouldAcceptPointer(sample(), {
        mode: "auto",
        now,
        activePointerId: null,
        lastPenAt: null,
      }),
    ).toBe(true);
  });

  it("rejects touch for 900ms after pen activity and accepts it at the boundary", () => {
    expect(
      shouldAcceptPointer(sample(), {
        mode: "auto",
        now,
        lastPenAt: now - (RECENT_PEN_WINDOW_MS - 1),
      }),
    ).toBe(false);
    expect(
      shouldAcceptPointer(sample(), {
        mode: "auto",
        now,
        lastPenAt: now - RECENT_PEN_WINDOW_MS,
      }),
    ).toBe(true);
  });

  it("rejects a likely palm and a second active pointer", () => {
    expect(
      shouldAcceptPointer(sample({ width: 50, height: 40 }), {
        mode: "auto",
        now,
      }),
    ).toBe(false);
    expect(
      shouldAcceptPointer(sample({ pointerId: 2 }), {
        mode: "auto",
        now,
        activePointerId: 1,
      }),
    ).toBe(false);
  });

  it("keeps the active pointer and rejects non-primary input", () => {
    expect(
      shouldAcceptPointer(sample({ pointerId: 1 }), {
        mode: "auto",
        now,
        activePointerId: 1,
      }),
    ).toBe(true);
    expect(
      shouldAcceptPointer(sample({ isPrimary: false }), {
        mode: "auto",
        now,
      }),
    ).toBe(false);
  });

  it("honors explicit pen and touch modes", () => {
    expect(
      shouldAcceptPointer(sample({ pointerType: "pen" }), { mode: "pen", now }),
    ).toBe(true);
    expect(
      shouldAcceptPointer(sample({ pointerType: "touch" }), { mode: "pen", now }),
    ).toBe(false);
    expect(
      shouldAcceptPointer(sample({ pointerType: "touch" }), { mode: "touch", now }),
    ).toBe(true);
    expect(
      shouldAcceptPointer(sample({ pointerType: "pen" }), { mode: "touch", now }),
    ).toBe(false);
  });

  it("accepts mouse and pen, but not unknown pointer types, in auto mode", () => {
    expect(
      shouldAcceptPointer(sample({ pointerType: "mouse" }), { mode: "auto", now }),
    ).toBe(true);
    expect(
      shouldAcceptPointer(sample({ pointerType: "pen" }), { mode: "auto", now }),
    ).toBe(true);
    expect(
      shouldAcceptPointer(sample({ pointerType: "unknown-device" }), {
        mode: "auto",
        now,
      }),
    ).toBe(false);
  });
});

describe("pointer sample conversion and collection", () => {
  it("normalizes client coordinates and clamps coordinates and pressure", () => {
    expect(
      clientToNormalizedPoint(
        sample({ clientX: 150, clientY: 70, pressure: 1.4 }),
        { left: 50, top: 20, width: 200, height: 100 },
      ),
    ).toEqual([0.5, 0.5, 1]);

    expect(
      clientToNormalizedPoint(
        sample({ clientX: -100, clientY: 1_000, pressure: -0.2 }),
        { left: 0, top: 0, width: 200, height: 100 },
      ),
    ).toEqual([0, 1, 0]);
  });

  it("rejects a board rectangle without usable dimensions", () => {
    expect(() =>
      clientToNormalizedPoint(sample(), { left: 0, top: 0, width: 0, height: 100 }),
    ).toThrow(RangeError);
  });

  it("returns coalesced samples in browser order", () => {
    const first = sample({ clientX: 10 });
    const second = sample({ clientX: 20 });
    const source: PointerSampleSource = {
      ...sample({ clientX: 30 }),
      getCoalescedEvents: () => [first, second],
    };
    expect(collectPointerSamples(source)).toEqual([first, second]);
  });

  it("falls back to the source when coalesced events are absent, empty, or throw", () => {
    const absent = sample();
    expect(collectPointerSamples(absent)).toEqual([absent]);

    const empty: PointerSampleSource = {
      ...sample({ clientX: 60 }),
      getCoalescedEvents: () => [],
    };
    expect(collectPointerSamples(empty)).toEqual([empty]);

    const throwing: PointerSampleSource = {
      ...sample({ clientX: 70 }),
      getCoalescedEvents: () => {
        throw new Error("unsupported");
      },
    };
    expect(collectPointerSamples(throwing)).toEqual([throwing]);
  });
});

describe("appendStabilizedPoint", () => {
  const board = { width: 1_000, height: 800 };

  it("appends the first point and clamps all normalized values", () => {
    const points: NormalizedInkPoint[] = [];
    expect(appendStabilizedPoint(points, [-1, 2, 5], board, "natural")).toBe(
      "appended",
    );
    expect(points).toEqual([[0, 1, 1]]);
  });

  it("deduplicates sub-pixel movement while smoothing pressure", () => {
    const points: NormalizedInkPoint[] = [[0.5, 0.5, 0.2]];
    expect(
      appendStabilizedPoint(points, [0.5001, 0.5, 1], board, "natural"),
    ).toBe("deduplicated");
    expect(points).toHaveLength(1);
    expect(points[0]![0]).toBe(0.5);
    expect(points[0]![2]).toBeGreaterThan(0.2);
    expect(points[0]![2]).toBeLessThan(1);
  });

  it("makes neat input steadier than natural input", () => {
    const natural: NormalizedInkPoint[] = [[0.1, 0.1, 0.4]];
    const neat: NormalizedInkPoint[] = [[0.1, 0.1, 0.4]];
    const candidate: NormalizedInkPoint = [0.2, 0.2, 1];

    appendStabilizedPoint(natural, candidate, board, "natural");
    appendStabilizedPoint(neat, candidate, board, "neat");

    expect(neat[1]![0]).toBeLessThan(natural[1]![0]);
    expect(neat[1]![1]).toBeLessThan(natural[1]![1]);
    expect(neat[1]![2]).toBeLessThan(natural[1]![2]);
  });

  it("never exceeds 4000 points and keeps the latest tail at the limit", () => {
    const points: NormalizedInkPoint[] = Array.from(
      { length: MAX_STROKE_POINTS },
      (_, index) => [index / MAX_STROKE_POINTS, 0.2, 0.5],
    );
    const previousTail = points.at(-1);

    expect(
      appendStabilizedPoint(points, [1, 0.8, 0.9], board, "natural"),
    ).toBe("replaced-at-limit");
    expect(points).toHaveLength(MAX_STROKE_POINTS);
    expect(points.at(-1)).not.toEqual(previousTail);
    expect(points.at(-1)![1]).toBeGreaterThan(0.2);
  });

  it("rejects an invalid pixel board size", () => {
    expect(() =>
      appendStabilizedPoint([], [0.5, 0.5, 0.5], { width: 0, height: 100 }, "neat"),
    ).toThrow(RangeError);
  });
});

describe("pressure and tap helpers", () => {
  it("simulates pressure for mouse/touch but not for pen", () => {
    expect(shouldSimulatePressure("mouse")).toBe(true);
    expect(shouldSimulatePressure("touch")).toBe(true);
    expect(shouldSimulatePressure("pen")).toBe(false);
    expect(shouldSimulatePressure(sample({ pointerType: "pen" }))).toBe(false);
  });

  it("turns a one-point tap into a valid two-point dot without mutating input", () => {
    const original: NormalizedInkPoint[] = [[0.25, 0.75, 0.6]];
    const result = ensureTapStroke(original);

    expect(result).toEqual([
      [0.25, 0.75, 0.6],
      [0.25, 0.75, 0.6],
    ]);
    expect(result[0]).not.toBe(original[0]);
    expect(result[1]).not.toBe(result[0]);
    expect(original).toHaveLength(1);
  });

  it("keeps empty input empty and clones longer strokes", () => {
    expect(ensureTapStroke([])).toEqual([]);
    const original: NormalizedInkPoint[] = [
      [0, 0, 0.5],
      [1, 1, 0.5],
    ];
    const result = ensureTapStroke(original);
    expect(result).toEqual(original);
    expect(result).not.toBe(original);
    expect(result[0]).not.toBe(original[0]);
  });
});

describe("point and segment circle hit testing", () => {
  it("includes points on the circle boundary", () => {
    expect(pointInCircle([3, 4], [0, 0], 5)).toBe(true);
    expect(pointInCircle([3.01, 4], [0, 0], 5)).toBe(false);
    expect(pointInCircle([0, 0], [0, 0], -1)).toBe(false);
  });

  it("computes distance to the middle and endpoints of a segment", () => {
    expect(pointToSegmentDistanceSquared([5, 3], [0, 0], [10, 0])).toBe(9);
    expect(pointToSegmentDistanceSquared([-2, 0], [0, 0], [10, 0])).toBe(4);
    expect(pointToSegmentDistanceSquared([4, 5], [1, 1], [1, 1])).toBe(25);
  });

  it("detects crossing, tangent, degenerate, and missed segments", () => {
    expect(segmentIntersectsCircle([0, 0], [10, 0], [5, 2], 2)).toBe(true);
    expect(segmentIntersectsCircle([0, 0], [10, 0], [5, 2.1], 2)).toBe(false);
    expect(segmentIntersectsCircle([1, 1], [1, 1], [1, 2], 1)).toBe(true);
    expect(segmentIntersectsCircle([0, 0], [10, 0], [5, 0], -1)).toBe(false);
  });
});
