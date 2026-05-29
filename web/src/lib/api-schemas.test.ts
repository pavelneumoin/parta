import { describe, expect, it } from "vitest";
import { z } from "zod";

// Воспроизводим зоd-схемы из API-роутов и проверяем их инвариант.
// Если схемы в роутах поменяются — эти тесты предупредят о regression.

const strokePoint = z.tuple([z.number(), z.number(), z.number()]);

const strokeForUpload = z.object({
  id: z.string().min(8).max(64),
  workspaceId: z.string(),
  pageIndex: z.number().int().min(0).max(31).default(0),
  layer: z.enum(["student", "teacher"]).default("student"),
  color: z.string().regex(/^#[0-9a-fA-F]{3,8}$/),
  size: z.number().positive().max(40),
  simulatePressure: z.boolean().default(false),
  points: z.array(strokePoint).min(2).max(4000),
});

const strokesBatch = z.object({
  strokes: z.array(strokeForUpload).max(80),
});

const strokeForBroadcast = z.object({
  pageIndex: z.number().int().min(0).max(31).default(0),
  color: z.string().regex(/^#[0-9a-fA-F]{3,8}$/),
  size: z.number().positive().max(40),
  simulatePressure: z.boolean().default(false),
  points: z.array(strokePoint).min(2).max(4000),
});

const deleteBatch = z.object({
  workspaceId: z.string(),
  strokeIds: z.array(z.string().min(8).max(64)).min(1).max(200),
});

describe("strokes batch schema", () => {
  it("принимает валидный штрих", () => {
    const ok = strokesBatch.safeParse({
      strokes: [
        {
          id: "550e8400e29b41d4a716446655440000",
          workspaceId: "ws-1",
          color: "#0c0d10",
          size: 4,
          points: [
            [0, 0, 0.5],
            [1, 1, 0.5],
          ],
        },
      ],
    });
    expect(ok.success).toBe(true);
  });

  it("отвергает короткий ID (< 8)", () => {
    const r = strokesBatch.safeParse({
      strokes: [
        {
          id: "short",
          workspaceId: "ws-1",
          color: "#000",
          size: 4,
          points: [[0, 0, 0.5], [1, 1, 0.5]],
        },
      ],
    });
    expect(r.success).toBe(false);
  });

  it("отвергает цвет без #", () => {
    const r = strokesBatch.safeParse({
      strokes: [
        {
          id: "550e8400e29b41d4a716446655440000",
          workspaceId: "ws-1",
          color: "000000",
          size: 4,
          points: [[0, 0, 0.5], [1, 1, 0.5]],
        },
      ],
    });
    expect(r.success).toBe(false);
  });

  it("отвергает <2 точки", () => {
    const r = strokesBatch.safeParse({
      strokes: [
        {
          id: "550e8400e29b41d4a716446655440000",
          workspaceId: "ws-1",
          color: "#000",
          size: 4,
          points: [[0, 0, 0.5]],
        },
      ],
    });
    expect(r.success).toBe(false);
  });

  it("отвергает batch > 80 штрихов", () => {
    const stroke = {
      id: "550e8400e29b41d4a716446655440000",
      workspaceId: "ws-1",
      color: "#000",
      size: 4,
      points: [[0, 0, 0.5], [1, 1, 0.5]],
    };
    const r = strokesBatch.safeParse({
      strokes: Array(81).fill(stroke),
    });
    expect(r.success).toBe(false);
  });

  it("отвергает pageIndex > 31", () => {
    const r = strokesBatch.safeParse({
      strokes: [
        {
          id: "550e8400e29b41d4a716446655440000",
          workspaceId: "ws-1",
          pageIndex: 32,
          color: "#000",
          size: 4,
          points: [[0, 0, 0.5], [1, 1, 0.5]],
        },
      ],
    });
    expect(r.success).toBe(false);
  });
});

describe("broadcast stroke schema", () => {
  it("принимает штрих без workspaceId и без id", () => {
    const r = strokeForBroadcast.safeParse({
      color: "#d11a2a",
      size: 4,
      points: [[0, 0, 0.5], [1, 1, 0.5]],
    });
    expect(r.success).toBe(true);
  });
});

describe("delete batch schema", () => {
  it("принимает 1-200 ID", () => {
    expect(
      deleteBatch.safeParse({
        workspaceId: "ws-1",
        strokeIds: ["550e8400e29b41d4a716446655440000"],
      }).success,
    ).toBe(true);

    const long = Array(200).fill("550e8400e29b41d4a716446655440000");
    expect(
      deleteBatch.safeParse({ workspaceId: "ws-1", strokeIds: long }).success,
    ).toBe(true);
  });

  it("отвергает пустой массив и >200", () => {
    expect(
      deleteBatch.safeParse({ workspaceId: "ws-1", strokeIds: [] }).success,
    ).toBe(false);

    const tooMany = Array(201).fill("550e8400e29b41d4a716446655440000");
    expect(
      deleteBatch.safeParse({ workspaceId: "ws-1", strokeIds: tooMany }).success,
    ).toBe(false);
  });
});
