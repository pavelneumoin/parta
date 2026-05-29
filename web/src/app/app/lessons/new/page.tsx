import Link from "next/link";
import { requireTeacher } from "@/lib/session";
import { db } from "@/lib/db";
import { NewLessonForm } from "./NewLessonForm";

export default async function NewLessonPage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string }>;
}) {
  const teacher = await requireTeacher();
  const { classId: defaultClassId } = await searchParams;

  const classes = await db.class.findMany({
    where: { teacherId: teacher.id },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <main className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-6">
        <Link href="/app/lessons" className="text-sm text-accent hover:underline">
          ← к урокам
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight mt-1">Новый урок</h1>
        <p className="text-dim mt-1">
          Используйте чистый шаблон или загрузите свой PDF (рабочий лист, страницу
          из учебника, контрольную).
        </p>
      </div>

      <NewLessonForm classes={classes} defaultClassId={defaultClassId} />
    </main>
  );
}
