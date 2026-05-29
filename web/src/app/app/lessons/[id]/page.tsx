import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeacher } from "@/lib/session";
import { db } from "@/lib/db";
import { startSessionAction } from "../actions";

export default async function LessonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const teacher = await requireTeacher();

  const lesson = await db.lesson.findFirst({
    where: { id, teacherId: teacher.id },
    include: {
      sessions: {
        include: { class: true, _count: { select: { workspaces: true } } },
        orderBy: { startedAt: "desc" },
        take: 8,
      },
    },
  });
  if (!lesson) notFound();

  const classes = await db.class.findMany({
    where: { teacherId: teacher.id },
    include: { _count: { select: { students: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <main className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-6">
        <Link href="/app/lessons" className="text-sm text-accent hover:underline">
          ← к урокам
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight mt-1">
          {lesson.title}
        </h1>
        <p className="text-dim mt-1">
          {templateLabel(lesson.templateKind)} · {lesson.pageCount} стр.
        </p>
      </div>

      <section className="mb-8 rounded-xl border border-rule bg-paper p-6">
        <h2 className="text-lg font-semibold mb-3">Начать урок</h2>
        {classes.length === 0 ? (
          <p className="text-dim">
            Сначала нужно <Link href="/app/classes/new" className="text-accent hover:underline">завести класс</Link>.
          </p>
        ) : (
          <form action={startSessionAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="lessonId" value={lesson.id} />
            <label className="flex flex-col gap-1.5 min-w-[200px]">
              <span className="text-sm text-ink/80">Класс</span>
              <select
                name="classId"
                required
                className="px-3 py-2.5 rounded-lg border border-rule bg-paper outline-none focus:border-accent transition"
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c._count.students})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-ink/80">Режим</span>
              <select
                name="mode"
                defaultValue="live"
                className="px-3 py-2.5 rounded-lg border border-rule bg-paper outline-none focus:border-accent transition"
              >
                <option value="live">Урок сейчас</option>
                <option value="homework">Домашнее задание</option>
              </select>
            </label>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-ink text-paper font-medium hover:bg-toolbarHover transition"
            >
              ▶ Начать
            </button>
          </form>
        )}
      </section>

      {lesson.sessions.length === 0 && (
        <section className="mb-8 rounded-xl border border-dashed border-rule p-8 text-center text-dim text-sm">
          Ни одной сессии пока не было. Начните урок — и здесь появится история с результатами.
        </section>
      )}

      {lesson.sessions.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Прошлые сессии</h2>
          <ul className="divide-y divide-rule rounded-xl bg-paper border border-rule">
            {lesson.sessions.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/app/session/${s.id}`}
                  className="flex items-center justify-between px-5 py-3 hover:bg-chalk transition"
                >
                  <div>
                    <div className="font-medium">{s.class.name}</div>
                    <div className="text-xs text-dim mt-0.5">
                      {fmt(s.startedAt)} ·{" "}
                      {s.closedAt ? "закрыт" : "идёт"} · код {s.joinCode}
                    </div>
                  </div>
                  <span className="text-xs text-dim">{s._count.workspaces} раб. листов</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function templateLabel(k: string) {
  return (
    {
      pdf: "PDF-шаблон",
      image: "Картинка",
      blank_grid: "Клетка",
      blank_coord: "Координатная плоскость",
      blank_lined: "Линованный лист",
    } as Record<string, string>
  )[k] ?? k;
}

function fmt(d: Date) {
  return new Date(d).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
