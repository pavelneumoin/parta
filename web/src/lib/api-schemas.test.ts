import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  broadcastStrokesBatchSchema,
  strokeForBroadcastSchema,
  strokesBatchSchema,
} from "@/lib/strokeSchemas";

// Тестируем те же схемы, которые импортируют API-роуты: расхождение между
// тестовой копией и production-валидацией теперь невозможно.
const strokesBatch = strokesBatchSchema;
const strokeForBroadcast = strokeForBroadcastSchema;

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
    if (ok.success) {
      expect(ok.data.strokes[0]).toMatchObject({
        coordinateSpace: "legacy",
        brushKind: "legacy",
        renderVersion: 1,
      });
    }
  });

  it("принимает ink v2 и 8-digit hex маркера", () => {
    const result = strokesBatch.safeParse({
      strokes: [
        {
          id: "550e8400e29b41d4a716446655440000",
          workspaceId: "ws-1",
          color: "#ffde3c66",
          size: 0.02,
          coordinateSpace: "normalized",
          brushKind: "marker",
          renderVersion: 2,
          points: [[0, 0, 0.5], [1, 1, 0.5]],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("отвергает выход normalized-координат, pressure и size за диапазон", () => {
    const base = {
      id: "550e8400e29b41d4a716446655440000",
      workspaceId: "ws-1",
      color: "#000",
      size: 0.02,
      coordinateSpace: "normalized" as const,
      brushKind: "pen" as const,
      renderVersion: 2 as const,
      points: [[0, 0, 0.5], [1, 1, 0.5]],
    };
    expect(
      strokesBatch.safeParse({
        strokes: [{ ...base, points: [[0, 0, 0.5], [1.01, 1, 0.5]] }],
      }).success,
    ).toBe(false);
    expect(
      strokesBatch.safeParse({
        strokes: [{ ...base, points: [[0, 0, 0.5], [1, 1, 1.1]] }],
      }).success,
    ).toBe(false);
    expect(
      strokesBatch.safeParse({
        strokes: [{ ...base, size: 0.21 }],
      }).success,
    ).toBe(false);
  });

  it("отвергает несогласованные версии и metadata кисти", () => {
    const base = {
      id: "550e8400e29b41d4a716446655440000",
      workspaceId: "ws-1",
      color: "#000",
      size: 0.02,
      points: [[0, 0, 0.5], [1, 1, 0.5]],
    };
    expect(
      strokesBatch.safeParse({
        strokes: [
          {
            ...base,
            coordinateSpace: "legacy",
            brushKind: "pen",
            renderVersion: 2,
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      strokesBatch.safeParse({
        strokes: [
          {
            ...base,
            coordinateSpace: "normalized",
            brushKind: "legacy",
            renderVersion: 1,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("отвергает неизвестные ink metadata", () => {
    const base = {
      id: "550e8400e29b41d4a716446655440000",
      workspaceId: "ws-1",
      color: "#000",
      size: 4,
      points: [[0, 0, 0.5], [1, 1, 0.5]],
    };
    expect(
      strokesBatch.safeParse({
        strokes: [{ ...base, coordinateSpace: "pixels" }],
      }).success,
    ).toBe(false);
    expect(
      strokesBatch.safeParse({
        strokes: [{ ...base, brushKind: "airbrush" }],
      }).success,
    ).toBe(false);
    expect(
      strokesBatch.safeParse({
        strokes: [{ ...base, renderVersion: 3 }],
      }).success,
    ).toBe(false);
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
  it("принимает штрих без workspaceId с client id", () => {
    const r = strokeForBroadcast.safeParse({
      id: "550e8400e29b41d4a716446655440000",
      color: "#d11a2a",
      size: 0.02,
      coordinateSpace: "normalized",
      brushKind: "shape",
      renderVersion: 2,
      points: [[0, 0, 0.5], [1, 1, 0.5]],
    });
    expect(r.success).toBe(true);
  });

  it("ограничивает broadcast batch двадцатью штрихами", () => {
    const stroke = {
      id: "550e8400e29b41d4a716446655440000",
      color: "#d11a2a",
      size: 0.02,
      coordinateSpace: "normalized" as const,
      brushKind: "shape" as const,
      renderVersion: 2 as const,
      points: [[0, 0, 0.5], [1, 1, 0.5]],
    };
    expect(
      broadcastStrokesBatchSchema.safeParse({
        strokes: Array.from({ length: 21 }, (_, index) => ({
          ...stroke,
          id: `broadcast-${String(index).padStart(8, "0")}`,
        })),
      }).success,
    ).toBe(false);
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
