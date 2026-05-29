import { NextRequest, NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { db } from "@/lib/db";
import { requireTeacher } from "@/lib/session";
import { saveBuffer } from "@/lib/storage";

export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024; // 8 МБ
const MAX_PAGES = 10;
const ACCEPTED_MIMES = new Set(["application/pdf"]);

/**
 * Учитель загружает PDF-шаблон.
 * Возвращает templateId + pageCount — клиент потом submit'ит форму урока
 * с templateKind=pdf и этим templateId.
 *
 * Файл хранится в storage/templates/{templateId}.pdf
 */
export async function POST(req: NextRequest) {
  const teacher = await requireTeacher();

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "no_form" }, { status: 400 });

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }
  if (!ACCEPTED_MIMES.has(file.type)) {
    return NextResponse.json(
      { error: "wrong_type", got: file.type },
      { status: 415 },
    );
  }
  if (file.size === 0 || file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "size", got: file.size, max: MAX_BYTES },
      { status: 413 },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());

  // считаем страницы через pdf-lib (без растеризации)
  let pageCount: number;
  try {
    const doc = await PDFDocument.load(buf, { updateMetadata: false });
    pageCount = doc.getPageCount();
  } catch {
    return NextResponse.json({ error: "bad_pdf" }, { status: 400 });
  }
  if (pageCount < 1 || pageCount > MAX_PAGES) {
    return NextResponse.json(
      { error: "page_count", got: pageCount, max: MAX_PAGES },
      { status: 413 },
    );
  }

  // создаём TemplateFile сразу с временным s3Key, потом перезаписываем
  const template = await db.templateFile.create({
    data: {
      teacherId: teacher.id,
      s3Key: "", // заполним ниже
      pageKeys: [],
      mime: file.type,
      size: file.size,
    },
  });

  const saved = await saveBuffer("templates", template.id, "pdf", buf);
  await db.templateFile.update({
    where: { id: template.id },
    data: { s3Key: saved.key },
  });

  return NextResponse.json({
    templateId: template.id,
    pageCount,
    bytes: saved.bytes,
  });
}
