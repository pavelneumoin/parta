import { describe, expect, it, afterAll, beforeAll } from "vitest";
import {
  api,
  cleanupTestData,
  closeSession,
  createClass,
  createLesson,
  createSession,
  createTeacher,
  db,
  disconnect,
  loginAsTeacher,
  setupBasicFixture,
} from "../helpers";

beforeAll(async () => {
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
  await disconnect();
});

describe("GET /api/sessions/[id]/state", () => {
  it("без авторизации — 403", async () => {
    const f = await setupBasicFixture();
    const r = await api("GET", `/api/sessions/${f.session.id}/state`);
    expect(r.status).toBe(403);
  });

  it("404 на несуществующую сессию", async () => {
    const r = await api("GET", `/api/sessions/none/state`);
    expect(r.status).toBe(404);
  });

  it("учитель-владелец видит state со всеми workspace", async () => {
    const { teacher, email, password } = await createTeacher();
    const klass = await createClass(teacher.id, ["A.", "B.", "C."]);
    const lesson = await createLesson(teacher.id, { classId: klass.id });
    const session = await createSession({
      teacherId: teacher.id,
      lessonId: lesson.id,
      classId: klass.id,
      studentIds: klass.students.map((s) => s.id),
    });

    const cookies = await loginAsTeacher(email, password);
    const r = await api("GET", `/api/sessions/${session.id}/state`, { cookies });
    expect(r.status).toBe(200);

    const body = r.body as {
      sessionId: string;
      closedAt: string | null;
      templateKind: string;
      workspaces: { id: string; studentName: string; status: string }[];
    };
    expect(body.sessionId).toBe(session.id);
    expect(body.workspaces).toHaveLength(3);
    expect(body.workspaces.every((w) => w.status === "not_joined")).toBe(true);
  });

  it("отражает поднятую руку и сданную работу", async () => {
    const { teacher, email, password } = await createTeacher();
    const klass = await createClass(teacher.id, ["X.", "Y."]);
    const lesson = await createLesson(teacher.id, { classId: klass.id });
    const session = await createSession({
      teacherId: teacher.id,
      lessonId: lesson.id,
      classId: klass.id,
      studentIds: klass.students.map((s) => s.id),
    });

    // первый ученик поднимает руку
    const ws0 = session.workspaces[0]!;
    await api("POST", `/api/workspaces/${ws0.id}/hand`, {
      anonToken: ws0.accessCookie,
      body: { raised: true },
    });

    // второй ученик сдаёт работу
    const ws1 = session.workspaces[1]!;
    await api("POST", `/api/workspaces/${ws1.id}/submit`, {
      anonToken: ws1.accessCookie,
    });

    const cookies = await loginAsTeacher(email, password);
    const r = await api("GET", `/api/sessions/${session.id}/state`, { cookies });
    const body = r.body as {
      workspaces: { id: string; status: string; handRaisedAt: string | null }[];
    };
    const w0 = body.workspaces.find((w) => w.id === ws0.id)!;
    const w1 = body.workspaces.find((w) => w.id === ws1.id)!;
    expect(w0.handRaisedAt).not.toBeNull();
    expect(w1.status).toBe("submitted");
  });

  it("чужой учитель — 403", async () => {
    const f = await setupBasicFixture();
    const other = await createTeacher();
    const cookies = await loginAsTeacher(other.email, other.password);
    const r = await api("GET", `/api/sessions/${f.session.id}/state`, { cookies });
    expect(r.status).toBe(403);
  });
});

describe("POST /api/sessions/[id]/broadcast", () => {
  const broadcastBody = {
    strokes: [
      {
        id: "broadcast-stroke-00000001",
        pageIndex: 0,
        color: "#d11a2a",
        size: 0.02,
        simulatePressure: false,
        coordinateSpace: "normalized",
        brushKind: "shape",
        renderVersion: 2,
        points: [
          [0.1, 0.1, 0.5],
          [0.2, 0.2, 0.6],
        ],
      },
    ],
  };

  it("без авторизации — 403", async () => {
    const f = await setupBasicFixture();
    const r = await api("POST", `/api/sessions/${f.session.id}/broadcast`, {
      body: broadcastBody,
    });
    expect(r.status).toBe(403);
  });

  it("чужой учитель — 403", async () => {
    const f = await setupBasicFixture();
    const other = await createTeacher();
    const cookies = await loginAsTeacher(other.email, other.password);
    const r = await api("POST", `/api/sessions/${f.session.id}/broadcast`, {
      cookies,
      body: broadcastBody,
    });
    expect(r.status).toBe(403);
  });

  it("учитель-владелец broadcast'ит — штрих появляется во ВСЕХ workspace", async () => {
    const { teacher, email, password } = await createTeacher();
    const klass = await createClass(teacher.id, ["A.", "B.", "C.", "D."]);
    const lesson = await createLesson(teacher.id, { classId: klass.id });
    const session = await createSession({
      teacherId: teacher.id,
      lessonId: lesson.id,
      classId: klass.id,
      studentIds: klass.students.map((s) => s.id),
    });

    const cookies = await loginAsTeacher(email, password);
    const r = await api("POST", `/api/sessions/${session.id}/broadcast`, {
      cookies,
      body: broadcastBody,
    });
    expect(r.status).toBe(200);
    const retry = await api("POST", `/api/sessions/${session.id}/broadcast`, {
      cookies,
      body: broadcastBody,
    });
    expect(retry.status).toBe(200);

    // Повтор того же client id идемпотентен: по 1 штриху на workspace.
    for (const ws of session.workspaces) {
      const strokes = await db().stroke.findMany({
        where: { workspaceId: ws.id, deletedAt: null },
      });
      expect(strokes).toHaveLength(1);
      expect(strokes[0]!.layer).toBe("teacher");
      expect(strokes[0]!.authorRole).toBe("teacher");
      expect(strokes[0]!.color).toBe("#d11a2a");
      expect(strokes[0]!.coordinateSpace).toBe("normalized");
      expect(strokes[0]!.brushKind).toBe("shape");
      expect(strokes[0]!.renderVersion).toBe(2);
    }
  });

  it("закрытая сессия — 410", async () => {
    const { teacher, email, password } = await createTeacher();
    const klass = await createClass(teacher.id, ["A."]);
    const lesson = await createLesson(teacher.id, { classId: klass.id });
    const session = await createSession({
      teacherId: teacher.id,
      lessonId: lesson.id,
      classId: klass.id,
      studentIds: klass.students.map((s) => s.id),
    });
    await closeSession(session.id);

    const cookies = await loginAsTeacher(email, password);
    const r = await api("POST", `/api/sessions/${session.id}/broadcast`, {
      cookies,
      body: broadcastBody,
    });
    expect(r.status).toBe(410);
  });
});
