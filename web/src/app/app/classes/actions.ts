"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTeacher } from "@/lib/session";
import { generateAnonToken } from "@/lib/codes";
import { parseStudentNames } from "@/lib/parseStudents";

const createSchema = z.object({
  name: z.string().min(1, "Введите название класса").max(40),
  grade: z.coerce.number().int().min(1).max(11).optional().nullable(),
  studentsRaw: z.string().min(1, "Добавьте хотя бы одного ученика"),
});

export type CreateClassState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Partial<Record<"name" | "grade" | "studentsRaw", string>>;
};

export async function createClassAction(
  _prev: CreateClassState,
  formData: FormData,
): Promise<CreateClassState> {
  const teacher = await requireTeacher();

  const raw = {
    name: String(formData.get("name") ?? "").trim(),
    grade: formData.get("grade") ? String(formData.get("grade")) : undefined,
    studentsRaw: String(formData.get("students") ?? ""),
  };

  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: CreateClassState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof NonNullable<CreateClassState["fieldErrors"]>;
      fieldErrors[key] = issue.message;
    }
    return { ok: false, fieldErrors };
  }

  const studentNames = parseStudentNames(parsed.data.studentsRaw);

  if (studentNames.length === 0) {
    return {
      ok: false,
      fieldErrors: { studentsRaw: "Хотя бы одно имя — обязательно" },
    };
  }

  const klass = await db.class.create({
    data: {
      teacherId: teacher.id,
      name: parsed.data.name,
      grade: parsed.data.grade ?? null,
      students: {
        create: studentNames.map((fullName) => ({
          fullName,
          anonToken: generateAnonToken(),
        })),
      },
    },
  });

  // ВАЖНО: redirect ДО revalidatePath.
  // Next.js 15 + Auth.js v5: revalidatePath перед redirect внутри Server Action
  // приводит к 303 с пустым Location (race с cookie stream), и клиент уходит на /.
  redirect(`/app/classes/${klass.id}`);
}

const addStudentsSchema = z.object({
  classId: z.string().cuid(),
  studentsRaw: z.string().min(1),
});

export async function addStudentsAction(formData: FormData) {
  const teacher = await requireTeacher();
  const parsed = addStudentsSchema.parse({
    classId: formData.get("classId"),
    studentsRaw: formData.get("students"),
  });

  // проверка владения классом + текущий список (для дедупликации)
  const klass = await db.class.findFirst({
    where: { id: parsed.classId, teacherId: teacher.id },
    include: { students: { select: { fullName: true } } },
  });
  if (!klass) throw new Error("Класс не найден");

  const existing = new Set(klass.students.map((s) => s.fullName.toLowerCase()));
  const names = parseStudentNames(parsed.studentsRaw).filter(
    (n) => !existing.has(n.toLowerCase()),
  );

  if (names.length === 0) return;

  await db.student.createMany({
    data: names.map((fullName) => ({
      classId: klass.id,
      fullName,
      anonToken: generateAnonToken(),
    })),
  });
  revalidatePath(`/app/classes/${klass.id}`);
}

export async function deleteStudentAction(formData: FormData) {
  const teacher = await requireTeacher();
  const studentId = String(formData.get("studentId") ?? "");
  const classId = String(formData.get("classId") ?? "");
  const student = await db.student.findFirst({
    where: { id: studentId, class: { teacherId: teacher.id } },
  });
  if (!student) return;
  await db.student.delete({ where: { id: studentId } });
  revalidatePath(`/app/classes/${classId}`);
}
