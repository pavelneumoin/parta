import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { INSTRUMENT_KINDS, instrumentMeta } from "@/lib/board/registry";

export const dynamic = "force-dynamic";

const MAX_STATE_BYTES = 8_192;
const MAX_WIDGETS_PER_SESSION = 60;

const stateSchema = z
  .record(z.string(), z.unknown())
  .refine((s) => JSON.stringify(s).length <= MAX_STATE_BYTES, "state_too_big");

const postSchema = z.object({
  kind: z.string().refine((k) => INSTRUMENT_KINDS.includes(k), "unknown_kind"),
  pageIndex: z.number().int().min(0).max(31).default(0),
  xFrac: z.number().min(0).max(1).default(0.3),
  yFrac: z.number().min(0).max(1).default(0.15),
  workspaceId: z.string().cuid().nullish(),
  state: stateSchema.optional(),
});

/** Кто смотрит сессию: учитель-владелец или ученик этой сессии (по anon-токену). */
async function resolveViewer(req: NextRequest, sessionId: string) {
  const session = await db.session.findUnique({
    where: { id: sessionId },
    select: { id: true, teacherId: true, closedAt: true },
  });
  if (!session) return { session: null, teacher: false, workspaceId: null as string | null };

  const anonToken = req.headers.get("x-anon-token");
  if (anonToken) {
    const ws = await db.workspace.findFirst({
      where: { sessionId, student: { anonToken } },
      select: { id: true },
    });
    if (ws) return { session, teacher: false, workspaceId: ws.id };
  }
  const authz = await auth();
  const teacher = !!(authz?.user?.id && authz.user.id === session.teacherId);
  return { session, teacher, workspaceId: null as string | null };
}

/**
 * GET /api/sessions/[id]/widgets — активные виджеты сессии.
 * Учитель видит все; ученик — общие (workspaceId=null) + адресованные ему.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const viewer = await resolveViewer(req, id);
  if (!viewer.session) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!viewer.teacher && !viewer.workspaceId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const widgets = await db.boardWidget.findMany({
    where: {
      sessionId: id,
      deletedAt: null,
      ...(viewer.teacher
        ? {}
        : { OR: [{ workspaceId: null }, { workspaceId: viewer.workspaceId }] }),
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, kind: true, pageIndex: true,
      xFrac: true, yFrac: true, state: true,
      workspaceId: true, updatedAt: true,
    },
  });
  return NextResponse.json({ widgets });
}

/**
 * POST /api/sessions/[id]/widgets — учитель добавляет инструмент на доску.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const viewer = await resolveViewer(req, id);
  if (!viewer.session) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!viewer.teacher) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (viewer.session.closedAt) {
    return NextResponse.json({ error: "session_closed" }, { status: 409 });
  }

  const body = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid", issues: parsed.error.issues }, { status: 400 });
  }

  const active = await db.boardWidget.count({ where: { sessionId: id, deletedAt: null } });
  if (active >= MAX_WIDGETS_PER_SESSION) {
    return NextResponse.json({ error: "too_many_widgets" }, { status: 409 });
  }

  // workspaceId (адресный виджет) должен принадлежать этой сессии
  if (parsed.data.workspaceId) {
    const ws = await db.workspace.findFirst({
      where: { id: parsed.data.workspaceId, sessionId: id },
      select: { id: true },
    });
    if (!ws) return NextResponse.json({ error: "workspace_not_in_session" }, { status: 400 });
  }

  const meta = instrumentMeta(parsed.data.kind)!;
  const widget = await db.boardWidget.create({
    data: {
      sessionId: id,
      kind: parsed.data.kind,
      pageIndex: parsed.data.pageIndex,
      xFrac: parsed.data.xFrac,
      yFrac: parsed.data.yFrac,
      workspaceId: parsed.data.workspaceId ?? null,
      state: (parsed.data.state ?? meta.defaultState) as object,
    },
    select: {
      id: true, kind: true, pageIndex: true,
      xFrac: true, yFrac: true, state: true,
      workspaceId: true, updatedAt: true,
    },
  });
  return NextResponse.json({ ok: true, widget }, { status: 201 });
}
