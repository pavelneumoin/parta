import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { randomUUID } from "node:crypto";
import { checkRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const pointSchema = z.tuple([z.number(), z.number(), z.number()]);

const strokeSchema = z.object({
  pageIndex: z.number().int().min(0).max(31).default(0),
  color: z.string().regex(/^#[0-9a-fA-F]{3,8}$/),
  size: z.number().positive().max(40),
  simulatePressure: z.boolean().default(false),
  points: z.array(pointSchema).min(2).max(4000),
});

const schema = z.object({
  strokes: z.array(strokeSchema).max(20),
});

/**
 * «Подсказка всему классу» — учитель пишет один штрих, мы дублируем его во
 * все workspace этой сессии как layer=teacher.
 *
 * Доступ: только учитель-владелец сессии.
 * Каждому ученику штрих приходит с УНИКАЛЬНЫМ id (свой по workspace).
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const authz = await auth();
  const teacherId = authz?.user?.id;
  if (!teacherId) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Rate-limit: 60 broadcast-батчей в минуту на учителя (≈1/с)
  if (!checkRateLimit(`broadcast:${teacherId}`, 60)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  if (parsed.data.strokes.length === 0) {
    return NextResponse.json({ ok: true, accepted: 0 });
  }

  const session = await db.session.findUnique({
    where: { id },
    include: {
      workspaces: { select: { id: true } },
    },
  });
  if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (session.teacherId !== teacherId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (session.closedAt) {
    return NextResponse.json({ error: "session_closed" }, { status: 410 });
  }
  if (session.workspaces.length === 0) {
    return NextResponse.json({ ok: true, accepted: 0, fanout: 0 });
  }

  let totalInserts = 0;
  await db.$transaction(async (tx) => {
    for (const s of parsed.data.strokes) {
      for (const ws of session.workspaces) {
        await tx.stroke.create({
          data: {
            id: randomUUID(),
            workspaceId: ws.id,
            pageIndex: s.pageIndex,
            layer: "teacher",
            authorRole: "teacher",
            color: s.color,
            size: s.size,
            simulatePressure: s.simulatePressure,
            points: s.points,
          },
        });
        totalInserts++;
      }
    }
  });

  return NextResponse.json({
    ok: true,
    fanout: session.workspaces.length,
    inserted: totalInserts,
  });
}
