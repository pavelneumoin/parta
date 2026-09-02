import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authorizeWorkspaceRequest } from "@/lib/studentAccess";

export const dynamic = "force-dynamic";

// ограничение: PNG не больше 80 КБ (200×280 при типичной нагрузке < 20 КБ; запас)
const MAX_BYTES = 80_000;

const postSchema = z.object({
  pageIndex: z.number().int().min(0).max(31).default(0),
  // base64 без префикса data:image/png;base64,
  pngBase64: z.string().min(64).max(MAX_BYTES * 2),
});

/**
 * Принимаем PNG-превью текущего состояния ученического холста.
 * Снимки шлёт сам клиент раз в 3-5 сек (когда были изменения).
 *
 * Доступ: ученик, который вошёл именно в этот workspace.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const ws = await db.workspace.findUnique({
    where: { id },
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
  if (viewer?.role !== "student") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (ws.status === "submitted") {
    return NextResponse.json(
      { error: "already_submitted" },
      { status: 409 },
    );
  }
  if (
    ws.session.freezeUntil &&
    ws.session.freezeUntil.getTime() > Date.now()
  ) {
    return NextResponse.json(
      { error: "frozen", until: ws.session.freezeUntil.toISOString() },
      { status: 423 },
    );
  }

  const bytes = Buffer.from(parsed.data.pngBase64, "base64");
  if (bytes.length === 0 || bytes.length > MAX_BYTES) {
    return NextResponse.json(
      { error: "size", got: bytes.length, max: MAX_BYTES },
      { status: 413 },
    );
  }

  await db.workspacePreview.upsert({
    where: {
      workspaceId_pageIndex: {
        workspaceId: ws.id,
        pageIndex: parsed.data.pageIndex,
      },
    },
    create: {
      workspaceId: ws.id,
      pageIndex: parsed.data.pageIndex,
      pngBytes: bytes,
    },
    update: { pngBytes: bytes },
  });

  return NextResponse.json({ ok: true, bytes: bytes.length });
}

/**
 * Отдаём PNG-превью для мозаики или предпросмотра.
 * Доступ: учитель-владелец сессии ИЛИ ученик с своим токеном.
 * Кэш-busting через ?v=timestamp клиент.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const pageIndex = Number(url.searchParams.get("page") ?? "0") || 0;

  const ws = await db.workspace.findUnique({
    where: { id },
    select: {
      id: true,
      studentAccessHash: true,
      studentAccessExpiresAt: true,
      session: { select: { teacherId: true } },
    },
  });
  if (!ws) return new NextResponse("not_found", { status: 404 });

  const viewer = await authorizeWorkspaceRequest(req, ws);
  if (!viewer) {
    return new NextResponse("forbidden", { status: 403 });
  }

  const preview = await db.workspacePreview.findUnique({
    where: {
      workspaceId_pageIndex: { workspaceId: ws.id, pageIndex },
    },
  });
  if (!preview) return new NextResponse("not_found", { status: 404 });

  return new NextResponse(new Uint8Array(preview.pngBytes), {
    status: 200,
    headers: {
      "content-type": "image/png",
      "cache-control": "private, max-age=2, must-revalidate",
      "x-updated-at": preview.updatedAt.toISOString(),
    },
  });
}
