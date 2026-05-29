import { describe, expect, it, afterAll, beforeAll } from "vitest";
import {
  api,
  cleanupTestData,
  closeSession,
  db,
  disconnect,
  setupBasicFixture,
} from "../helpers";

// 1×1 white PNG
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

beforeAll(async () => {
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
  await disconnect();
});

describe("POST /api/workspaces/[id]/hand — поднять/опустить руку", () => {
  it("ученик поднимает руку — handRaisedAt становится не-null", async () => {
    const f = await setupBasicFixture();
    const ws = f.workspaces[0]!;
    const student = f.students.find((s) => s.id === ws.studentId)!;

    const r = await api("POST", `/api/workspaces/${ws.id}/hand`, {
      anonToken: student.anonToken,
      body: { raised: true },
    });
    expect(r.status).toBe(200);

    const fresh = await db().workspace.findUnique({ where: { id: ws.id } });
    expect(fresh?.handRaisedAt).not.toBeNull();
  });

  it("опускает руку — handRaisedAt снова null", async () => {
    const f = await setupBasicFixture();
    const ws = f.workspaces[0]!;
    const student = f.students.find((s) => s.id === ws.studentId)!;

    await api("POST", `/api/workspaces/${ws.id}/hand`, {
      anonToken: student.anonToken,
      body: { raised: true },
    });
    const r = await api("POST", `/api/workspaces/${ws.id}/hand`, {
      anonToken: student.anonToken,
      body: { raised: false },
    });
    expect(r.status).toBe(200);

    const fresh = await db().workspace.findUnique({ where: { id: ws.id } });
    expect(fresh?.handRaisedAt).toBeNull();
  });

  it("toggle без явного raised — переключает", async () => {
    const f = await setupBasicFixture();
    const ws = f.workspaces[0]!;
    const student = f.students.find((s) => s.id === ws.studentId)!;

    // первый POST без body → должен поднять
    const r1 = await api("POST", `/api/workspaces/${ws.id}/hand`, {
      anonToken: student.anonToken,
      body: {},
    });
    expect(r1.status).toBe(200);
    let fresh = await db().workspace.findUnique({ where: { id: ws.id } });
    expect(fresh?.handRaisedAt).not.toBeNull();

    // второй POST → должен опустить
    const r2 = await api("POST", `/api/workspaces/${ws.id}/hand`, {
      anonToken: student.anonToken,
      body: {},
    });
    expect(r2.status).toBe(200);
    fresh = await db().workspace.findUnique({ where: { id: ws.id } });
    expect(fresh?.handRaisedAt).toBeNull();
  });

  it("без токена — 403", async () => {
    const f = await setupBasicFixture();
    const ws = f.workspaces[0]!;
    const r = await api("POST", `/api/workspaces/${ws.id}/hand`, {
      body: { raised: true },
    });
    expect(r.status).toBe(403);
  });

  it("чужой токен — 403", async () => {
    const f = await setupBasicFixture();
    const ws = f.workspaces[0]!;
    const r = await api("POST", `/api/workspaces/${ws.id}/hand`, {
      anonToken: "bogus",
      body: { raised: true },
    });
    expect(r.status).toBe(403);
  });

  it("на закрытой сессии — 410", async () => {
    const f = await setupBasicFixture();
    await closeSession(f.session.id);
    const ws = f.workspaces[0]!;
    const student = f.students.find((s) => s.id === ws.studentId)!;
    const r = await api("POST", `/api/workspaces/${ws.id}/hand`, {
      anonToken: student.anonToken,
      body: { raised: true },
    });
    expect(r.status).toBe(410);
  });
});

describe("POST /api/workspaces/[id]/submit — сдать работу", () => {
  it("статус становится submitted, submittedAt не-null, рука снимается", async () => {
    const f = await setupBasicFixture();
    const ws = f.workspaces[0]!;
    const student = f.students.find((s) => s.id === ws.studentId)!;

    // сначала поднимаем руку
    await api("POST", `/api/workspaces/${ws.id}/hand`, {
      anonToken: student.anonToken,
      body: { raised: true },
    });

    const r = await api("POST", `/api/workspaces/${ws.id}/submit`, {
      anonToken: student.anonToken,
    });
    expect(r.status).toBe(200);

    const fresh = await db().workspace.findUnique({ where: { id: ws.id } });
    expect(fresh?.status).toBe("submitted");
    expect(fresh?.submittedAt).not.toBeNull();
    expect(fresh?.handRaisedAt).toBeNull();
  });

  it("создаёт ActivityLog kind=submitted", async () => {
    const f = await setupBasicFixture();
    const ws = f.workspaces[0]!;
    const student = f.students.find((s) => s.id === ws.studentId)!;

    await api("POST", `/api/workspaces/${ws.id}/submit`, {
      anonToken: student.anonToken,
    });

    const log = await db().activityLog.findFirst({
      where: { workspaceId: ws.id, kind: "submitted" },
    });
    expect(log).not.toBeNull();
  });

  it("без токена — 403", async () => {
    const f = await setupBasicFixture();
    const ws = f.workspaces[0]!;
    const r = await api("POST", `/api/workspaces/${ws.id}/submit`);
    expect(r.status).toBe(403);
  });

  it("закрытая сессия — 410", async () => {
    const f = await setupBasicFixture();
    await closeSession(f.session.id);
    const ws = f.workspaces[0]!;
    const student = f.students.find((s) => s.id === ws.studentId)!;
    const r = await api("POST", `/api/workspaces/${ws.id}/submit`, {
      anonToken: student.anonToken,
    });
    expect(r.status).toBe(410);
  });

  it("404 на несуществующий workspace", async () => {
    const r = await api("POST", `/api/workspaces/none/submit`, {
      anonToken: "any",
    });
    expect(r.status).toBe(404);
  });
});

describe("POST /api/workspaces/[id]/preview — загрузка снимка", () => {
  it("ученик кладёт превью — в БД появляется WorkspacePreview", async () => {
    const f = await setupBasicFixture();
    const ws = f.workspaces[0]!;
    const student = f.students.find((s) => s.id === ws.studentId)!;

    const r = await api("POST", `/api/workspaces/${ws.id}/preview`, {
      anonToken: student.anonToken,
      body: { pageIndex: 0, pngBase64: TINY_PNG_BASE64 },
    });
    expect(r.status).toBe(200);

    const preview = await db().workspacePreview.findUnique({
      where: {
        workspaceId_pageIndex: { workspaceId: ws.id, pageIndex: 0 },
      },
    });
    expect(preview).not.toBeNull();
    expect(preview!.pngBytes.byteLength).toBeGreaterThan(0);
  });

  it("upsert — повторная загрузка обновляет, не дублирует", async () => {
    const f = await setupBasicFixture();
    const ws = f.workspaces[0]!;
    const student = f.students.find((s) => s.id === ws.studentId)!;

    await api("POST", `/api/workspaces/${ws.id}/preview`, {
      anonToken: student.anonToken,
      body: { pageIndex: 0, pngBase64: TINY_PNG_BASE64 },
    });
    await api("POST", `/api/workspaces/${ws.id}/preview`, {
      anonToken: student.anonToken,
      body: { pageIndex: 0, pngBase64: TINY_PNG_BASE64 },
    });

    const count = await db().workspacePreview.count({
      where: { workspaceId: ws.id, pageIndex: 0 },
    });
    expect(count).toBe(1);
  });

  it("разные pageIndex — отдельные записи", async () => {
    const f = await setupBasicFixture();
    const ws = f.workspaces[0]!;
    const student = f.students.find((s) => s.id === ws.studentId)!;

    await api("POST", `/api/workspaces/${ws.id}/preview`, {
      anonToken: student.anonToken,
      body: { pageIndex: 0, pngBase64: TINY_PNG_BASE64 },
    });
    await api("POST", `/api/workspaces/${ws.id}/preview`, {
      anonToken: student.anonToken,
      body: { pageIndex: 2, pngBase64: TINY_PNG_BASE64 },
    });

    const count = await db().workspacePreview.count({
      where: { workspaceId: ws.id },
    });
    expect(count).toBe(2);
  });

  it("без токена — 403", async () => {
    const f = await setupBasicFixture();
    const ws = f.workspaces[0]!;
    const r = await api("POST", `/api/workspaces/${ws.id}/preview`, {
      body: { pageIndex: 0, pngBase64: TINY_PNG_BASE64 },
    });
    expect(r.status).toBe(403);
  });

  it("слишком большой PNG — 413", async () => {
    const f = await setupBasicFixture();
    const ws = f.workspaces[0]!;
    const student = f.students.find((s) => s.id === ws.studentId)!;
    const huge = "A".repeat(150_000); // > MAX_BYTES после base64-decode
    const r = await api("POST", `/api/workspaces/${ws.id}/preview`, {
      anonToken: student.anonToken,
      body: { pageIndex: 0, pngBase64: huge },
    });
    expect(r.status).toBe(413);
  });

  it("закрытая сессия — 410", async () => {
    const f = await setupBasicFixture();
    await closeSession(f.session.id);
    const ws = f.workspaces[0]!;
    const student = f.students.find((s) => s.id === ws.studentId)!;
    const r = await api("POST", `/api/workspaces/${ws.id}/preview`, {
      anonToken: student.anonToken,
      body: { pageIndex: 0, pngBase64: TINY_PNG_BASE64 },
    });
    expect(r.status).toBe(410);
  });
});

describe("GET /api/workspaces/[id]/preview — отдача PNG", () => {
  it("отдаёт PNG который положил ученик", async () => {
    const f = await setupBasicFixture();
    const ws = f.workspaces[0]!;
    const student = f.students.find((s) => s.id === ws.studentId)!;
    await api("POST", `/api/workspaces/${ws.id}/preview`, {
      anonToken: student.anonToken,
      body: { pageIndex: 0, pngBase64: TINY_PNG_BASE64 },
    });

    const r = await api("GET", `/api/workspaces/${ws.id}/preview?page=0`, {
      anonToken: student.anonToken,
    });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("image/png");
    const buf = r.body as ArrayBuffer;
    expect(buf.byteLength).toBeGreaterThan(0);
  });

  it("404 если превью ещё нет", async () => {
    const f = await setupBasicFixture();
    const ws = f.workspaces[0]!;
    const student = f.students.find((s) => s.id === ws.studentId)!;
    const r = await api("GET", `/api/workspaces/${ws.id}/preview?page=0`, {
      anonToken: student.anonToken,
    });
    expect(r.status).toBe(404);
  });

  it("403 без авторизации", async () => {
    const f = await setupBasicFixture();
    const ws = f.workspaces[0]!;
    const student = f.students.find((s) => s.id === ws.studentId)!;
    await api("POST", `/api/workspaces/${ws.id}/preview`, {
      anonToken: student.anonToken,
      body: { pageIndex: 0, pngBase64: TINY_PNG_BASE64 },
    });
    const r = await api("GET", `/api/workspaces/${ws.id}/preview?page=0`);
    expect(r.status).toBe(403);
  });
});

describe("POST /api/workspaces/[id]/join — отметка факта входа", () => {
  it("ставит status=active + joinedAt", async () => {
    const f = await setupBasicFixture();
    const ws = f.workspaces[0]!;
    const student = f.students.find((s) => s.id === ws.studentId)!;
    const r = await api("POST", `/api/workspaces/${ws.id}/join`, {
      anonToken: student.anonToken,
    });
    expect(r.status).toBe(200);

    const fresh = await db().workspace.findUnique({ where: { id: ws.id } });
    expect(fresh?.status).toBe("active");
    expect(fresh?.joinedAt).not.toBeNull();
  });

  it("повторный join не сбрасывает joinedAt", async () => {
    const f = await setupBasicFixture();
    const ws = f.workspaces[0]!;
    const student = f.students.find((s) => s.id === ws.studentId)!;

    await api("POST", `/api/workspaces/${ws.id}/join`, {
      anonToken: student.anonToken,
    });
    const t1 = (await db().workspace.findUnique({ where: { id: ws.id } }))!
      .joinedAt!;

    await new Promise((r) => setTimeout(r, 30));
    await api("POST", `/api/workspaces/${ws.id}/join`, {
      anonToken: student.anonToken,
    });
    const t2 = (await db().workspace.findUnique({ where: { id: ws.id } }))!
      .joinedAt!;
    expect(t1.getTime()).toBe(t2.getTime());
  });

  it("закрытая сессия → 410", async () => {
    const f = await setupBasicFixture();
    await closeSession(f.session.id);
    const ws = f.workspaces[0]!;
    const student = f.students.find((s) => s.id === ws.studentId)!;
    const r = await api("POST", `/api/workspaces/${ws.id}/join`, {
      anonToken: student.anonToken,
    });
    expect(r.status).toBe(410);
  });
});
