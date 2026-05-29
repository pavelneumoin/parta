import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { readBuffer } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Отдаём PDF-файл шаблона.
 * Доступ:
 *  - учитель-владелец TemplateFile;
 *  - ученик с anon-токеном, который привязан к workspace с lesson.templateId = id
 *    (то есть его собственная сессия использует именно этот шаблон).
 *
 * Заголовки: application/pdf + длинный cache (шаблон неизменяем).
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const template = await db.templateFile.findUnique({
    where: { id },
    select: { id: true, teacherId: true, mime: true, s3Key: true },
  });
  if (!template) return new NextResponse("not_found", { status: 404 });

  // ↓ авторизация
  let allowed = false;
  const authz = await auth();
  if (authz?.user?.id && authz.user.id === template.teacherId) {
    allowed = true;
  } else {
    const anonToken = req.headers.get("x-anon-token") ?? req.nextUrl.searchParams.get("t");
    if (anonToken) {
      const ws = await db.workspace.findFirst({
        where: {
          student: { anonToken },
          session: { lesson: { templateId: id } },
        },
        select: { id: true },
      });
      if (ws) allowed = true;
    }
  }
  if (!allowed) return new NextResponse("forbidden", { status: 403 });

  let buf: Buffer;
  try {
    buf = await readBuffer(template.s3Key);
  } catch {
    return new NextResponse("not_found", { status: 404 });
  }

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "content-type": template.mime || "application/pdf",
      // шаблон неизменяем — кэшируем агрессивно
      "cache-control": "private, max-age=3600, immutable",
    },
  });
}
