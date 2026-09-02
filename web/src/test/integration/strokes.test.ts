import { describe, expect, it, afterAll, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";
import {
  api,
  cleanupTestData,
  closeSession,
  db,
  disconnect,
  setupBasicFixture,
} from "../helpers";

const makeStroke = (
  workspaceId: string,
  overrides?: Partial<{
    id: string;
    pageIndex: number;
    color: string;
    size: number;
    coordinateSpace: "legacy" | "normalized";
    brushKind: "legacy" | "pen" | "marker" | "shape";
    renderVersion: 1 | 2;
  }>,
) => {
  const normalized = overrides?.coordinateSpace === "normalized";
  return {
  id: overrides?.id ?? randomUUID(),
  workspaceId,
  pageIndex: overrides?.pageIndex ?? 0,
  color: overrides?.color ?? "#0c0d10",
  size: overrides?.size ?? (normalized ? 0.02 : 4),
  simulatePressure: false,
  ...(overrides?.coordinateSpace
    ? { coordinateSpace: overrides.coordinateSpace }
    : {}),
  ...(overrides?.brushKind ? { brushKind: overrides.brushKind } : {}),
  ...(overrides?.renderVersion
    ? { renderVersion: overrides.renderVersion }
    : {}),
  points: normalized
    ? [
        [0.1, 0.1, 0.5],
        [0.2, 0.2, 0.6],
        [0.3, 0.3, 0.7],
      ]
    : [
        [10, 10, 0.5],
        [20, 20, 0.6],
        [30, 30, 0.7],
      ],
  };
};

beforeAll(async () => {
  // На случай если предыдущий ран был грязный.
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
  await disconnect();
});

describe("POST /api/strokes — добавление штрихов", () => {
  it("ученик добавляет штрих со своим токеном — accepted", async () => {
    const f = await setupBasicFixture();
    const ws = f.workspaces[0]!;
    const student = f.students.find((s) => s.id === ws.studentId)!;

    const r = await api("POST", "/api/strokes", {
      anonToken: student.anonToken,
      body: { strokes: [makeStroke(ws.id)] },
    });

    expect(r.status).toBe(200);
    expect((r.body as { accepted: number }).accepted).toBe(1);

    const inDb = await db().stroke.findFirst({ where: { workspaceId: ws.id } });
    expect(inDb).toMatchObject({
      coordinateSpace: "legacy",
      brushKind: "legacy",
      renderVersion: 1,
    });
  });

  it("сохраняет ink v2 и принимает 8-digit hex маркера", async () => {
    const f = await setupBasicFixture();
    const ws = f.workspaces[0]!;
    const student = f.students.find((s) => s.id === ws.studentId)!;
    const stroke = makeStroke(ws.id, {
      color: "#ffde3c66",
      coordinateSpace: "normalized",
      brushKind: "marker",
      renderVersion: 2,
    });

    const created = await api("POST", "/api/strokes", {
      anonToken: student.anonToken,
      body: { strokes: [stroke] },
    });
    expect(created.status).toBe(200);

    const inDb = await db().stroke.findUnique({ where: { id: stroke.id } });
    expect(inDb).toMatchObject({
      color: "#ffde3c66",
      coordinateSpace: "normalized",
      brushKind: "marker",
      renderVersion: 2,
    });

    const response = await api(
      "GET",
      `/api/workspaces/${ws.id}/strokes`,
      { anonToken: student.anonToken },
    );
    expect(response.status).toBe(200);
    const body = response.body as {
      strokes: Array<{
        id: string;
        coordinateSpace: string;
        brushKind: string;
        renderVersion: number;
      }>;
    };
    expect(body.strokes).toContainEqual(
      expect.objectContaining({
        id: stroke.id,
        coordinateSpace: "normalized",
        brushKind: "marker",
        renderVersion: 2,
      }),
    );
  });

  it("отклоняет патологические normalized v2 данные до рендера", async () => {
    const f = await setupBasicFixture();
    const ws = f.workspaces[0]!;
    const student = f.students.find((s) => s.id === ws.studentId)!;
    const base = makeStroke(ws.id, {
      coordinateSpace: "normalized",
      brushKind: "pen",
      renderVersion: 2,
    });

    for (const stroke of [
      { ...base, id: randomUUID(), size: 1 },
      {
        ...base,
        id: randomUUID(),
        points: [[0, 0, 0.5], [1.01, 1, 0.5]],
      },
      {
        ...base,
        id: randomUUID(),
        points: [[0, 0, 0.5], [1, 1, 1.1]],
      },
      {
        ...base,
        id: randomUUID(),
        coordinateSpace: "legacy",
      },
    ]) {
      const response = await api("POST", "/api/strokes", {
        anonToken: student.anonToken,
        body: { strokes: [stroke] },
      });
      expect(response.status).toBe(400);
    }

    expect(await db().stroke.count({ where: { workspaceId: ws.id } })).toBe(0);
  });

  it("без токена и без auth — 403", async () => {
    const f = await setupBasicFixture();
    const ws = f.workspaces[0]!;
    const r = await api("POST", "/api/strokes", {
      body: { strokes: [makeStroke(ws.id)] },
    });
    expect(r.status).toBe(403);
  });

  it("с чужим токеном — 403", async () => {
    const f = await setupBasicFixture();
    const ws = f.workspaces[0]!;
    const r = await api("POST", "/api/strokes", {
      anonToken: "bogus_token_xyz",
      body: { strokes: [makeStroke(ws.id)] },
    });
    expect(r.status).toBe(403);
  });

  it("идемпотентно по id — дубль не создаёт второй штрих", async () => {
    const f = await setupBasicFixture();
    const ws = f.workspaces[0]!;
    const student = f.students.find((s) => s.id === ws.studentId)!;
    const stroke = makeStroke(ws.id, { id: randomUUID() });

    const r1 = await api("POST", "/api/strokes", {
      anonToken: student.anonToken,
      body: { strokes: [stroke] },
    });
    expect(r1.status).toBe(200);

    const r2 = await api("POST", "/api/strokes", {
      anonToken: student.anonToken,
      body: { strokes: [stroke] }, // тот же id
    });
    expect(r2.status).toBe(200);

    const count = await db().stroke.count({ where: { workspaceId: ws.id } });
    expect(count).toBe(1);
  });

  it("тот же id с другим содержимым возвращает id_conflict", async () => {
    const f = await setupBasicFixture();
    const ws = f.workspaces[0]!;
    const student = f.students.find((s) => s.id === ws.studentId)!;
    const id = randomUUID();
    const original = makeStroke(ws.id, { id, color: "#0c0d10" });

    expect(
      (
        await api("POST", "/api/strokes", {
          anonToken: student.anonToken,
          body: { strokes: [original] },
        })
      ).status,
    ).toBe(200);
    const conflict = await api("POST", "/api/strokes", {
      anonToken: student.anonToken,
      body: { strokes: [makeStroke(ws.id, { id, color: "#d11a2a" })] },
    });

    expect(conflict.status).toBe(409);
    expect(conflict.body).toMatchObject({ error: "id_conflict" });
    expect(
      await db().stroke.findUnique({ where: { id }, select: { color: true } }),
    ).toEqual({ color: "#0c0d10" });
  });

  it("после сдачи подтверждает только точный идемпотентный replay", async () => {
    const f = await setupBasicFixture();
    const ws = f.workspaces[0]!;
    const student = f.students.find((s) => s.id === ws.studentId)!;
    const stroke = makeStroke(ws.id);

    expect(
      (
        await api("POST", "/api/strokes", {
          anonToken: student.anonToken,
          body: { strokes: [stroke] },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await api("POST", `/api/workspaces/${ws.id}/submit`, {
          anonToken: student.anonToken,
        })
      ).status,
    ).toBe(200);

    const replay = await api("POST", "/api/strokes", {
      anonToken: student.anonToken,
      body: { strokes: [stroke] },
    });
    expect(replay.status).toBe(200);
    expect(replay.body).toMatchObject({ ok: true, replayed: true });

    const newStroke = await api("POST", "/api/strokes", {
      anonToken: student.anonToken,
      body: { strokes: [makeStroke(ws.id)] },
    });
    expect(newStroke.status).toBe(409);
    expect(newStroke.body).toMatchObject({ error: "already_submitted" });
  });

  it("на закрытой сессии — 410", async () => {
    const f = await setupBasicFixture();
    await closeSession(f.session.id);
    const ws = f.workspaces[0]!;
    const student = f.students.find((s) => s.id === ws.studentId)!;
    const r = await api("POST", "/api/strokes", {
      anonToken: student.anonToken,
      body: { strokes: [makeStroke(ws.id)] },
    });
    expect(r.status).toBe(410);
  });

  it("несколько штрихов в одной пачке — все вставлены", async () => {
    const f = await setupBasicFixture();
    const ws = f.workspaces[0]!;
    const student = f.students.find((s) => s.id === ws.studentId)!;
    const N = 10;
    const strokes = Array.from({ length: N }, () => makeStroke(ws.id));
    const r = await api("POST", "/api/strokes", {
      anonToken: student.anonToken,
      body: { strokes },
    });
    expect(r.status).toBe(200);
    expect((r.body as { accepted: number }).accepted).toBe(N);
    const count = await db().stroke.count({ where: { workspaceId: ws.id } });
    expect(count).toBe(N);
  });

  it("отвергает batch со смешанными workspaceId", async () => {
    const f = await setupBasicFixture();
    const ws1 = f.workspaces[0]!;
    const ws2 = f.workspaces[1]!;
    const student = f.students.find((s) => s.id === ws1.studentId)!;
    const r = await api("POST", "/api/strokes", {
      anonToken: student.anonToken,
      body: { strokes: [makeStroke(ws1.id), makeStroke(ws2.id)] },
    });
    expect(r.status).toBe(400);
  });

  it("штрих ученика записывается с authorRole=student, layer=student", async () => {
    const f = await setupBasicFixture();
    const ws = f.workspaces[0]!;
    const student = f.students.find((s) => s.id === ws.studentId)!;
    const r = await api("POST", "/api/strokes", {
      anonToken: student.anonToken,
      body: { strokes: [makeStroke(ws.id)] },
    });
    expect(r.status).toBe(200);
    const stroke = await db().stroke.findFirst({ where: { workspaceId: ws.id } });
    expect(stroke?.authorRole).toBe("student");
    expect(stroke?.layer).toBe("student");
  });

  it("после сдачи ученик не может добавить штрих и статус остаётся submitted", async () => {
    const f = await setupBasicFixture();
    const ws = f.workspaces[0]!;
    const student = f.students.find((s) => s.id === ws.studentId)!;

    const submit = await api("POST", `/api/workspaces/${ws.id}/submit`, {
      anonToken: student.anonToken,
    });
    expect(submit.status).toBe(200);

    const r = await api("POST", "/api/strokes", {
      anonToken: student.anonToken,
      body: { strokes: [makeStroke(ws.id)] },
    });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ error: "already_submitted" });

    const fresh = await db().workspace.findUnique({ where: { id: ws.id } });
    expect(fresh?.status).toBe("submitted");
    expect(
      await db().stroke.count({ where: { workspaceId: ws.id } }),
    ).toBe(0);
  });
});

describe("GET /api/workspaces/[id]/strokes — чтение", () => {
  it("возвращает все добавленные штрихи + closedAt + now", async () => {
    const f = await setupBasicFixture();
    const ws = f.workspaces[0]!;
    const student = f.students.find((s) => s.id === ws.studentId)!;
    await api("POST", "/api/strokes", {
      anonToken: student.anonToken,
      body: { strokes: [makeStroke(ws.id), makeStroke(ws.id), makeStroke(ws.id)] },
    });

    const r = await api("GET", `/api/workspaces/${ws.id}/strokes`, {
      anonToken: student.anonToken,
    });
    expect(r.status).toBe(200);
    const body = r.body as { strokes: unknown[]; now: string; closedAt: string | null };
    expect(body.strokes).toHaveLength(3);
    expect(body.now).toBeTruthy();
    expect(body.closedAt).toBeNull();
  });

  it("с ?since= возвращает только новые штрихи", async () => {
    const f = await setupBasicFixture();
    const ws = f.workspaces[0]!;
    const student = f.students.find((s) => s.id === ws.studentId)!;

    // первый батч
    await api("POST", "/api/strokes", {
      anonToken: student.anonToken,
      body: { strokes: [makeStroke(ws.id), makeStroke(ws.id)] },
    });
    const t1 = (await api("GET", `/api/workspaces/${ws.id}/strokes`, {
      anonToken: student.anonToken,
    })).body as { now: string };

    // микропауза, чтобы createdAt был строго позже
    await new Promise((r) => setTimeout(r, 50));

    // второй батч
    await api("POST", "/api/strokes", {
      anonToken: student.anonToken,
      body: { strokes: [makeStroke(ws.id)] },
    });

    const r = await api("GET", `/api/workspaces/${ws.id}/strokes?since=${encodeURIComponent(t1.now)}`, {
      anonToken: student.anonToken,
    });
    expect(r.status).toBe(200);
    const body = r.body as { strokes: unknown[] };
    expect(body.strokes).toHaveLength(1);
  });

  it("403 без авторизации", async () => {
    const f = await setupBasicFixture();
    const ws = f.workspaces[0]!;
    const r = await api("GET", `/api/workspaces/${ws.id}/strokes`);
    expect(r.status).toBe(403);
  });

  it("404 на несуществующий workspace", async () => {
    const r = await api("GET", `/api/workspaces/none/strokes`, {
      anonToken: "any",
    });
    expect(r.status).toBe(404);
  });
});

describe("POST /api/strokes/delete — soft delete", () => {
  it("ученик удаляет свой штрих — соft delete + GET его не возвращает", async () => {
    const f = await setupBasicFixture();
    const ws = f.workspaces[0]!;
    const student = f.students.find((s) => s.id === ws.studentId)!;

    const s = makeStroke(ws.id);
    await api("POST", "/api/strokes", {
      anonToken: student.anonToken,
      body: { strokes: [s] },
    });
    const beforeDelete = await api(
      "GET",
      `/api/workspaces/${ws.id}/strokes`,
      { anonToken: student.anonToken },
    );
    const deleteCursor = (beforeDelete.body as { now: string }).now;
    await new Promise((resolve) => setTimeout(resolve, 10));

    const r = await api("POST", "/api/strokes/delete", {
      anonToken: student.anonToken,
      body: { workspaceId: ws.id, strokeIds: [s.id] },
    });
    expect(r.status).toBe(200);
    expect((r.body as { deleted: number }).deleted).toBe(1);

    const get = await api("GET", `/api/workspaces/${ws.id}/strokes`, {
      anonToken: student.anonToken,
    });
    expect((get.body as { strokes: unknown[] }).strokes).toHaveLength(0);

    const incremental = await api(
      "GET",
      `/api/workspaces/${ws.id}/strokes?since=${encodeURIComponent(deleteCursor)}`,
      { anonToken: student.anonToken },
    );
    expect(incremental.status).toBe(200);
    expect(
      (incremental.body as { deletedStrokeIds: string[] }).deletedStrokeIds,
    ).toContain(s.id);

    // но в БД штрих не удалён — только помечен deletedAt
    const rowsInDb = await db().stroke.count({ where: { workspaceId: ws.id } });
    expect(rowsInDb).toBe(1);
    const deleted = await db().stroke.findUnique({ where: { id: s.id } });
    expect(deleted?.deletedAt).not.toBeNull();
  });

  it("ученик НЕ удаляет учительский штрих (фильтр authorRole=student)", async () => {
    const f = await setupBasicFixture();
    const ws = f.workspaces[0]!;
    const student = f.students.find((s) => s.id === ws.studentId)!;

    // вставляем учительский штрих напрямую в БД
    const teacherStroke = await db().stroke.create({
      data: {
        id: randomUUID(),
        workspaceId: ws.id,
        color: "#d11a2a",
        size: 4,
        simulatePressure: false,
        points: [[0, 0, 0.5], [1, 1, 0.5]],
        authorRole: "teacher",
        layer: "teacher",
      },
    });

    const r = await api("POST", "/api/strokes/delete", {
      anonToken: student.anonToken,
      body: { workspaceId: ws.id, strokeIds: [teacherStroke.id] },
    });
    expect(r.status).toBe(200);
    expect((r.body as { deleted: number }).deleted).toBe(0);

    const inDb = await db().stroke.findUnique({ where: { id: teacherStroke.id } });
    expect(inDb?.deletedAt).toBeNull();
  });

  it("неверный токен — 403", async () => {
    const f = await setupBasicFixture();
    const ws = f.workspaces[0]!;
    const r = await api("POST", "/api/strokes/delete", {
      anonToken: "bogus",
      body: { workspaceId: ws.id, strokeIds: ["whatever1234567890"] },
    });
    expect(r.status).toBe(403);
  });

  it("закрытая сессия — 410", async () => {
    const f = await setupBasicFixture();
    await closeSession(f.session.id);
    const ws = f.workspaces[0]!;
    const student = f.students.find((s) => s.id === ws.studentId)!;
    const r = await api("POST", "/api/strokes/delete", {
      anonToken: student.anonToken,
      body: { workspaceId: ws.id, strokeIds: ["aaaaaaaaaaaaaaaa"] },
    });
    expect(r.status).toBe(410);
  });

  it("пустой массив — 400", async () => {
    const f = await setupBasicFixture();
    const ws = f.workspaces[0]!;
    const student = f.students.find((s) => s.id === ws.studentId)!;
    const r = await api("POST", "/api/strokes/delete", {
      anonToken: student.anonToken,
      body: { workspaceId: ws.id, strokeIds: [] },
    });
    expect(r.status).toBe(400);
  });

  it("после сдачи ученик не может удалить свой штрих", async () => {
    const f = await setupBasicFixture();
    const ws = f.workspaces[0]!;
    const student = f.students.find((s) => s.id === ws.studentId)!;
    const stroke = makeStroke(ws.id);

    await api("POST", "/api/strokes", {
      anonToken: student.anonToken,
      body: { strokes: [stroke] },
    });
    await api("POST", `/api/workspaces/${ws.id}/submit`, {
      anonToken: student.anonToken,
    });

    const r = await api("POST", "/api/strokes/delete", {
      anonToken: student.anonToken,
      body: { workspaceId: ws.id, strokeIds: [stroke.id] },
    });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ error: "already_submitted" });

    const fresh = await db().stroke.findUnique({ where: { id: stroke.id } });
    expect(fresh?.deletedAt).toBeNull();
  });

  it("после сдачи подтверждает replay уже выполненного delete", async () => {
    const f = await setupBasicFixture();
    const ws = f.workspaces[0]!;
    const student = f.students.find((s) => s.id === ws.studentId)!;
    const stroke = makeStroke(ws.id);

    await api("POST", "/api/strokes", {
      anonToken: student.anonToken,
      body: { strokes: [stroke] },
    });
    expect(
      (
        await api("POST", "/api/strokes/delete", {
          anonToken: student.anonToken,
          body: { workspaceId: ws.id, strokeIds: [stroke.id] },
        })
      ).status,
    ).toBe(200);
    await api("POST", `/api/workspaces/${ws.id}/submit`, {
      anonToken: student.anonToken,
    });

    const replay = await api("POST", "/api/strokes/delete", {
      anonToken: student.anonToken,
      body: { workspaceId: ws.id, strokeIds: [stroke.id] },
    });
    expect(replay.status).toBe(200);
    expect(replay.body).toMatchObject({ ok: true, replayed: true });
  });

  it("во время заморозки ученик не может удалить свой штрих", async () => {
    const f = await setupBasicFixture();
    const ws = f.workspaces[0]!;
    const student = f.students.find((s) => s.id === ws.studentId)!;
    const stroke = makeStroke(ws.id);

    await api("POST", "/api/strokes", {
      anonToken: student.anonToken,
      body: { strokes: [stroke] },
    });
    await db().session.update({
      where: { id: f.session.id },
      data: { freezeUntil: new Date(Date.now() + 60_000) },
    });

    const r = await api("POST", "/api/strokes/delete", {
      anonToken: student.anonToken,
      body: { workspaceId: ws.id, strokeIds: [stroke.id] },
    });
    expect(r.status).toBe(423);
    expect(r.body).toMatchObject({ error: "frozen" });

    const fresh = await db().stroke.findUnique({ where: { id: stroke.id } });
    expect(fresh?.deletedAt).toBeNull();
  });
});
