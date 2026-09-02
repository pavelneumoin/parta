import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Сбрасывает привязку ученического устройства к workspace.
 * Доступно только учителю-владельцу сессии; сама работа и её статус сохраняются.
 */
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const authz = await auth();
  const teacherId = authz?.user?.id;
  if (!teacherId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const workspace = await db.workspace.findUnique({
    where: { id },
    select: {
      id: true,
      session: { select: { teacherId: true } },
    },
  });
  if (!workspace) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (workspace.session.teacherId !== teacherId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await db.workspace.update({
    where: { id: workspace.id },
    data: {
      studentAccessHash: null,
      studentAccessExpiresAt: null,
      claimedAt: null,
    },
  });

  return NextResponse.json({ ok: true });
}
