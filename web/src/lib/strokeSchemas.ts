import { z } from "zod";

const finiteCoordinate = z.number().finite().min(-100_000).max(100_000);

export const inkPointSchema = z.tuple([
  finiteCoordinate,
  finiteCoordinate,
  z.number().finite().min(0).max(1),
]);

const colorSchema = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);

const strokeBaseSchema = z.object({
  id: z.string().min(8).max(64),
  pageIndex: z.number().int().min(0).max(31).default(0),
  color: colorSchema,
  size: z.number().finite().positive().max(40),
  simulatePressure: z.boolean().default(false),
  coordinateSpace: z.enum(["legacy", "normalized"]).default("legacy"),
  brushKind: z.enum(["legacy", "pen", "marker", "shape"]).default("legacy"),
  renderVersion: z.number().int().min(1).max(2).default(1),
  points: z.array(inkPointSchema).min(2).max(4000),
});

type InkStrokeShape = z.infer<typeof strokeBaseSchema>;

function validateInkMetadata(
  stroke: InkStrokeShape,
  ctx: z.RefinementCtx,
) {
  if (stroke.renderVersion === 1) {
    if (stroke.coordinateSpace !== "legacy" || stroke.brushKind !== "legacy") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Ink v1 must use legacy coordinates and brush",
        path: ["renderVersion"],
      });
    }
    return;
  }

  if (
    stroke.coordinateSpace !== "normalized" ||
    stroke.brushKind === "legacy"
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Ink v2 must use normalized coordinates and a v2 brush",
      path: ["renderVersion"],
    });
  }

  // New clients store width as a fraction of the shortest board dimension.
  // A generous 20% ceiling still supports large stamps while preventing a
  // forged stroke from expanding to tens of thousands of rendered pixels.
  if (stroke.size > 0.2) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Normalized stroke size is too large",
      path: ["size"],
    });
  }

  stroke.points.forEach(([x, y], index) => {
    if (x < 0 || x > 1 || y < 0 || y > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Normalized coordinates must be between 0 and 1",
        path: ["points", index],
      });
    }
  });
}

export const strokeForUploadSchema = strokeBaseSchema
  .extend({
    workspaceId: z.string().min(1).max(128),
    layer: z.enum(["student", "teacher"]).default("student"),
  })
  .superRefine(validateInkMetadata);

export const strokeForBroadcastSchema =
  strokeBaseSchema.superRefine(validateInkMetadata);

function validateBatch(
  strokes: readonly { id: string; points: readonly unknown[] }[],
  maxPoints: number,
  ctx: z.RefinementCtx,
) {
  const ids = new Set<string>();
  let totalPoints = 0;
  for (let index = 0; index < strokes.length; index++) {
    const stroke = strokes[index]!;
    if (ids.has(stroke.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Stroke ids must be unique inside a batch",
        path: ["strokes", index, "id"],
      });
    }
    ids.add(stroke.id);
    totalPoints += stroke.points.length;
  }
  if (totalPoints > maxPoints) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Too many points in one request",
      path: ["strokes"],
    });
  }
}

export const strokesBatchSchema = z
  .object({
    strokes: z.array(strokeForUploadSchema).max(80),
  })
  .superRefine((value, ctx) => validateBatch(value.strokes, 20_000, ctx));

export const broadcastStrokesBatchSchema = z
  .object({
    strokes: z.array(strokeForBroadcastSchema).max(20),
  })
  .superRefine((value, ctx) => validateBatch(value.strokes, 8_000, ctx));
