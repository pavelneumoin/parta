import Link from "next/link";
import { requireTeacher } from "@/lib/session";
import { db } from "@/lib/db";
import { formatScheduled } from "@/lib/dates";

export default async function LessonsPage() {
  const teacher = await requireTeacher();
  const lessons = await db.lesson.findMany({
    where: { teacherId: teacher.id },
    include: {
      _count: { select: { sessions: true } },
      class: { select: { name: true } },
    },
    // запланированные на будущее — наверх; потом по updatedAt
    orderBy: [
      { scheduledFor: { sort: "asc", nulls: "last" } },
      { updatedAt: "desc" },
    ],
  });

  return (
    <main className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-end justify-between mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Уроки</h1>
        <Link
          href="/app/lessons/new"
          className="px-4 py-2.5 rounded-xl bg-ink text-paper font-medium hover:bg-toolbarHover transition"
        >
          + Новый урок
        </Link>
      </div>

      {lessons.length === 0 ? (
        <div className="rounded-xl border border-dashed border-rule p-12 text-center">
          <svg className="mx-auto mb-4 text-rule" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="4" y="3" width="16" height="18" rx="2" />
            <path d="M8 7h8M8 11h8M8 15h5" />
          </svg>
          <p className="font-medium mb-1">Уроков пока нет</p>
          <p className="text-dim text-sm mb-5">Загрузите PDF или выберите шаблон листа — урок будет готов за минуту.</p>
          <Link
            href="/app/lessons/new"
            className="inline-block px-4 py-2 rounded-lg bg-ink text-paper text-sm hover:bg-toolbarHover transition"
          >
            Создать первый урок
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-rule rounded-xl bg-paper border border-rule">
          {lessons.map((l) => (
            <li key={l.id}>
              <Link
                href={`/app/lessons/${l.id}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-chalk transition"
              >
                <div>
                  <div className="font-medium">{l.title}</div>
                  <div className="text-xs text-dim mt-0.5">
                    {l.scheduledFor && (
                      <span className="text-accent">
                        {formatScheduled(l.scheduledFor)}
                        {" · "}
                      </span>
                    )}
                    {l.class && <span>{l.class.name} · </span>}
                    {templateKindLabel(l.templateKind)} · {l.pageCount}{" "}
                    {l.pageCount === 1 ? "страница" : "страниц"}
                  </div>
                </div>
                <span className="text-xs text-dim">
                  {l._count.sessions} {l._count.sessions === 1 ? "сессия" : "сессий"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function templateKindLabel(k: string) {
  return (
    {
      pdf: "PDF",
      image: "Картинка",
      blank_grid: "Клетка",
      blank_coord: "Координаты",
      blank_lined: "Линии",
    } as Record<string, string>
  )[k] ?? k;
}
