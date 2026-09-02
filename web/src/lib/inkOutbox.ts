import type { StrokePoint, StrokeRecord } from "./stroke";

const DATABASE_NAME = "parta-ink-outbox";
const DATABASE_VERSION = 1;
const STORE_NAME = "workspace-outboxes";
const RECORD_VERSION = 1;

// Bounds protect the app from unexpectedly large or corrupted persisted data.
export const MAX_OUTBOX_CREATES = 2_000;
export const MAX_OUTBOX_DELETES = 5_000;
const MAX_OUTBOX_POINTS = 200_000;

export type InkOutbox = {
  creates: StrokeRecord[];
  deletes: string[];
};

type StoredInkOutbox = InkOutbox & {
  workspaceId: string;
  version: typeof RECORD_VERSION;
  updatedAt: number;
};

const STROKE_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const WORKSPACE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const COLOR_PATTERN =
  /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function emptyOutbox(): InkOutbox {
  return { creates: [], deletes: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizePoint(value: unknown): StrokePoint | null {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !isFiniteNumber(value[0]) ||
    !isFiniteNumber(value[1]) ||
    !isFiniteNumber(value[2]) ||
    Math.abs(value[0]) > 100_000 ||
    Math.abs(value[1]) > 100_000 ||
    value[2] < 0 ||
    value[2] > 1
  ) {
    return null;
  }
  return [value[0], value[1], value[2]];
}

function normalizeStroke(value: unknown): StrokeRecord | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !STROKE_ID_PATTERN.test(value.id) ||
    typeof value.color !== "string" ||
    !COLOR_PATTERN.test(value.color) ||
    !isFiniteNumber(value.size) ||
    value.size <= 0 ||
    value.size > 40 ||
    typeof value.simulatePressure !== "boolean" ||
    !Array.isArray(value.points) ||
    value.points.length < 2 ||
    value.points.length > 4_000
  ) {
    return null;
  }

  const points: StrokePoint[] = [];
  for (const candidate of value.points) {
    const point = normalizePoint(candidate);
    if (!point) return null;
    points.push(point);
  }

  const stroke: StrokeRecord = {
    id: value.id,
    color: value.color,
    size: value.size,
    simulatePressure: value.simulatePressure,
    points,
  };

  if (value.layer !== undefined) {
    if (value.layer !== "student" && value.layer !== "teacher") return null;
    stroke.layer = value.layer;
  }
  if (value.pageIndex !== undefined) {
    if (
      !Number.isInteger(value.pageIndex) ||
      (value.pageIndex as number) < 0 ||
      (value.pageIndex as number) > 31
    ) {
      return null;
    }
    stroke.pageIndex = value.pageIndex as number;
  }
  if (value.coordinateSpace !== undefined) {
    if (
      value.coordinateSpace !== "legacy" &&
      value.coordinateSpace !== "normalized"
    ) {
      return null;
    }
    stroke.coordinateSpace = value.coordinateSpace;
  }
  if (value.brushKind !== undefined) {
    if (
      value.brushKind !== "legacy" &&
      value.brushKind !== "pen" &&
      value.brushKind !== "marker" &&
      value.brushKind !== "shape"
    ) {
      return null;
    }
    stroke.brushKind = value.brushKind;
  }
  if (value.renderVersion !== undefined) {
    if (
      !Number.isInteger(value.renderVersion) ||
      (value.renderVersion as number) < 1 ||
      (value.renderVersion as number) > 2
    ) {
      return null;
    }
    stroke.renderVersion = value.renderVersion as number;
  }
  if (value.delivery !== undefined) {
    if (value.delivery !== "workspace" && value.delivery !== "broadcast") {
      return null;
    }
    stroke.delivery = value.delivery;
  }

  const coordinateSpace = stroke.coordinateSpace ?? "legacy";
  const brushKind = stroke.brushKind ?? "legacy";
  const renderVersion = stroke.renderVersion ?? 1;
  if (renderVersion === 1) {
    if (coordinateSpace !== "legacy" || brushKind !== "legacy") return null;
  } else {
    if (coordinateSpace !== "normalized" || brushKind === "legacy") return null;
    if (stroke.size > 0.2) return null;
    if (
      stroke.points.some(
        ([x, y]) => x < 0 || x > 1 || y < 0 || y > 1,
      )
    ) {
      return null;
    }
  }

  return stroke;
}

/**
 * Validates an unknown persisted value, drops malformed operations and
 * deduplicates them by id. The most recent duplicate create wins while its
 * original queue position is retained. A create and delete with the same id
 * are both preserved because replay must ACK the idempotent create first.
 */
export function normalizeInkOutbox(value: unknown): InkOutbox {
  if (!isRecord(value)) return emptyOutbox();

  const createsById = new Map<string, StrokeRecord>();
  let totalPoints = 0;
  if (Array.isArray(value.creates)) {
    const limit = Math.min(value.creates.length, MAX_OUTBOX_CREATES);
    for (let index = 0; index < limit; index += 1) {
      const stroke = normalizeStroke(value.creates[index]);
      if (!stroke) continue;
      const previous = createsById.get(stroke.id);
      const nextTotal =
        totalPoints -
        (previous?.points.length ?? 0) +
        stroke.points.length;
      if (nextTotal > MAX_OUTBOX_POINTS) break;
      totalPoints = nextTotal;
      createsById.set(stroke.id, stroke);
    }
  }

  const deleteIds = new Set<string>();
  if (Array.isArray(value.deletes)) {
    const limit = Math.min(value.deletes.length, MAX_OUTBOX_DELETES);
    for (let index = 0; index < limit; index += 1) {
      const id = value.deletes[index];
      if (typeof id === "string" && STROKE_ID_PATTERN.test(id)) {
        deleteIds.add(id);
      }
    }
  }

  return {
    creates: [...createsById.values()],
    deletes: [...deleteIds],
  };
}

/**
 * Combines outbox snapshots without sharing mutable stroke/point arrays.
 * Later snapshots win for duplicate creates.
 */
export function mergeInkOutboxes(
  ...outboxes: readonly InkOutbox[]
): InkOutbox {
  return normalizeInkOutbox({
    creates: outboxes.flatMap((outbox) => outbox.creates),
    deletes: outboxes.flatMap((outbox) => outbox.deletes),
  });
}

function assertWorkspaceId(workspaceId: string): void {
  if (!WORKSPACE_ID_PATTERN.test(workspaceId)) {
    throw new TypeError("Invalid workspace id for ink outbox");
  }
}

function indexedDb(): IDBFactory {
  if (typeof globalThis.indexedDB === "undefined") {
    throw new Error("IndexedDB is unavailable");
  }
  return globalThis.indexedDB;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDb().open(DATABASE_NAME, DATABASE_VERSION);
    let settled = false;

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "workspaceId" });
      }
    };
    request.onerror = () => {
      settled = true;
      reject(request.error ?? new Error("Could not open ink outbox database"));
    };
    request.onblocked = () => {
      settled = true;
      reject(new Error("Ink outbox database upgrade is blocked"));
    };
    request.onsuccess = () => {
      if (settled) {
        request.result.close();
        return;
      }
      settled = true;
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Ink outbox request failed"));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Ink outbox transaction aborted"));
    transaction.onerror = () => {
      // `abort` is the terminal event and carries the transaction error.
    };
  });
}

export async function loadInkOutbox(
  workspaceId: string,
): Promise<InkOutbox> {
  assertWorkspaceId(workspaceId);
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const completed = transactionComplete(transaction);
    const [stored] = await Promise.all([
      requestResult(transaction.objectStore(STORE_NAME).get(workspaceId)),
      completed,
    ]);
    return normalizeInkOutbox(stored);
  } finally {
    database.close();
  }
}

/**
 * Atomically replaces the workspace snapshot. Callers pass their complete
 * outstanding create/delete queues after every enqueue and ACK.
 */
export async function saveInkOutbox(
  workspaceId: string,
  creates: readonly StrokeRecord[],
  deletes: readonly string[],
): Promise<void> {
  assertWorkspaceId(workspaceId);
  const normalized = normalizeInkOutbox({ creates, deletes });
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const completed = transactionComplete(transaction);
    const store = transaction.objectStore(STORE_NAME);

    if (normalized.creates.length === 0 && normalized.deletes.length === 0) {
      await Promise.all([requestResult(store.delete(workspaceId)), completed]);
    } else {
      const record: StoredInkOutbox = {
        workspaceId,
        version: RECORD_VERSION,
        updatedAt: Date.now(),
        ...normalized,
      };
      await Promise.all([requestResult(store.put(record)), completed]);
    }
  } finally {
    database.close();
  }
}

export async function clearInkOutbox(workspaceId: string): Promise<void> {
  assertWorkspaceId(workspaceId);
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const completed = transactionComplete(transaction);
    await Promise.all([
      requestResult(transaction.objectStore(STORE_NAME).delete(workspaceId)),
      completed,
    ]);
  } finally {
    database.close();
  }
}
