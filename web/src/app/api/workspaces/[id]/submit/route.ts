import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeWorkspaceRequest } from "@/lib/studentAccess";

export const dynamic = "force-dynamic";

/**
 * Ученик «сдаёт» работу: status=submitted, submittedAt=now.
 * После этого holder больше не пишет (клиент сам блокирует ввод).
 * Учитель может снять флаг через teacher endpoint (TODO).
 *
 * Доступ: ученик, который вошёл именно в этот workspace.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const ws = await db.workspace.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      submittedAt: true,
      studentAccessHash: true,
      studentAccessExpiresAt: true,
      session: { select: { id: true, closedAt: true, teacherId: true } },
    },
  });
  if (!ws) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const viewer = await authorizeWorkspaceRequest(req, ws);
  if (viewer?.role !== "student") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Повтор после потерянного HTTP-ответа должен подтверждать уже выполненную
  // сдачу, а не менять submittedAt и не создавать второй ActivityLog.
  if (ws.status === "submitted") {
    return NextResponse.json({
      ok: true,
      alreadySubmitted: true,
      submittedAt: ws.submittedAt?.toISOString() ?? null,
    });
  }
  if (ws.session.closedAt) {
    return NextResponse.json({ error: "session_closed" }, { status: 410 });
  }

  const submittedAt = new Date();
  const result = await db.$transaction(async (tx) => {
    const transition = await tx.workspace.updateMany({
      where: {
        id: ws.id,
        status: { not: "submitted" },
        session: { closedAt: null },
      },
      data: {
        status: "submitted",
        submittedAt,
        handRaisedAt: null,
      },
    });
    if (transition.count === 0) return false;

    await tx.activityLog.create({
      data: {
        sessionId: ws.session.id,
        workspaceId: ws.id,
        actor: "student",
        kind: "submitted",
      },
    });
    return true;
  });

  if (!result) {
    const current = await db.workspace.findUnique({
      where: { id: ws.id },
      select: {
        status: true,
        submittedAt: true,
        session: { select: { closedAt: true } },
      },
    });
    if (current?.status === "submitted") {
      return NextResponse.json({
        ok: true,
        alreadySubmitted: true,
        submittedAt: current.submittedAt?.toISOString() ?? null,
      });
    }
    if (current?.session.closedAt) {
      return NextResponse.json({ error: "session_closed" }, { status: 410 });
    }
    return NextResponse.json({ error: "submit_conflict" }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    alreadySubmitted: false,
    submittedAt: submittedAt.toISOString(),
  });
}
