import { describe, expect, it, vi } from "vitest";
import type { StrokeRecord } from "./stroke";
import {
  createInkHistoryState,
  planInkSync,
  reduceInkHistory,
  syncInkEffects,
  type InkEffect,
  type InkHistoryState,
} from "./inkHistory";

function stroke(id: string, x = 0): StrokeRecord {
  return {
    id,
    color: "#0c0d10",
    size: 4,
    simulatePressure: false,
    points: [
      [x, 1, 0.5],
      [x + 1, 2, 0.5],
    ],
    layer: "student",
    pageIndex: 0,
  };
}

function idsFromAdd(effect: InkEffect | undefined): string[] {
  expect(effect?.type).toBe("add");
  return effect?.type === "add" ? effect.strokes.map((item) => item.id) : [];
}

function idsFromDelete(effect: InkEffect | undefined): string[] {
  expect(effect?.type).toBe("delete");
  return effect?.type === "delete" ? effect.strokeIds : [];
}

function idFactory(...ids: string[]) {
  let index = 0;
  return () => ids[index++] ?? `generated-${index}`;
}

describe("reduceInkHistory", () => {
  it("undo/redo follows A, B stack order and recreates additions", () => {
    const makeId = idFactory("A-redo", "B-redo");
    let state = createInkHistoryState();

    let result = reduceInkHistory(state, { type: "add", strokes: [stroke("A")] }, makeId);
    state = result.state;
    result = reduceInkHistory(state, { type: "add", strokes: [stroke("B")] }, makeId);
    state = result.state;

    result = reduceInkHistory(state, { type: "undo" }, makeId);
    expect(idsFromDelete(result.effects[0])).toEqual(["B"]);
    state = result.state;

    result = reduceInkHistory(state, { type: "undo" }, makeId);
    expect(idsFromDelete(result.effects[0])).toEqual(["A"]);
    state = result.state;

    result = reduceInkHistory(state, { type: "redo" }, makeId);
    expect(idsFromAdd(result.effects[0])).toEqual(["A-redo"]);
    state = result.state;

    result = reduceInkHistory(state, { type: "redo" }, makeId);
    expect(idsFromAdd(result.effects[0])).toEqual(["B-redo"]);
    expect(result.state.undo.map((entry) => entry.strokes[0]!.id)).toEqual([
      "A-redo",
      "B-redo",
    ]);
  });

  it("a new action clears redo without mutating snapshots", () => {
    const makeId = idFactory("unused");
    const original = stroke("A");
    let state = reduceInkHistory(
      createInkHistoryState(),
      { type: "add", strokes: [original] },
      makeId,
    ).state;

    original.points[0]![0] = 999;
    state = reduceInkHistory(state, { type: "undo" }, makeId).state;
    expect(state.redo[0]!.strokes[0]!.points[0]![0]).toBe(0);

    const result = reduceInkHistory(
      state,
      { type: "add", strokes: [stroke("C")] },
      makeId,
    );
    expect(result.state.redo).toEqual([]);
    expect(result.state.undo.map((entry) => entry.strokes[0]!.id)).toEqual(["C"]);
  });

  it("keeps multi-stroke stamps and lasso deletes as one history group", () => {
    const makeId = idFactory("L1-restored", "L2-restored");
    let state = createInkHistoryState();

    let result = reduceInkHistory(
      state,
      { type: "add", strokes: [stroke("stamp-1"), stroke("stamp-2")] },
      makeId,
    );
    state = result.state;
    result = reduceInkHistory(state, { type: "undo" }, makeId);
    expect(idsFromDelete(result.effects[0])).toEqual(["stamp-1", "stamp-2"]);

    state = reduceInkHistory(
      createInkHistoryState(),
      { type: "delete", strokes: [stroke("lasso-1"), stroke("lasso-2")] },
      makeId,
    ).state;
    result = reduceInkHistory(state, { type: "undo" }, makeId);
    expect(idsFromAdd(result.effects[0])).toEqual(["L1-restored", "L2-restored"]);
    expect(result.state.redo).toHaveLength(1);
    expect(result.state.redo[0]!.strokes).toHaveLength(2);
  });

  it("uses fresh ids on every restore and redo deletes the active copies", () => {
    const makeId = idFactory("copy-1", "copy-2");
    let state = reduceInkHistory(
      createInkHistoryState(),
      { type: "delete", strokes: [stroke("old")] },
      makeId,
    ).state;

    let result = reduceInkHistory(state, { type: "undo" }, makeId);
    expect(idsFromAdd(result.effects[0])).toEqual(["copy-1"]);
    state = result.state;

    result = reduceInkHistory(state, { type: "redo" }, makeId);
    expect(idsFromDelete(result.effects[0])).toEqual(["copy-1"]);
    state = result.state;

    result = reduceInkHistory(state, { type: "undo" }, makeId);
    expect(idsFromAdd(result.effects[0])).toEqual(["copy-2"]);
  });

  it("empty groups and empty stacks are no-ops", () => {
    const state: InkHistoryState = createInkHistoryState();
    const makeId = idFactory();

    expect(reduceInkHistory(state, { type: "add", strokes: [] }, makeId)).toEqual({
      state,
      effects: [],
    });
    expect(reduceInkHistory(state, { type: "undo" }, makeId)).toEqual({
      state,
      effects: [],
    });
  });
});

describe("ink sync ordering", () => {
  it("chunks creates by 80 and deletes by 200", () => {
    const effects: InkEffect[] = [
      {
        type: "add",
        strokes: Array.from({ length: 161 }, (_, index) => stroke(`c-${index}`)),
      },
      {
        type: "delete",
        strokeIds: Array.from({ length: 401 }, (_, index) => `d-${index}`),
      },
    ];

    const plan = planInkSync(effects);
    expect(plan.createBatches.map((batch) => batch.length)).toEqual([80, 80, 1]);
    expect(plan.deleteBatches.map((batch) => batch.length)).toEqual([200, 200, 1]);
  });

  it("runs every create before the first delete", async () => {
    const calls: string[] = [];
    const result = await syncInkEffects(
      [
        { type: "delete", strokeIds: ["old"] },
        { type: "add", strokes: [stroke("replacement")] },
      ],
      {
        create: async () => {
          calls.push("create");
        },
        delete: async () => {
          calls.push("delete");
        },
      },
    );

    expect(result.ok).toBe(true);
    expect(calls).toEqual(["create", "delete"]);
  });

  it("never attempts deletes after an unsuccessful create batch", async () => {
    const create = vi
      .fn<(batch: readonly StrokeRecord[]) => Promise<boolean>>()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const remove = vi.fn<(batch: readonly string[]) => Promise<void>>();

    const result = await syncInkEffects(
      [
        {
          type: "add",
          strokes: Array.from({ length: 81 }, (_, index) => stroke(`c-${index}`)),
        },
        { type: "delete", strokeIds: ["old"] },
      ],
      { create, delete: remove },
    );

    expect(result).toMatchObject({
      ok: false,
      phase: "create",
      failedBatch: 1,
      createdBatches: 1,
      deletedBatches: 0,
    });
    expect(create).toHaveBeenCalledTimes(2);
    expect(remove).not.toHaveBeenCalled();
  });
});
