"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTeacher } from "@/lib/session";
import { generateJoinCode, generateQrToken } from "@/lib/codes";

const TEMPLATE_KINDS = ["blank_grid", "blank_coord", "blank_lined", "pdf"] as const;

const createLessonSchema = z
  .object({
    title: z.string().min(1, "Дайте название уроку").max(120),
    templateKind: z.enum(TEMPLATE_KINDS),
    pageCount: z.coerce.number().int().min(1).max(10).default(1),
    templateId: z.string().optional(),
    scheduledFor: z.string().optional(), // datetime-local строка
    classId: z.string().optional(),
  })
  .refine(
    (v) => v.templateKind !== "pdf" || !!v.templateId,
    { path: ["templateKind"], message: "Загрузите PDF перед созданием урока" },
  );

export type CreateLessonState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Partial<Record<"title" | "templateKind" | "pageCount", string>>;
};

export async function createLessonAction(
  _prev: CreateLessonState,
  formData: FormData,
): Promise<CreateLessonState> {
  const teacher = await requireTeacher();
  const parsed = createLessonSchema.safeParse({
    title: String(formData.get("title") ?? "").trim(),
    templateKind: formData.get("templateKind"),
    pageCount: formData.get("pageCount"),
    templateId: formData.get("templateId") || undefined,
    scheduledFor: formData.get("scheduledFor") || undefined,
    classId: formData.get("classId") || undefined,
  });
  if (!parsed.success) {
    const fieldErrors: CreateLessonState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof NonNullable<CreateLessonState["fieldErrors"]>;
      fieldErrors[key] = issue.message;
    }
    return { ok: false, fieldErrors };
  }

  // если PDF — проверяем, что шаблон принадлежит этому учителю
  let templateId: string | undefined;
  if (parsed.data.templateKind === "pdf" && parsed.data.templateId) {
    const tpl = await db.templateFile.findFirst({
      where: { id: parsed.data.templateId, teacherId: teacher.id },
    });
    if (!tpl) {
      return {
        ok: false,
        fieldErrors: { templateKind: "Загруженный PDF не найден — попробуйте загрузить заново" },
      };
    }
    templateId = tpl.id;
  }

  // парсим scheduledFor (HTML datetime-local → Date)
  let scheduledFor: Date | null = null;
  if (parsed.data.scheduledFor) {
    const d = new Date(parsed.data.scheduledFor);
    if (!isNaN(d.getTime())) scheduledFor = d;
  }

  // проверяем classId на собственность (если задан)
  let classId: string | null = null;
  if (parsed.data.classId) {
    const k = await db.class.findFirst({
      where: { id: parsed.data.classId, teacherId: teacher.id },
      select: { id: true },
    });
    if (k) classId = k.id;
  }

  const lesson = await db.lesson.create({
    data: {
      teacherId: teacher.id,
      title: parsed.data.title,
      templateKind: parsed.data.templateKind,
      pageCount: parsed.data.pageCount,
      templateId,
      scheduledFor,
      classId,
    },
  });

  revalidatePath("/app");
  revalidatePath("/app/lessons");
  redirect(`/app/lessons/${lesson.id}`);
}

const startSessionSchema = z.object({
  lessonId: z.string().cuid(),
  classId: z.string().cuid(),
  mode: z.enum(["live", "homework"]).default("live"),
});

/**
 * Создаём Session + Workspace[student] для всех учеников класса.
 * Возвращает id сессии для редиректа.
 */
export async function startSessionAction(formData: FormData) {
  const teacher = await requireTeacher();
  const parsed = startSessionSchema.parse({
    lessonId: formData.get("lessonId"),
    classId: formData.get("classId"),
    mode: formData.get("mode") || "live",
  });

  // проверка собственности
  const [lesson, klass] = await Promise.all([
    db.lesson.findFirst({
      where: { id: parsed.lessonId, teacherId: teacher.id },
    }),
    db.class.findFirst({
      where: { id: parsed.classId, teacherId: teacher.id },
      include: { students: true },
    }),
  ]);
  if (!lesson || !klass) throw new Error("Урок или класс не найден");
  if (klass.students.length === 0) throw new Error("В классе нет учеников");

  let joinCode = generateJoinCode();
  // уникальность
  for (let i = 0; i < 5; i++) {
    const exists = await db.session.findUnique({ where: { joinCode } });
    if (!exists) break;
    joinCode = generateJoinCode();
  }

  const session = await db.session.create({
    data: {
      lessonId: lesson.id,
      classId: klass.id,
      teacherId: teacher.id,
      mode: parsed.mode,
      joinCode,
      qrToken: generateQrToken(),
      workspaces: {
        create: klass.students.map((s) => ({
          studentId: s.id,
          status: "not_joined",
        })),
      },
      activity: {
        create: { actor: "teacher", kind: "session_started" },
      },
    },
  });

  revalidatePath("/app");
  redirect(`/app/session/${session.id}`);
}

export async function closeSessionAction(formData: FormData) {
  const teacher = await requireTeacher();
  const sessionId = String(formData.get("sessionId") ?? "");
  const session = await db.session.findFirst({
    where: { id: sessionId, teacherId: teacher.id },
  });
  if (!session) return;
  await db.session.update({
    where: { id: sessionId },
    data: {
      closedAt: new Date(),
      activity: { create: { actor: "teacher", kind: "closed" } },
    },
  });
  revalidatePath(`/app/session/${sessionId}`);
  revalidatePath("/app");
}
