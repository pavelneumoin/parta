import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

/**
 * Получить штрихи workspace.
 * `?since=<isoDate>` — только новые после этой даты (для incremental sync).
 * Возвращает массив штрихов в порядке createdAt asc.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const sinceParam = url.searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : null;

  const ws = await db.workspace.findUnique({
    where: { id },
    include: {
      student: true,
      session: { select: { teacherId: true, closedAt: true, freezeUntil: true } },
    },
  });
  if (!ws) return NextResponse.json({ error: "not_found" }, { status: 404 });

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

  const strokes = await db.stroke.findMany({
    where: {
      workspaceId: ws.id,
      deletedAt: null,
      ...(since ? { createdAt: { gt: since } } : {}),
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      pageIndex: true,
      layer: true,
      authorRole: true,
      color: true,
      size: true,
      simulatePressure: true,
      points: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    workspaceId: ws.id,
    closedAt: ws.session.closedAt,
    freezeUntil: ws.session.freezeUntil ? ws.session.freezeUntil.toISOString() : null,
    strokes,
    now: new Date().toISOString(),
  });
}
