import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

const MAX_STATE_BYTES = 8_192;

const patchSchema = z
  .object({
    xFrac: z.number().min(0).max(1).optional(),
    yFrac: z.number().min(0).max(1).optional(),
    pageIndex: z.number().int().min(0).max(31).optional(),
    state: z
      .record(z.string(), z.unknown())
      .refine((s) => JSON.stringify(s).length <= MAX_STATE_BYTES, "state_too_big")
      .optional(),
  })
  .refine((p) => Object.keys(p).length > 0, "empty_patch");

/** Учитель-владелец сессии, которой принадлежит виджет. */
async function requireOwner(sessionId: string, wid: string) {
  const widget = await db.boardWidget.findUnique({
    where: { id: wid },
    include: { session: { select: { id: true, teacherId: true } } },
  });
  if (!widget || widget.session.id !== sessionId || widget.deletedAt) return { widget: null, ok: false };
  const authz = await auth();
  const ok = !!(authz?.user?.id && authz.user.id === widget.session.teacherId);
  return { widget, ok };
}

/** PATCH /api/sessions/[id]/widgets/[wid] — позиция/состояние (только учитель). */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; wid: string }> },
) {
  const { id, wid } = await ctx.params;
  const { widget, ok } = await requireOwner(id, wid);
  if (!widget) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid", issues: parsed.error.issues }, { status: 400 });
  }

  const updated = await db.boardWidget.update({
    where: { id: wid },
    data: {
      ...(parsed.data.xFrac !== undefined ? { xFrac: parsed.data.xFrac } : {}),
      ...(parsed.data.yFrac !== undefined ? { yFrac: parsed.data.yFrac } : {}),
      ...(parsed.data.pageIndex !== undefined ? { pageIndex: parsed.data.pageIndex } : {}),
      ...(parsed.data.state !== undefined ? { state: parsed.data.state as object } : {}),
    },
    select: {
      id: true, kind: true, pageIndex: true,
      xFrac: true, yFrac: true, state: true,
      workspaceId: true, updatedAt: true,
    },
  });
  return NextResponse.json({ ok: true, widget: updated });
}

/** DELETE /api/sessions/[id]/widgets/[wid] — мягкое удаление (только учитель). */
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; wid: string }> },
) {
  const { id, wid } = await ctx.params;
  const { widget, ok } = await requireOwner(id, wid);
  if (!widget) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  await db.boardWidget.update({ where: { id: wid }, data: { deletedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
