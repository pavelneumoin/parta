import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Ученик «сдаёт» работу: status=submitted, submittedAt=now.
 * После этого holder больше не пишет (клиент сам блокирует ввод).
 * Учитель может снять флаг через teacher endpoint (TODO).
 *
 * Auth: anon-токен ученика.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const ws = await db.workspace.findUnique({
    where: { id },
    include: {
      student: true,
      session: { select: { id: true, closedAt: true } },
    },
  });
  if (!ws) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (ws.session.closedAt) {
    return NextResponse.json({ error: "session_closed" }, { status: 410 });
  }

  const anonToken = req.headers.get("x-anon-token");
  if (!anonToken || anonToken !== ws.student.anonToken) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await db.workspace.update({
    where: { id: ws.id },
    data: {
      status: "submitted",
      submittedAt: new Date(),
      handRaisedAt: null, // если рука была поднята — снимаем
    },
  });
  await db.activityLog.create({
    data: {
      sessionId: ws.session.id,
      workspaceId: ws.id,
      actor: "student",
      kind: "submitted",
    },
  });

  return NextResponse.json({ ok: true });
}
