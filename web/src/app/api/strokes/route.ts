import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const pointSchema = z.tuple([z.number(), z.number(), z.number()]);

const strokeSchema = z.object({
  id: z.string().min(8).max(64),
  workspaceId: z.string(),
  pageIndex: z.number().int().min(0).max(31).default(0),
  layer: z.enum(["student", "teacher"]).default("student"),
  color: z.string().regex(/^#[0-9a-fA-F]{3,8}$/),
  size: z.number().positive().max(40),
  simulatePressure: z.boolean().default(false),
  points: z.array(pointSchema).min(2).max(4000),
});

const batchSchema = z.object({
  strokes: z.array(strokeSchema).max(80),
});

/**
 * Принимаем пачку новых штрихов от ученика или учителя.
 * Идемпотентно по `Stroke.id` (UUID с клиента). Дубль = no-op.
 *
 * Rate limit: 120 req/min per IP (≈2 flush/s — соответствует FLUSH_MS=600ms).
 */
export async function POST(req: NextRequest) {
  // Rate-limit: 120 батчей в минуту на IP (2/с при FLUSH_MS=600мс)
  const ip = getClientIp(req.headers);
  if (!checkRateLimit(`strokes:${ip}`, 120)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = batchSchema.safeParse(body);
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
    include: {
      student: true,
      session: { select: { closedAt: true, teacherId: true } },
    },
  });
  if (!ws) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (ws.session.closedAt) {
    return NextResponse.json({ error: "session_closed" }, { status: 410 });
  }

  // авторизация: ученик через anon-токен, учитель — через session
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

  const authorRole = isTeacher ? "teacher" : "student";
  const enforcedLayer = isTeacher ? "teacher" : "student";

  await db.$transaction(async (tx) => {
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
          points: s.points,
        },
        update: {}, // append-only: дубли игнорим
      });
    }
    await tx.workspace.update({
      where: { id: workspaceId },
      data: {
        lastActivityAt: new Date(),
        status: isStudent ? "active" : undefined,
      },
    });
  });

  return NextResponse.json({ ok: true, accepted: strokes.length });
}
