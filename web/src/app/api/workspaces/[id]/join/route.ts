import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Помечаем, что ученик открыл рабочий лист.
 * Проверка: anon-токен в заголовке должен совпадать с токеном ученика этого workspace.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const token = req.headers.get("x-anon-token");
  if (!token) return NextResponse.json({ error: "no_token" }, { status: 401 });

  const ws = await db.workspace.findUnique({
    where: { id },
    include: { student: true, session: { select: { closedAt: true, id: true } } },
  });
  if (!ws) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (ws.student.anonToken !== token)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (ws.session.closedAt)
    return NextResponse.json({ error: "session_closed" }, { status: 410 });

  await db.workspace.update({
    where: { id: ws.id },
    data: {
      status: "active",
      joinedAt: ws.joinedAt ?? new Date(),
      lastActivityAt: new Date(),
    },
  });
  await db.activityLog.create({
    data: {
      sessionId: ws.session.id,
      workspaceId: ws.id,
      actor: "student",
      kind: "joined",
    },
  });

  return NextResponse.json({ ok: true });
}
