import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Ученик переключает руку: вызвать POST → если handRaisedAt null, ставим now;
 * если уже стояло — снимаем (null). Альтернативно — клиент шлёт { raised: bool }
 * для явного toggle.
 *
 * Активити записывается в ActivityLog для последующей аналитики.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const explicit: boolean | undefined = typeof body?.raised === "boolean" ? body.raised : undefined;

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

  const next =
    explicit !== undefined
      ? explicit
        ? new Date()
        : null
      : ws.handRaisedAt
        ? null
        : new Date();

  await db.workspace.update({
    where: { id: ws.id },
    data: { handRaisedAt: next },
  });
  await db.activityLog.create({
    data: {
      sessionId: ws.session.id,
      workspaceId: ws.id,
      actor: "student",
      kind: next ? "hand_raised" : "hand_lowered",
    },
  });

  return NextResponse.json({ ok: true, handRaisedAt: next });
}
