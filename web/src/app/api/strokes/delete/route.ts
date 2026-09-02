import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authorizeWorkspaceRequest } from "@/lib/studentAccess";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const schema = z.object({
  workspaceId: z.string(),
  strokeIds: z.array(z.string().min(8).max(64)).min(1).max(200),
});

/**
 * Помечаем штрихи soft-удалёнными (deletedAt=now).
 * Удалять может:
 *  - ученик — только в своём workspace, только свои штрихи (layer=student);
 *  - учитель — в любом workspace своей сессии, любые штрихи.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  if (!checkRateLimit(`strokes-delete:coarse:${ip}`, 4_000)) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": "2" } },
    );
  }
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 128_000) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const ws = await db.workspace.findUnique({
    where: { id: parsed.data.workspaceId },
    select: {
      id: true,
      status: true,
      studentAccessHash: true,
      studentAccessExpiresAt: true,
      session: {
        select: { teacherId: true, closedAt: true, freezeUntil: true },
      },
    },
  });
  if (!ws) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (ws.session.closedAt) {
    return NextResponse.json({ error: "session_closed" }, { status: 410 });
  }

  const viewer = await authorizeWorkspaceRequest(req, ws);
  if (!viewer) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const isStudent = viewer.role === "student";

  if (
    !checkRateLimit(
      `strokes-delete:${ws.id}:${viewer.role}:${ip}`,
      240,
    )
  ) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": "2" } },
    );
  }

  if (isStudent && ws.status === "submitted") {
    const uniqueIds = [...new Set(parsed.data.strokeIds)];
    const alreadyDeleted = await db.stroke.count({
      where: {
        id: { in: uniqueIds },
        workspaceId: ws.id,
        authorRole: "student",
        deletedAt: { not: null },
      },
    });
    if (alreadyDeleted === uniqueIds.length) {
      return NextResponse.json({ ok: true, deleted: 0, replayed: true });
    }
    return NextResponse.json(
      { error: "already_submitted" },
      { status: 409 },
    );
  }
  if (
    isStudent &&
    ws.session.freezeUntil &&
    ws.session.freezeUntil.getTime() > Date.now()
  ) {
    return NextResponse.json(
      { error: "frozen", until: ws.session.freezeUntil.toISOString() },
      { status: 423 },
    );
  }

  const deletedAt = new Date();
  let deleted: number;
  if (isStudent) {
    const outcome = await db.$transaction(async (tx) => {
      // Lock/guard the workspace in the same transaction as the delete so a
      // concurrent submit or freeze cannot slip between validation and write.
      const guard = await tx.workspace.updateMany({
        where: {
          id: ws.id,
          status: { not: "submitted" },
          session: {
            closedAt: null,
            OR: [
              { freezeUntil: null },
              { freezeUntil: { lte: deletedAt } },
            ],
          },
        },
        data: { lastActivityAt: deletedAt },
      });
      if (guard.count === 0) return null;

      return tx.stroke.updateMany({
        where: {
          id: { in: parsed.data.strokeIds },
          workspaceId: ws.id,
          deletedAt: null,
          authorRole: "student",
        },
        data: { deletedAt },
      });
    });

    if (!outcome) {
      const current = await db.workspace.findUnique({
        where: { id: ws.id },
        select: {
          status: true,
          session: { select: { closedAt: true, freezeUntil: true } },
        },
      });
      if (current?.session.closedAt) {
        return NextResponse.json(
          { error: "session_closed" },
          { status: 410 },
        );
      }
      if (current?.status === "submitted") {
        return NextResponse.json(
          { error: "already_submitted" },
          { status: 409 },
        );
      }
      return NextResponse.json(
        {
          error: "frozen",
          until: current?.session.freezeUntil?.toISOString(),
        },
        { status: 423 },
      );
    }
    deleted = outcome.count;
  } else {
    const outcome = await db.$transaction(async (tx) => {
      const guard = await tx.workspace.updateMany({
        where: { id: ws.id, session: { closedAt: null } },
        data: { lastActivityAt: deletedAt },
      });
      if (guard.count === 0) return null;
      return tx.stroke.updateMany({
        where: {
          id: { in: parsed.data.strokeIds },
          workspaceId: ws.id,
          deletedAt: null,
        },
        data: { deletedAt },
      });
    });
    if (!outcome) {
      return NextResponse.json(
        { error: "session_closed" },
        { status: 410 },
      );
    }
    deleted = outcome.count;
  }

  return NextResponse.json({ ok: true, deleted });
}
