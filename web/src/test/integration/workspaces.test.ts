import { describe, expect, it, afterAll, beforeAll } from "vitest";
import {
  api,
  cleanupTestData,
  closeSession,
  db,
  disconnect,
  setupBasicFixture,
} from "../helpers";
import {
  deriveWorkspaceJoinPin,
  studentAccessCookieName,
} from "@/lib/studentAccess";

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

  it("после сдачи ученик не может изменить состояние поднятой руки", async () => {
    const f = await setupBasicFixture();
    const ws = f.workspaces[0]!;
    const student = f.students.find((s) => s.id === ws.studentId)!;

    await api("POST", `/api/workspaces/${ws.id}/submit`, {
      anonToken: student.anonToken,
    });
    const r = await api("POST", `/api/workspaces/${ws.id}/hand`, {
      anonToken: student.anonToken,
      body: { raised: true },
    });

    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ error: "already_submitted" });
    const fresh = await db().workspace.findUnique({ where: { id: ws.id } });
    expect(fresh?.handRaisedAt).toBeNull();
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

  it("повтор submit идемпотентен после потерянного ответа", async () => {
    const f = await setupBasicFixture();
    const ws = f.workspaces[0]!;
    const student = f.students.find((s) => s.id === ws.studentId)!;

    const first = await api("POST", `/api/workspaces/${ws.id}/submit`, {
      anonToken: student.anonToken,
    });
    expect(first.status).toBe(200);
    const afterFirst = await db().workspace.findUnique({
      where: { id: ws.id },
      select: { submittedAt: true },
    });

    const retry = await api("POST", `/api/workspaces/${ws.id}/submit`, {
      anonToken: student.anonToken,
    });
    expect(retry.status).toBe(200);
    expect(retry.body).toMatchObject({ ok: true, alreadySubmitted: true });

    const afterRetry = await db().workspace.findUnique({
      where: { id: ws.id },
      select: { submittedAt: true },
    });
    expect(afterRetry?.submittedAt?.toISOString()).toBe(
      afterFirst?.submittedAt?.toISOString(),
    );
    expect(
      await db().activityLog.count({
        where: { workspaceId: ws.id, kind: "submitted" },
      }),
    ).toBe(1);
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

  it("после сдачи ученик не может подменить превью", async () => {
    const f = await setupBasicFixture();
    const ws = f.workspaces[0]!;
    const student = f.students.find((s) => s.id === ws.studentId)!;
    await api("POST", `/api/workspaces/${ws.id}/submit`, {
      anonToken: student.anonToken,
    });

    const r = await api("POST", `/api/workspaces/${ws.id}/preview`, {
      anonToken: student.anonToken,
      body: { pageIndex: 0, pngBase64: TINY_PNG_BASE64 },
    });

    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ error: "already_submitted" });
  });

  it("во время заморозки ученик не может обновить превью", async () => {
    const f = await setupBasicFixture();
    const ws = f.workspaces[0]!;
    const student = f.students.find((s) => s.id === ws.studentId)!;
    await db().session.update({
      where: { id: f.session.id },
      data: { freezeUntil: new Date(Date.now() + 60_000) },
    });

    const r = await api("POST", `/api/workspaces/${ws.id}/preview`, {
      anonToken: student.anonToken,
      body: { pageIndex: 0, pngBase64: TINY_PNG_BASE64 },
    });

    expect(r.status).toBe(423);
    expect(r.body).toMatchObject({ error: "frozen" });
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
  async function releaseWorkspace(workspaceId: string) {
    await db().workspace.update({
      where: { id: workspaceId },
      data: {
        studentAccessHash: null,
        studentAccessExpiresAt: null,
        claimedAt: null,
      },
    });
  }

  it("ставит status=active + joinedAt и выдаёт HttpOnly cookie", async () => {
    const f = await setupBasicFixture();
    const ws = f.workspaces[0]!;
    await releaseWorkspace(ws.id);

    const r = await api("POST", `/api/workspaces/${ws.id}/join`, {
      body: {
        credential: f.session.joinCode,
        studentId: ws.studentId,
        pin: deriveWorkspaceJoinPin(
          ws.id,
          f.workspaces.map((item) => item.id),
        ),
      },
    });
    expect(r.status).toBe(200);
    const setCookie = r.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`parta_student_access_${ws.id}=`);
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(setCookie.toLowerCase()).toContain("samesite=lax");

    const fresh = await db().workspace.findUnique({ where: { id: ws.id } });
    expect(fresh?.status).toBe("active");
    expect(fresh?.joinedAt).not.toBeNull();
    expect(fresh?.studentAccessHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("повторный join с выданной cookie не сбрасывает joinedAt", async () => {
    const f = await setupBasicFixture();
    const ws = f.workspaces[0]!;
    await releaseWorkspace(ws.id);

    const first = await api("POST", `/api/workspaces/${ws.id}/join`, {
      body: {
        credential: f.session.joinCode,
        studentId: ws.studentId,
        pin: deriveWorkspaceJoinPin(
          ws.id,
          f.workspaces.map((item) => item.id),
        ),
      },
    });
    expect(first.status).toBe(200);
    const cookie = (first.headers.get("set-cookie") ?? "").split(";")[0]!;
    expect(cookie).toContain(`parta_student_access_${ws.id}=`);

    const t1 = (await db().workspace.findUnique({ where: { id: ws.id } }))!
      .joinedAt!;

    await new Promise((r) => setTimeout(r, 30));
    const second = await api("POST", `/api/workspaces/${ws.id}/join`, {
      cookies: cookie,
      body: {
        credential: f.session.joinCode,
        studentId: ws.studentId,
        pin: deriveWorkspaceJoinPin(
          ws.id,
          f.workspaces.map((item) => item.id),
        ),
      },
    });
    expect(second.status).toBe(200);

    const t2 = (await db().workspace.findUnique({ where: { id: ws.id } }))!
      .joinedAt!;
    expect(t1.getTime()).toBe(t2.getTime());
  });

  it("второе устройство не может забрать уже открытый workspace", async () => {
    const f = await setupBasicFixture();
    const ws = f.workspaces[0]!;
    await releaseWorkspace(ws.id);
    const body = {
      credential: f.session.joinCode,
      studentId: ws.studentId,
      pin: deriveWorkspaceJoinPin(
        ws.id,
        f.workspaces.map((item) => item.id),
      ),
    };

    const first = await api("POST", `/api/workspaces/${ws.id}/join`, { body });
    expect(first.status).toBe(200);

    const secondDevice = await api("POST", `/api/workspaces/${ws.id}/join`, {
      body,
    });
    expect(secondDevice.status).toBe(409);
  });

  it("при одновременном первом входе доступ получает только одно устройство", async () => {
    const f = await setupBasicFixture();
    const ws = f.workspaces[0]!;
    await releaseWorkspace(ws.id);
    const body = {
      credential: f.session.joinCode,
      studentId: ws.studentId,
      pin: deriveWorkspaceJoinPin(
        ws.id,
        f.workspaces.map((item) => item.id),
      ),
    };

    const results = await Promise.all([
      api("POST", `/api/workspaces/${ws.id}/join`, { body }),
      api("POST", `/api/workspaces/${ws.id}/join`, { body }),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
  });

  it("неверный код не выдаёт доступ", async () => {
    const f = await setupBasicFixture();
    const ws = f.workspaces[0]!;
    await releaseWorkspace(ws.id);

    const r = await api("POST", `/api/workspaces/${ws.id}/join`, {
      body: {
        credential: "000000",
        studentId: ws.studentId,
        pin: deriveWorkspaceJoinPin(
          ws.id,
          f.workspaces.map((item) => item.id),
        ),
      },
    });
    expect([401, 403]).toContain(r.status);
    expect(r.headers.get("set-cookie")).toBeNull();
  });

  it("общий код без правильного личного PIN не позволяет занять чужой лист", async () => {
    const f = await setupBasicFixture();
    const ws = f.workspaces[0]!;
    await releaseWorkspace(ws.id);
    const actualPin = deriveWorkspaceJoinPin(
      ws.id,
      f.workspaces.map((item) => item.id),
    );
    const wrongPin = actualPin === "9999" ? "0000" : "9999";

    const r = await api("POST", `/api/workspaces/${ws.id}/join`, {
      body: {
        credential: f.session.joinCode,
        studentId: ws.studentId,
        pin: wrongPin,
      },
    });

    expect(r.status).toBe(403);
    expect(r.headers.get("set-cookie")).toBeNull();
    const fresh = await db().workspace.findUnique({ where: { id: ws.id } });
    expect(fresh?.studentAccessHash).toBeNull();
  });

  it("один браузер сохраняет доступ сразу к нескольким заданиям", async () => {
    const f = await setupBasicFixture();
    const first = f.workspaces[0]!;
    const second = f.workspaces[1]!;
    const cookieJar = [
      `${studentAccessCookieName(first.id)}=${first.accessCookie}`,
      `${studentAccessCookieName(second.id)}=${second.accessCookie}`,
    ].join("; ");

    const firstResult = await api(
      "GET",
      `/api/workspaces/${first.id}/strokes`,
      { cookies: cookieJar },
    );
    const secondResult = await api(
      "GET",
      `/api/workspaces/${second.id}/strokes`,
      { cookies: cookieJar },
    );

    expect(firstResult.status).toBe(200);
    expect(secondResult.status).toBe(200);
  });

  it("закрытая сессия → 410", async () => {
    const f = await setupBasicFixture();
    await closeSession(f.session.id);
    const ws = f.workspaces[0]!;
    await releaseWorkspace(ws.id);

    const r = await api("POST", `/api/workspaces/${ws.id}/join`, {
      body: {
        credential: f.session.joinCode,
        studentId: ws.studentId,
        pin: deriveWorkspaceJoinPin(
          ws.id,
          f.workspaces.map((item) => item.id),
        ),
      },
    });
    expect(r.status).toBe(410);
  });
});

describe("GET /j/[code] — публичный выбор ученика", () => {
  it("не встраивает legacy Student.anonToken в HTML", async () => {
    const f = await setupBasicFixture();
    const sentinel = `LEGACY_SECRET_${Date.now()}_MUST_NOT_LEAK`;
    await db().student.update({
      where: { id: f.students[0]!.id },
      data: { anonToken: sentinel },
    });

    const r = await api("GET", `/j/${f.session.joinCode}`);
    expect(r.status).toBe(200);
    expect(String(r.body)).not.toContain(sentinel);
  });
});
