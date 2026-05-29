import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

const postSchema = z.object({
  text: z.string().min(1).max(500).trim(),
  pageIndex: z.number().int().min(0).max(31).default(0),
});

/**
 * POST /api/workspaces/[id]/comments
 *
 * Учитель добавляет текстовый комментарий к рабочему листу.
 * Иммутабельно: нет редактирования, нет удаления — только append.
 * Auth: учитель-владелец сессии этого workspace.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const authz = await auth();
  const teacherId = authz?.user?.id;
  if (!teacherId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const ws = await db.workspace.findUnique({
    where: { id },
    include: { session: { select: { teacherId: true, closedAt: true } } },
  });
  if (!ws) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (ws.session.teacherId !== teacherId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const comment = await db.comment.create({
    data: {
      workspaceId: id,
      teacherId,
      text: parsed.data.text,
      pageIndex: parsed.data.pageIndex,
    },
  });

  return NextResponse.json({ ok: true, comment }, { status: 201 });
}

/**
 * GET /api/workspaces/[id]/comments
 *
 * Возвращает все комментарии к workspace.
 * Auth: учитель-владелец ИЛИ ученик с anon-токеном.
 * Query: ?page=0 — фильтрует по номеру страницы (опционально).
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const pageFilter = url.searchParams.has("page")
    ? Number(url.searchParams.get("page") ?? "0")
    : undefined;

  const ws = await db.workspace.findUnique({
    where: { id },
    include: {
      student: { select: { anonToken: true } },
      session: { select: { teacherId: true } },
    },
  });
  if (!ws) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Авторизация: ученик или учитель
  const anonToken = req.headers.get("x-anon-token");
  const isStudent = anonToken && anonToken === ws.student.anonToken;
  let isTeacher = false;
  if (!isStudent) {
    const authz = await auth();
    isTeacher = !!(authz?.user?.id && authz.user.id === ws.session.teacherId);
  }
  if (!isStudent && !isTeacher) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const comments = await db.comment.findMany({
    where: {
      workspaceId: id,
      ...(pageFilter !== undefined ? { pageIndex: pageFilter } : {}),
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      text: true,
      pageIndex: true,
      createdAt: true,
      // учителю показываем кто именно написал, ученику скрываем
      ...(isTeacher ? { teacher: { select: { name: true } } } : {}),
    },
  });

  return NextResponse.json({ comments });
}
