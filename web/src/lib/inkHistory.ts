import type { StrokeRecord } from "./stroke";

export type InkHistoryEntry = {
  type: "add" | "delete";
  strokes: StrokeRecord[];
};

export type InkHistoryState = {
  undo: InkHistoryEntry[];
  redo: InkHistoryEntry[];
};

export type InkHistoryAction =
  | { type: "add"; strokes: readonly StrokeRecord[] }
  | { type: "delete"; strokes: readonly StrokeRecord[] }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "clear" };

export type InkEffect =
  | { type: "add"; strokes: StrokeRecord[] }
  | { type: "delete"; strokeIds: string[] };

export type InkHistoryResult = {
  state: InkHistoryState;
  effects: InkEffect[];
};

export type InkIdFactory = () => string;

export const INK_CREATE_BATCH_SIZE = 80;
export const INK_DELETE_BATCH_SIZE = 200;

export function createInkHistoryState(): InkHistoryState {
  return { undo: [], redo: [] };
}

function cloneStroke(stroke: StrokeRecord, id = stroke.id): StrokeRecord {
  return {
    ...stroke,
    id,
    points: stroke.points.map(([x, y, pressure]) => [x, y, pressure]),
  };
}

function cloneStrokes(strokes: readonly StrokeRecord[]): StrokeRecord[] {
  return strokes.map((stroke) => cloneStroke(stroke));
}

function cloneWithFreshIds(
  strokes: readonly StrokeRecord[],
  idFactory: InkIdFactory,
): StrokeRecord[] {
  return strokes.map((stroke) => cloneStroke(stroke, idFactory()));
}

function addEffect(strokes: readonly StrokeRecord[]): InkEffect {
  return { type: "add", strokes: cloneStrokes(strokes) };
}

function deleteEffect(strokes: readonly StrokeRecord[]): InkEffect {
  return { type: "delete", strokeIds: strokes.map((stroke) => stroke.id) };
}

/**
 * Pure history reducer. An `add` or `delete` action is one undoable group, so a
 * multi-stroke stamp or lasso deletion is reverted in a single step.
 *
 * Restores always receive fresh ids: strokes are append-only on the server, so
 * reusing a soft-deleted id would not create a visible stroke.
 */
export function reduceInkHistory(
  state: InkHistoryState,
  action: InkHistoryAction,
  idFactory: InkIdFactory,
): InkHistoryResult {
  if (action.type === "clear") {
    return { state: createInkHistoryState(), effects: [] };
  }

  if (action.type === "add" || action.type === "delete") {
    if (action.strokes.length === 0) return { state, effects: [] };

    const snapshot = cloneStrokes(action.strokes);
    const entry: InkHistoryEntry = { type: action.type, strokes: snapshot };
    return {
      state: { undo: [...state.undo, entry], redo: [] },
      effects: [
        action.type === "add" ? addEffect(snapshot) : deleteEffect(snapshot),
      ],
    };
  }

  if (action.type === "undo") {
    const entry = state.undo.at(-1);
    if (!entry) return { state, effects: [] };

    const remainingUndo = state.undo.slice(0, -1);
    if (entry.type === "add") {
      return {
        state: {
          undo: remainingUndo,
          redo: [...state.redo, entry],
        },
        effects: [deleteEffect(entry.strokes)],
      };
    }

    const restored = cloneWithFreshIds(entry.strokes, idFactory);
    return {
      state: {
        undo: remainingUndo,
        redo: [...state.redo, { type: entry.type, strokes: cloneStrokes(restored) }],
      },
      effects: [addEffect(restored)],
    };
  }

  const entry = state.redo.at(-1);
  if (!entry) return { state, effects: [] };

  const remainingRedo = state.redo.slice(0, -1);
  if (entry.type === "delete") {
    return {
      state: {
        undo: [...state.undo, entry],
        redo: remainingRedo,
      },
      effects: [deleteEffect(entry.strokes)],
    };
  }

  const restored = cloneWithFreshIds(entry.strokes, idFactory);
  return {
    state: {
      undo: [...state.undo, { type: entry.type, strokes: cloneStrokes(restored) }],
      redo: remainingRedo,
    },
    effects: [addEffect(restored)],
  };
}

export type InkSyncPlan = {
  createBatches: StrokeRecord[][];
  deleteBatches: string[][];
};

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let offset = 0; offset < items.length; offset += size) {
    result.push(items.slice(offset, offset + size));
  }
  return result;
}

/**
 * Creates are deliberately placed before deletes. This is important for
 * undo/redo restores: a delete must never race ahead of the replacement stroke.
 */
export function planInkSync(effects: readonly InkEffect[]): InkSyncPlan {
  const creates: StrokeRecord[] = [];
  const deletes: string[] = [];

  for (const effect of effects) {
    if (effect.type === "add") creates.push(...cloneStrokes(effect.strokes));
    else deletes.push(...effect.strokeIds);
  }

  return {
    createBatches: chunks(creates, INK_CREATE_BATCH_SIZE),
    deleteBatches: chunks(deletes, INK_DELETE_BATCH_SIZE),
  };
}

export type InkSyncTransport = {
  create: (batch: readonly StrokeRecord[]) => Promise<boolean | void>;
  delete: (batch: readonly string[]) => Promise<boolean | void>;
};

export type InkSyncResult =
  | { ok: true; createdBatches: number; deletedBatches: number }
  | {
      ok: false;
      phase: "create" | "delete";
      failedBatch: number;
      createdBatches: number;
      deletedBatches: number;
      error?: unknown;
    };

/**
 * Executes a plan sequentially. If any create batch fails (returns false or
 * throws), no delete batch is attempted.
 */
export async function syncInkEffects(
  effects: readonly InkEffect[],
  transport: InkSyncTransport,
): Promise<InkSyncResult> {
  const plan = planInkSync(effects);
  let createdBatches = 0;
  let deletedBatches = 0;

  for (let index = 0; index < plan.createBatches.length; index += 1) {
    try {
      const accepted = await transport.create(plan.createBatches[index]!);
      if (accepted === false) {
        return {
          ok: false,
          phase: "create",
          failedBatch: index,
          createdBatches,
          deletedBatches,
        };
      }
      createdBatches += 1;
    } catch (error) {
      return {
        ok: false,
        phase: "create",
        failedBatch: index,
        createdBatches,
        deletedBatches,
        error,
      };
    }
  }

  for (let index = 0; index < plan.deleteBatches.length; index += 1) {
    try {
      const accepted = await transport.delete(plan.deleteBatches[index]!);
      if (accepted === false) {
        return {
          ok: false,
          phase: "delete",
          failedBatch: index,
          createdBatches,
          deletedBatches,
        };
      }
      deletedBatches += 1;
    } catch (error) {
      return {
        ok: false,
        phase: "delete",
        failedBatch: index,
        createdBatches,
        deletedBatches,
        error,
      };
    }
  }

  return { ok: true, createdBatches, deletedBatches };
}
