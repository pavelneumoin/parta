import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { authorizeWorkspaceRequest } from "@/lib/studentAccess";
import { strokesBatchSchema } from "@/lib/strokeSchemas";

export const dynamic = "force-dynamic";

/**
 * Принимаем пачку новых штрихов от ученика или учителя.
 * Идемпотентно по `Stroke.id` (UUID с клиента). Дубль = no-op.
 *
 * Rate limit: 240 req/min per authenticated workspace + role + IP.
 * Общий NAT класса не объединяет лимиты разных учеников.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);

  // Высокий coarse-budget останавливает перебор случайных workspace до
  // обращения к БД, но оставляет запас классу за общим школьным NAT.
  if (!checkRateLimit(`strokes:coarse:${ip}`, 4_000)) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": "2" } },
    );
  }
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 2_000_000) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  const body = await req.json().catch(() => null);
  const parsed = strokesBatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const strokes = parsed.data.strokes;
  if (strokes.length === 0) return NextResponse.json({ ok: true, accepted: 0 });

  // все штрихи должны быть в один workspace в одном запросе
  const workspaceId = strokes[0]!.workspaceId;
  if (strokes.some((s) => s.workspaceId !== workspaceId)) {
    return NextResponse.json({ error: "mixed_workspace" }, { status: 400 });
  }

  const ws = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      id: true,
      status: true,
      studentAccessHash: true,
      studentAccessExpiresAt: true,
      session: {
        select: { closedAt: true, teacherId: true, freezeUntil: true },
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
  const isTeacher = viewer.role === "teacher";

  // Школьный класс почти всегда сидит за одним NAT. Лимит только по IP
  // объединял 20–30 планшетов и блокировал сохранение уже со второго ученика.
  // Workspace credential уже проверен, поэтому изолируем budget каждой работы.
  if (
    !checkRateLimit(
      `strokes:${workspaceId}:${viewer.role}:${ip}`,
      240,
    )
  ) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": "2" } },
    );
  }

  // заморозка класса — ученики read-only до freezeUntil; учитель пишет всегда
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

  const authorRole = isTeacher ? "teacher" : "student";
  const enforcedLayer = isTeacher ? "teacher" : "student";

  const writeResult = await db.$transaction(async (tx) => {
    const incomingById = new Map(strokes.map((stroke) => [stroke.id, stroke]));
    const existing = await tx.stroke.findMany({
      where: { id: { in: [...incomingById.keys()] } },
      select: {
        id: true,
        workspaceId: true,
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
      },
    });
    for (const saved of existing) {
      const incoming = incomingById.get(saved.id)!;
      const samePayload =
        saved.workspaceId === workspaceId &&
        saved.pageIndex === incoming.pageIndex &&
        saved.layer === enforcedLayer &&
        saved.authorRole === authorRole &&
        saved.color === incoming.color &&
        saved.size === incoming.size &&
        saved.simulatePressure === incoming.simulatePressure &&
        saved.coordinateSpace === incoming.coordinateSpace &&
        saved.brushKind === incoming.brushKind &&
        saved.renderVersion === incoming.renderVersion &&
        JSON.stringify(saved.points) === JSON.stringify(incoming.points);
      if (!samePayload) return "id_conflict" as const;
    }
    const allAlreadyStored = existing.length === strokes.length;

    const now = new Date();
    if (isStudent) {
      // Повторяем все блокировки внутри write-транзакции: submit/freeze/close
      // не должны проскочить между предварительной проверкой и insert.
      const guard = await tx.workspace.updateMany({
        where: {
          id: workspaceId,
          status: { not: "submitted" },
          session: {
            closedAt: null,
            OR: [
              { freezeUntil: null },
              { freezeUntil: { lte: now } },
            ],
          },
        },
        data: { lastActivityAt: now, status: "active" },
      });
      if (guard.count === 0) {
        return allAlreadyStored
          ? ("duplicate_blocked" as const)
          : ("blocked" as const);
      }
    } else {
      const guard = await tx.workspace.updateMany({
        where: { id: workspaceId, session: { closedAt: null } },
        data: { lastActivityAt: now },
      });
      if (guard.count === 0) return "blocked" as const;
    }

    for (const s of strokes) {
      await tx.stroke.upsert({
        where: { id: s.id },
        create: {
          id: s.id,
          workspaceId,
          pageIndex: s.pageIndex,
          layer: enforcedLayer,
          authorRole,
          color: s.color,
          size: s.size,
          simulatePressure: s.simulatePressure,
          coordinateSpace: s.coordinateSpace,
          brushKind: s.brushKind,
          renderVersion: s.renderVersion,
          points: s.points,
        },
        update: {}, // append-only: дубли игнорим
      });
    }
    return "ok" as const;
  });

  if (writeResult === "id_conflict") {
    return NextResponse.json({ error: "id_conflict" }, { status: 409 });
  }
  if (writeResult === "duplicate_blocked") {
    // Exact idempotent replay does not mutate a submitted workspace. It lets a
    // stale durable outbox clear safely after a lost ACK.
    return NextResponse.json({
      ok: true,
      accepted: strokes.length,
      replayed: true,
    });
  }
  if (writeResult === "blocked") {
    const current = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        status: true,
        session: { select: { closedAt: true, freezeUntil: true } },
      },
    });
    if (current?.session.closedAt) {
      return NextResponse.json({ error: "session_closed" }, { status: 410 });
    }
    if (isStudent && current?.status === "submitted") {
      return NextResponse.json(
        { error: "already_submitted" },
        { status: 409 },
      );
    }
    if (
      isStudent &&
      current?.session.freezeUntil &&
      current.session.freezeUntil.getTime() > Date.now()
    ) {
      return NextResponse.json(
        {
          error: "frozen",
          until: current.session.freezeUntil.toISOString(),
        },
        { status: 423 },
      );
    }
    return NextResponse.json({ error: "write_conflict" }, { status: 409 });
  }

  return NextResponse.json({ ok: true, accepted: strokes.length });
}
