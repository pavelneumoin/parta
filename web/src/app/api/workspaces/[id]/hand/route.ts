import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeWorkspaceRequest } from "@/lib/studentAccess";

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
    select: {
      id: true,
      status: true,
      handRaisedAt: true,
      studentAccessHash: true,
      studentAccessExpiresAt: true,
      session: { select: { id: true, closedAt: true, teacherId: true } },
    },
  });
  if (!ws) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (ws.session.closedAt) {
    return NextResponse.json({ error: "session_closed" }, { status: 410 });
  }

  const viewer = await authorizeWorkspaceRequest(req, ws);
  if (viewer?.role !== "student") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (ws.status === "submitted") {
    return NextResponse.json(
      { error: "already_submitted" },
      { status: 409 },
    );
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
