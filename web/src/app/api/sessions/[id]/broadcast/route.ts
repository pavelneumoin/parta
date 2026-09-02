import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { createHash } from "node:crypto";
import { checkRateLimit } from "@/lib/rateLimit";
import { broadcastStrokesBatchSchema } from "@/lib/strokeSchemas";

export const dynamic = "force-dynamic";

/**
 * «Подсказка всему классу» — учитель пишет один штрих, мы дублируем его во
 * все workspace этой сессии как layer=teacher.
 *
 * Доступ: только учитель-владелец сессии.
 * Каждому ученику штрих приходит со своим детерминированным id по workspace.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const authz = await auth();
  const teacherId = authz?.user?.id;
  if (!teacherId) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Активное письмо flush'ится примерно 100 раз/мин. Оставляем запас на
  // сетевые повторы, но изолируем лимит учителем и конкретной сессией.
  if (!checkRateLimit(`broadcast:${teacherId}:${id}`, 180)) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": "2" } },
    );
  }
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 512_000) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  const body = await req.json().catch(() => null);
  const parsed = broadcastStrokesBatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  if (parsed.data.strokes.length === 0) {
    return NextResponse.json({ ok: true, accepted: 0 });
  }

  const outcome = await db.$transaction(async (tx) => {
    // Session state is read in the same transaction as fanout. This closes the
    // precheck/write window when a teacher ends the lesson.
    const session = await tx.session.findUnique({
      where: { id },
      include: {
        workspaces: { select: { id: true } },
      },
    });
    if (!session) return { kind: "not_found" as const };
    if (session.teacherId !== teacherId) return { kind: "forbidden" as const };
    if (session.closedAt) return { kind: "closed" as const };

    const planned: Array<{
      id: string;
      workspaceId: string;
      stroke: (typeof parsed.data.strokes)[number];
    }> = [];
    for (const s of parsed.data.strokes) {
      for (const ws of session.workspaces) {
        // Детерминированный id делает retry идемпотентным даже если сервер
        // успел commit'нуть fanout, а HTTP-ответ потерялся.
        const broadcastStrokeId = createHash("sha256")
          .update(`${id}:${s.id}:${ws.id}`)
          .digest("hex");
        planned.push({ id: broadcastStrokeId, workspaceId: ws.id, stroke: s });
      }
    }

    const existing = await tx.stroke.findMany({
      where: { id: { in: planned.map((item) => item.id) } },
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
    const plannedById = new Map(planned.map((item) => [item.id, item]));
    for (const saved of existing) {
      const item = plannedById.get(saved.id)!;
      const s = item.stroke;
      const samePayload =
        saved.workspaceId === item.workspaceId &&
        saved.pageIndex === s.pageIndex &&
        saved.layer === "teacher" &&
        saved.authorRole === "teacher" &&
        saved.color === s.color &&
        saved.size === s.size &&
        saved.simulatePressure === s.simulatePressure &&
        saved.coordinateSpace === s.coordinateSpace &&
        saved.brushKind === s.brushKind &&
        saved.renderVersion === s.renderVersion &&
        JSON.stringify(saved.points) === JSON.stringify(s.points);
      if (!samePayload) return { kind: "id_conflict" as const };
    }

    for (const item of planned) {
      const s = item.stroke;
      await tx.stroke.upsert({
          where: { id: item.id },
          create: {
            id: item.id,
            workspaceId: item.workspaceId,
            pageIndex: s.pageIndex,
            layer: "teacher",
            authorRole: "teacher",
            color: s.color,
            size: s.size,
            simulatePressure: s.simulatePressure,
            coordinateSpace: s.coordinateSpace,
            brushKind: s.brushKind,
            renderVersion: s.renderVersion,
            points: s.points,
          },
          update: {},
        });
    }
    return {
      kind: "ok" as const,
      fanout: session.workspaces.length,
      totalInserts: planned.length,
    };
  });

  if (outcome.kind === "not_found") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (outcome.kind === "forbidden") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (outcome.kind === "closed") {
    return NextResponse.json({ error: "session_closed" }, { status: 410 });
  }
  if (outcome.kind === "id_conflict") {
    return NextResponse.json({ error: "id_conflict" }, { status: 409 });
  }
  return NextResponse.json({
    ok: true,
    fanout: outcome.fanout,
    inserted: outcome.totalInserts,
  });
}
