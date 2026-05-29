import Link from "next/link";
import { requireTeacher } from "@/lib/session";
import { db } from "@/lib/db";

export default async function ClassesPage() {
  const teacher = await requireTeacher();
  const classes = await db.class.findMany({
    where: { teacherId: teacher.id },
    include: { _count: { select: { students: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-end justify-between mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Классы</h1>
        <Link
          href="/app/classes/new"
          className="px-4 py-2.5 rounded-xl bg-ink text-paper font-medium hover:bg-toolbarHover transition"
        >
          + Завести класс
        </Link>
      </div>

      {classes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-rule p-12 text-center">
          <svg className="mx-auto mb-4 text-rule" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="9" cy="7" r="3" />
            <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            <path d="M21 21v-2a4 4 0 0 0-3-3.85" />
          </svg>
          <p className="font-medium mb-1">Классов пока нет</p>
          <p className="text-dim text-sm mb-5">Заведите класс, добавьте учеников — и можно начинать первый цифровой урок.</p>
          <Link
            href="/app/classes/new"
            className="inline-block px-4 py-2 rounded-lg bg-ink text-paper text-sm hover:bg-toolbarHover transition"
          >
            Завести первый класс
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-rule rounded-xl bg-paper border border-rule">
          {classes.map((c) => (
            <li key={c.id}>
              <Link
                href={`/app/classes/${c.id}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-chalk transition"
              >
                <div>
                  <div className="font-medium">{c.name}</div>
                  {c.grade != null && (
                    <div className="text-xs text-dim">{c.grade} класс · {c.subject === "math" ? "математика" : c.subject}</div>
                  )}
                </div>
                <span className="text-sm text-dim">
                  {c._count.students} человек
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
