import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeWorkspaceRequest } from "@/lib/studentAccess";

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
  const cursor = new Date();

  const ws = await db.workspace.findUnique({
    where: { id },
    select: {
      id: true,
      studentAccessHash: true,
      studentAccessExpiresAt: true,
      session: { select: { teacherId: true, closedAt: true, freezeUntil: true } },
    },
  });
  if (!ws) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const viewer = await authorizeWorkspaceRequest(req, ws);
  if (!viewer) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const isTeacher = viewer.role === "teacher";

  // includeDeleted=1 — для replay-режима учителя: видеть процесс исправлений.
  // Доступно только учителю (ученик не должен видеть свои стёртые штрихи).
  const includeDeleted = isTeacher && url.searchParams.get("includeDeleted") === "1";

  const strokes = await db.stroke.findMany({
    where: {
      workspaceId: ws.id,
      ...(includeDeleted ? {} : { deletedAt: null }),
      ...(since
        ? { createdAt: { gt: since, lte: cursor } }
        : { createdAt: { lte: cursor } }),
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
      coordinateSpace: true,
      brushKind: true,
      renderVersion: true,
      points: true,
      createdAt: true,
      deletedAt: true,
    },
  });

  // Incremental polling раньше видел только новые create и не узнавал о
  // soft-delete. Из-за этого стёртая подсказка учителя оставалась у ученика
  // до полной перезагрузки. Верхняя граница cursor закрывает race между
  // запросом и следующей итерацией polling.
  const deletedStrokeIds = since
    ? (
        await db.stroke.findMany({
          where: {
            workspaceId: ws.id,
            deletedAt: { gt: since, lte: cursor },
          },
          select: { id: true },
        })
      ).map((stroke) => stroke.id)
    : [];

  return NextResponse.json({
    workspaceId: ws.id,
    closedAt: ws.session.closedAt,
    freezeUntil: ws.session.freezeUntil ? ws.session.freezeUntil.toISOString() : null,
    strokes,
    deletedStrokeIds,
    now: cursor.toISOString(),
  });
}
