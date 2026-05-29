import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const schema = z.object({
  // длительность заморозки в секундах. 0 = сразу разморозить.
  seconds: z.number().int().min(0).max(600).default(30),
});

/**
 * Учитель «замораживает» класс: ученики пишут — read-only до freezeUntil.
 * Доступ: учитель-владелец сессии.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const authz = await auth();
  const teacherId = authz?.user?.id;
  if (!teacherId) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const session = await db.session.findUnique({ where: { id } });
  if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (session.teacherId !== teacherId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (session.closedAt) {
    return NextResponse.json({ error: "session_closed" }, { status: 410 });
  }

  const until =
    parsed.data.seconds === 0
      ? null
      : new Date(Date.now() + parsed.data.seconds * 1000);

  await db.session.update({
    where: { id },
    data: { freezeUntil: until },
  });
  await db.activityLog.create({
    data: {
      sessionId: id,
      actor: "teacher",
      kind: until ? "frozen" : "unfrozen",
      payload: until ? { until: until.toISOString() } : undefined,
    },
  });

  return NextResponse.json({ ok: true, freezeUntil: until?.toISOString() ?? null });
}
