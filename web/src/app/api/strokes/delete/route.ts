import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/auth";

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
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const ws = await db.workspace.findUnique({
    where: { id: parsed.data.workspaceId },
    include: {
      student: true,
      session: { select: { teacherId: true, closedAt: true } },
    },
  });
  if (!ws) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (ws.session.closedAt) {
    return NextResponse.json({ error: "session_closed" }, { status: 410 });
  }

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

  // ограничиваем: ученик удаляет только свои штрихи (не учительские)
  const result = await db.stroke.updateMany({
    where: {
      id: { in: parsed.data.strokeIds },
      workspaceId: ws.id,
      deletedAt: null,
      ...(isStudent ? { authorRole: "student" } : {}),
    },
    data: { deletedAt: new Date() },
  });

  return NextResponse.json({ ok: true, deleted: result.count });
}
