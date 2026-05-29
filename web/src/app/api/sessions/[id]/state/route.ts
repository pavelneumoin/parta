import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Возвращает живое состояние сессии: статус всех workspaces, штрихов, последняя активность.
 * Превью пока возвращаем по флагу (его получаем отдельно — экономим трафик при polling).
 *
 * Доступ:
 * - учитель-владелец → всегда
 * - ученик (anon-токен в куке) → только его собственный workspace, но в этом endpoint мы
 *   возвращаем только агрегированное (имена соседей в классе известны, штрихов нет)
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const session = await db.session.findUnique({
    where: { id },
    include: {
      lesson: { select: { templateKind: true, pageCount: true } },
      workspaces: {
        include: {
          student: { select: { fullName: true } },
          _count: { select: { strokes: true } },
          previews: {
            select: { pageIndex: true, updatedAt: true },
            orderBy: { updatedAt: "desc" },
          },
        },
        orderBy: { student: { fullName: "asc" } },
      },
    },
  });
  if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const authz = await auth();
  const isOwner = authz?.user?.id === session.teacherId;
  // ученик идентифицируется через token cookie — пока даём только владельцу
  if (!isOwner) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    sessionId: session.id,
    closedAt: session.closedAt,
    freezeUntil: session.freezeUntil ? session.freezeUntil.toISOString() : null,
    templateKind: session.lesson.templateKind,
    pageCount: session.lesson.pageCount,
    workspaces: session.workspaces.map((w) => {
      // последняя обновлённая страница — то, что показываем в плитке
      const latest = w.previews[0];
      return {
        id: w.id,
        studentName: w.student.fullName,
        status: w.status,
        strokes: w._count.strokes,
        lastActivityAt: w.lastActivityAt,
        templateKind: session.lesson.templateKind,
        previewUpdatedAt: latest ? latest.updatedAt.toISOString() : null,
        previewPageIndex: latest ? latest.pageIndex : null,
        handRaisedAt: w.handRaisedAt ? w.handRaisedAt.toISOString() : null,
      };
    }),
  });
}
