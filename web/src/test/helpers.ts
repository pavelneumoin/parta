/**
 * Хелперы для integration-тестов.
 *
 * Запускаются ПРОТИВ работающего dev-сервера на :3030 (а не in-process,
 * чтобы тестировать реальные роуты + middleware + Auth.js).
 *
 * Используют ту же SQLite БД (prisma/dev.db), но изолируют данные через
 * уникальные email/имена с префиксом TEST_ + nanoid-ish суффикс.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

export const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3030";

let _db: PrismaClient | null = null;
export function db(): PrismaClient {
  if (!_db) _db = new PrismaClient();
  return _db;
}

export async function disconnect() {
  if (_db) {
    await _db.$disconnect();
    _db = null;
  }
}

let counter = 0;
export function uniq(): string {
  counter++;
  return `${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export const TEST_EMAIL_PREFIX = "test_";

/** Создаём учителя прямо в БД с известным паролем. */
export async function createTeacher(opts?: { name?: string; password?: string }) {
  const u = uniq();
  const email = `${TEST_EMAIL_PREFIX}${u}@test.local`;
  const password = opts?.password ?? "test-pass-12345";
  const passwordHash = await bcrypt.hash(password, 4); // low cost для скорости
  const teacher = await db().teacher.create({
    data: {
      email,
      name: opts?.name ?? `Test Teacher ${u}`,
      passwordHash,
    },
  });
  return { teacher, email, password };
}

export async function createClass(teacherId: string, names: string[] = ["Иванов И.", "Петров П."]) {
  const u = uniq();
  const klass = await db().class.create({
    data: {
      teacherId,
      name: `TEST-${u}`,
      grade: 7,
      students: {
        create: names.map((fullName) => ({
          fullName,
          anonToken: `tok_${uniq()}`,
        })),
      },
    },
    include: { students: true },
  });
  return klass;
}

export async function createLesson(
  teacherId: string,
  opts?: { title?: string; templateKind?: string; pageCount?: number; classId?: string | null },
) {
  return db().lesson.create({
    data: {
      teacherId,
      title: opts?.title ?? `Test Lesson ${uniq()}`,
      templateKind: opts?.templateKind ?? "blank_grid",
      pageCount: opts?.pageCount ?? 1,
      classId: opts?.classId ?? null,
    },
  });
}

export async function createSession(opts: {
  teacherId: string;
  lessonId: string;
  classId: string;
  studentIds: string[];
}) {
  const code = String(Math.floor(200000 + Math.random() * 800000));
  const session = await db().session.create({
    data: {
      teacherId: opts.teacherId,
      lessonId: opts.lessonId,
      classId: opts.classId,
      joinCode: code,
      qrToken: `qr_${uniq()}`,
      mode: "live",
      workspaces: {
        create: opts.studentIds.map((sid) => ({
          studentId: sid,
          status: "not_joined",
        })),
      },
    },
    include: { workspaces: true },
  });
  return session;
}

export async function closeSession(sessionId: string) {
  await db().session.update({
    where: { id: sessionId },
    data: { closedAt: new Date() },
  });
}

/**
 * Очистка всех TEST_ данных (вызывать в beforeAll + afterAll).
 *
 * В схеме не все relations имеют onDelete:Cascade — поэтому идём по зависимостям
 * сверху вниз: сначала листья (workspaces → cascade → strokes/previews),
 * потом обычные сущности, в конце teacher.
 */
export async function cleanupTestData() {
  const teachers = await db().teacher.findMany({
    where: { email: { startsWith: TEST_EMAIL_PREFIX } },
    select: { id: true },
  });
  if (teachers.length === 0) return { count: 0 };
  const teacherIds = teachers.map((t) => t.id);

  await db().activityLog.deleteMany({
    where: { session: { teacherId: { in: teacherIds } } },
  });
  await db().workspace.deleteMany({
    where: { session: { teacherId: { in: teacherIds } } },
  });
  await db().session.deleteMany({
    where: { teacherId: { in: teacherIds } },
  });
  await db().lesson.deleteMany({
    where: { teacherId: { in: teacherIds } },
  });
  await db().student.deleteMany({
    where: { class: { teacherId: { in: teacherIds } } },
  });
  await db().class.deleteMany({
    where: { teacherId: { in: teacherIds } },
  });
  await db().templateFile.deleteMany({
    where: { teacherId: { in: teacherIds } },
  });
  const result = await db().teacher.deleteMany({
    where: { id: { in: teacherIds } },
  });
  return result;
}

export type ApiResponse<T = unknown> = {
  status: number;
  ok: boolean;
  body: T;
  headers: Headers;
};

export async function api(
  method: string,
  path: string,
  opts?: {
    anonToken?: string;
    body?: unknown;
    raw?: BodyInit;
    headers?: Record<string, string>;
    cookies?: string;
  },
): Promise<ApiResponse> {
  const headers: Record<string, string> = { ...(opts?.headers ?? {}) };
  if (opts?.anonToken) headers["x-anon-token"] = opts.anonToken;
  if (opts?.cookies) headers["cookie"] = opts.cookies;

  let body: BodyInit | undefined;
  if (opts?.raw !== undefined) {
    body = opts.raw;
  } else if (opts?.body !== undefined) {
    headers["content-type"] = headers["content-type"] ?? "application/json";
    body = JSON.stringify(opts.body);
  }

  const r = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body,
    redirect: "manual",
  });

  let parsed: unknown;
  const ct = r.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    try {
      parsed = await r.json();
    } catch {
      parsed = null;
    }
  } else if (ct.startsWith("image/") || ct.includes("octet-stream") || ct.includes("pdf")) {
    parsed = await r.arrayBuffer();
  } else {
    parsed = await r.text();
  }

  return {
    status: r.status,
    ok: r.ok,
    body: parsed,
    headers: r.headers,
  };
}

/**
 * Логинимся через Auth.js v5 credentials provider и собираем cookie-jar.
 * Возвращает строку для заголовка Cookie.
 */
export async function loginAsTeacher(email: string, password: string): Promise<string> {
  // 1. CSRF token
  const csrfResp = await fetch(`${BASE_URL}/api/auth/csrf`);
  const setCookieCsrf = csrfResp.headers.getSetCookie();
  const { csrfToken } = (await csrfResp.json()) as { csrfToken: string };

  const csrfCookie = setCookieCsrf
    .map((s) => s.split(";")[0]!)
    .join("; ");

  // 2. POST credentials callback
  const params = new URLSearchParams({
    email,
    password,
    csrfToken,
    callbackUrl: `${BASE_URL}/app`,
    json: "true",
  });

  const loginResp = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: csrfCookie,
    },
    body: params.toString(),
    redirect: "manual",
  });

  const setCookieAuth = loginResp.headers.getSetCookie();
  if (setCookieAuth.length === 0) {
    throw new Error(`Login failed: no Set-Cookie (status ${loginResp.status})`);
  }

  // объединяем csrf + auth cookies
  const all = [...setCookieCsrf, ...setCookieAuth]
    .map((s) => s.split(";")[0]!)
    .join("; ");

  return all;
}

/** Готовая стандартная фикстура: учитель + класс из 3 учеников + урок + сессия. */
export async function setupBasicFixture() {
  const { teacher } = await createTeacher();
  const klass = await createClass(teacher.id, ["Иванов И.", "Петров П.", "Сидорова А."]);
  const lesson = await createLesson(teacher.id, { classId: klass.id });
  const session = await createSession({
    teacherId: teacher.id,
    lessonId: lesson.id,
    classId: klass.id,
    studentIds: klass.students.map((s) => s.id),
  });

  return {
    teacher,
    klass,
    lesson,
    session,
    students: klass.students,
    workspaces: session.workspaces,
  };
}
