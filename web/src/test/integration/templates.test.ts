import { describe, expect, it, afterAll, beforeAll } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  api,
  BASE_URL,
  cleanupTestData,
  createClass,
  createLesson,
  createSession,
  createTeacher,
  db,
  disconnect,
  loginAsTeacher,
} from "../helpers";

beforeAll(async () => {
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
  await disconnect();
});

async function makePdfBytes(pages = 1): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    doc.addPage([200, 300]);
  }
  return doc.save();
}

async function postPdf(cookies: string, bytes: Uint8Array, filename = "test.pdf") {
  const fd = new FormData();
  fd.append("file", new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), filename);
  const r = await fetch(`${BASE_URL}/api/templates/upload`, {
    method: "POST",
    headers: { cookie: cookies },
    body: fd,
    redirect: "manual",
  });
  let body: unknown = null;
  try {
    body = await r.json();
  } catch {
    /* ignore */
  }
  return { status: r.status, body };
}

describe("POST /api/templates/upload", () => {
  it("без авторизации — 307 (middleware редиректит на /signin)", async () => {
    const r = await api("POST", "/api/templates/upload", {
      body: {},
    });
    // middleware ловит до того, как роут получит multipart
    expect([307, 401, 403]).toContain(r.status);
  });

  it("успешная загрузка валидного PDF", async () => {
    const { email, password } = await createTeacher();
    const cookies = await loginAsTeacher(email, password);
    const pdf = await makePdfBytes(2);

    const r = await postPdf(cookies, pdf);
    expect(r.status).toBe(200);

    const body = r.body as { templateId: string; pageCount: number; bytes: number };
    expect(body.templateId).toBeTruthy();
    expect(body.pageCount).toBe(2);
    expect(body.bytes).toBe(pdf.byteLength);

    // в БД появилась запись
    const tpl = await db().templateFile.findUnique({ where: { id: body.templateId } });
    expect(tpl).not.toBeNull();
    expect(tpl!.mime).toBe("application/pdf");
  });

  it("не-PDF файл — 415", async () => {
    const { email, password } = await createTeacher();
    const cookies = await loginAsTeacher(email, password);

    const fd = new FormData();
    fd.append("file", new Blob(["hello"], { type: "text/plain" }), "x.txt");
    const r = await fetch(`${BASE_URL}/api/templates/upload`, {
      method: "POST",
      headers: { cookie: cookies },
      body: fd,
      redirect: "manual",
    });
    expect(r.status).toBe(415);
  });

  it("PDF >10 страниц — 413", async () => {
    const { email, password } = await createTeacher();
    const cookies = await loginAsTeacher(email, password);
    const pdf = await makePdfBytes(11);

    const r = await postPdf(cookies, pdf);
    expect(r.status).toBe(413);
  });

  it("битый PDF — 400", async () => {
    const { email, password } = await createTeacher();
    const cookies = await loginAsTeacher(email, password);

    const fd = new FormData();
    fd.append(
      "file",
      new Blob([new Uint8Array([0xff, 0xfe, 0xfd])], { type: "application/pdf" }),
      "broken.pdf",
    );
    const r = await fetch(`${BASE_URL}/api/templates/upload`, {
      method: "POST",
      headers: { cookie: cookies },
      body: fd,
      redirect: "manual",
    });
    expect(r.status).toBe(400);
  });

  it("без файла — 400", async () => {
    const { email, password } = await createTeacher();
    const cookies = await loginAsTeacher(email, password);
    const fd = new FormData();
    const r = await fetch(`${BASE_URL}/api/templates/upload`, {
      method: "POST",
      headers: { cookie: cookies },
      body: fd,
      redirect: "manual",
    });
    expect(r.status).toBe(400);
  });
});

describe("GET /api/templates/[id]/file", () => {
  it("учитель-владелец получает PDF (200 + content-type pdf)", async () => {
    const { email, password } = await createTeacher();
    const cookies = await loginAsTeacher(email, password);
    const pdf = await makePdfBytes(1);
    const up = await postPdf(cookies, pdf);
    const templateId = (up.body as { templateId: string }).templateId;

    const r = await api("GET", `/api/templates/${templateId}/file`, { cookies });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("application/pdf");
    const buf = r.body as ArrayBuffer;
    expect(buf.byteLength).toBe(pdf.byteLength);
  });

  it("без auth — 403", async () => {
    const { email, password } = await createTeacher();
    const cookies = await loginAsTeacher(email, password);
    const pdf = await makePdfBytes(1);
    const up = await postPdf(cookies, pdf);
    const templateId = (up.body as { templateId: string }).templateId;

    const r = await api("GET", `/api/templates/${templateId}/file`);
    expect(r.status).toBe(403);
  });

  it("404 на несуществующий", async () => {
    const r = await api("GET", `/api/templates/none-such/file`);
    expect(r.status).toBe(404);
  });

  it("ученик с правильным токеном — 200 (связь через workspace→session→lesson→template)", async () => {
    const { teacher, email, password } = await createTeacher();
    const cookies = await loginAsTeacher(email, password);
    const pdf = await makePdfBytes(1);
    const up = await postPdf(cookies, pdf);
    const templateId = (up.body as { templateId: string }).templateId;

    const klass = await createClass(teacher.id, ["A."]);
    const lesson = await createLesson(teacher.id, {
      classId: klass.id,
    });
    // привязываем шаблон к уроку
    await db().lesson.update({
      where: { id: lesson.id },
      data: { templateId, templateKind: "pdf" },
    });

    const session = await createSession({
      teacherId: teacher.id,
      lessonId: lesson.id,
      classId: klass.id,
      studentIds: klass.students.map((s) => s.id),
    });
    void session;

    const student = klass.students[0]!;
    const r = await api("GET", `/api/templates/${templateId}/file`, {
      anonToken: student.anonToken,
    });
    expect(r.status).toBe(200);
  });

  it("ученик ЧУЖОЙ сессии — 403", async () => {
    const { teacher: t1, email, password } = await createTeacher();
    const cookies = await loginAsTeacher(email, password);
    const pdf = await makePdfBytes(1);
    const up = await postPdf(cookies, pdf);
    const templateId = (up.body as { templateId: string }).templateId;

    // другой учитель, его ученик ничего не должен видеть
    const { teacher: t2 } = await createTeacher();
    const otherKlass = await createClass(t2.id, ["B."]);
    const otherStudent = otherKlass.students[0]!;
    void t1;

    const r = await api("GET", `/api/templates/${templateId}/file`, {
      anonToken: otherStudent.anonToken,
    });
    expect(r.status).toBe(403);
  });

  it("?t=<token> в query тоже работает (для pdf.js fetch без headers)", async () => {
    const { teacher, email, password } = await createTeacher();
    const cookies = await loginAsTeacher(email, password);
    const pdf = await makePdfBytes(1);
    const up = await postPdf(cookies, pdf);
    const templateId = (up.body as { templateId: string }).templateId;

    const klass = await createClass(teacher.id, ["A."]);
    const lesson = await createLesson(teacher.id, { classId: klass.id });
    await db().lesson.update({
      where: { id: lesson.id },
      data: { templateId, templateKind: "pdf" },
    });
    await createSession({
      teacherId: teacher.id,
      lessonId: lesson.id,
      classId: klass.id,
      studentIds: klass.students.map((s) => s.id),
    });
    const student = klass.students[0]!;

    const r = await api(
      "GET",
      `/api/templates/${templateId}/file?t=${encodeURIComponent(student.anonToken)}`,
    );
    expect(r.status).toBe(200);
  });
});
