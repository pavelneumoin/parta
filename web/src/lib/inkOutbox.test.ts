import { describe, expect, it } from "vitest";
import type { StrokeRecord } from "./stroke";
import {
  mergeInkOutboxes,
  normalizeInkOutbox,
  type InkOutbox,
} from "./inkOutbox";

function stroke(id: string, color = "#000"): StrokeRecord {
  return {
    id,
    color,
    size: 0.01,
    simulatePressure: true,
    points: [
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6],
    ],
    layer: "student",
    pageIndex: 0,
    coordinateSpace: "normalized",
    brushKind: "pen",
    renderVersion: 2,
    delivery: "workspace",
  };
}

describe("normalizeInkOutbox", () => {
  it("validates, clones and keeps supported ink-v2 metadata", () => {
    const source = stroke("stroke_valid_01");
    const normalized = normalizeInkOutbox({
      creates: [source],
      deletes: [],
    });

    expect(normalized.creates).toEqual([source]);
    expect(normalized.creates[0]).not.toBe(source);
    expect(normalized.creates[0]!.points).not.toBe(source.points);

    source.points[0]![0] = 0.99;
    expect(normalized.creates[0]!.points[0]![0]).toBe(0.1);
  });

  it("drops malformed creates and delete ids without rejecting valid entries", () => {
    const valid = stroke("stroke_valid_02");
    const malformed = [
      null,
      { ...valid, id: "short" },
      { ...valid, color: "rgba(0,0,0,1)" },
      { ...valid, size: Number.NaN },
      { ...valid, pageIndex: 32 },
      { ...valid, brushKind: "airbrush" },
      { ...valid, size: 1 },
      { ...valid, points: [[0, 0, 0.5]] },
      { ...valid, points: [[0, 0, 0.5], [1, Infinity, 0.5]] },
      { ...valid, points: [[0, 0, 0.5], [1, 1, 1.1]] },
      { ...valid, points: [[0, 0, 0.5], [1.01, 1, 0.5]] },
    ];

    expect(
      normalizeInkOutbox({
        creates: [...malformed, valid],
        deletes: [null, "tiny", "delete_valid_01", "delete valid 02"],
      }),
    ).toEqual({
      creates: [valid],
      deletes: ["delete_valid_01"],
    });
  });

  it("deduplicates by id, keeps the newest create and preserves create→delete", () => {
    const id = "stroke_shared_01";
    const normalized = normalizeInkOutbox({
      creates: [stroke(id, "#111"), stroke(id, "#222")],
      deletes: [id, id],
    });

    expect(normalized.creates).toHaveLength(1);
    expect(normalized.creates[0]!.color).toBe("#222");
    expect(normalized.deletes).toEqual([id]);
  });

  it("returns an empty safe value for corrupt top-level data", () => {
    const first = normalizeInkOutbox(null);
    first.deletes.push("locally_mutated_01");

    expect(normalizeInkOutbox(null)).toEqual({ creates: [], deletes: [] });
    expect(normalizeInkOutbox("corrupt")).toEqual({
      creates: [],
      deletes: [],
    });
    expect(normalizeInkOutbox({ creates: {}, deletes: 42 })).toEqual({
      creates: [],
      deletes: [],
    });
  });
});

describe("mergeInkOutboxes", () => {
  it("merges snapshots deterministically and deduplicates operations", () => {
    const first: InkOutbox = {
      creates: [stroke("stroke_first_01"), stroke("stroke_shared_02", "#111")],
      deletes: ["delete_first_01", "delete_shared_01"],
    };
    const second: InkOutbox = {
      creates: [stroke("stroke_shared_02", "#abc"), stroke("stroke_last_01")],
      deletes: ["delete_shared_01", "delete_last_01"],
    };

    const merged = mergeInkOutboxes(first, second);

    expect(merged.creates.map((item) => item.id)).toEqual([
      "stroke_first_01",
      "stroke_shared_02",
      "stroke_last_01",
    ]);
    expect(merged.creates[1]!.color).toBe("#abc");
    expect(merged.deletes).toEqual([
      "delete_first_01",
      "delete_shared_01",
      "delete_last_01",
    ]);
  });
});
