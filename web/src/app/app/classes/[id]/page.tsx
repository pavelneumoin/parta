import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeacher } from "@/lib/session";
import { db } from "@/lib/db";
import { addStudentsAction, deleteStudentAction } from "../actions";

export default async function ClassDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const teacher = await requireTeacher();

  const klass = await db.class.findFirst({
    where: { id, teacherId: teacher.id },
    include: {
      students: { orderBy: { fullName: "asc" } },
      _count: { select: { sessions: true } },
    },
  });

  if (!klass) notFound();

  // Аналитика «За последние 7 дней»: сессии класса + сводка по workspace'ам
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600_000);
  const recentSessions = await db.session.findMany({
    where: { classId: klass.id, startedAt: { gte: weekAgo } },
    include: {
      workspaces: {
        include: {
          student: { select: { id: true, fullName: true } },
          _count: { select: { strokes: true } },
        },
      },
    },
  });

  const totalLessons = recentSessions.length;
  const totalWorkspaces = recentSessions.reduce((n, s) => n + s.workspaces.length, 0);
  const totalSubmitted = recentSessions.reduce(
    (n, s) => n + s.workspaces.filter((w) => w.status === "submitted").length,
    0,
  );
  const submitRate = totalWorkspaces > 0
    ? Math.round((totalSubmitted / totalWorkspaces) * 100)
    : null;

  // Активность по ученикам: средние штрихи за урок
  const perStudent = new Map<string, { name: string; strokes: number; lessons: number; submitted: number }>();
  for (const sess of recentSessions) {
    for (const w of sess.workspaces) {
      const cur = perStudent.get(w.student.id) ?? {
        name: w.student.fullName,
        strokes: 0,
        lessons: 0,
        submitted: 0,
      };
      cur.strokes += w._count.strokes;
      cur.lessons += 1;
      if (w.status === "submitted") cur.submitted += 1;
      perStudent.set(w.student.id, cur);
    }
  }
  const studentRows = Array.from(perStudent.values());
  const laggers = studentRows
    .filter((s) => s.lessons >= 2 && s.strokes / s.lessons < 5)
    .sort((a, b) => a.strokes / a.lessons - b.strokes / b.lessons)
    .slice(0, 5);

  return (
    <main className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <Link href="/app/classes" className="text-sm text-accent hover:underline">
            ← к классам
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">{klass.name}</h1>
          <p className="text-dim mt-1">
            {klass.students.length} человек
            {klass.grade != null ? ` · ${klass.grade} класс` : ""}
          </p>
        </div>
        <Link
          href={`/app/lessons/new?classId=${klass.id}`}
          className="px-4 py-2.5 rounded-xl bg-ink text-paper font-medium hover:bg-toolbarHover transition"
        >
          + Урок для класса
        </Link>
      </div>

      {totalLessons > 0 ? (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">За последние 7 дней</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <Metric label="Уроков" value={String(totalLessons)} />
            <Metric label="Рабочих листов" value={String(totalWorkspaces)} />
            <Metric label="Сдано" value={String(totalSubmitted)} />
            <Metric
              label="% сдачи"
              value={submitRate == null ? "—" : `${submitRate}%`}
            />
          </div>
          {laggers.length > 0 && (
            <div className="rounded-xl bg-paper border border-rule p-4">
              <h3 className="text-sm font-semibold mb-2">
                Кто отстаёт{" "}
                <span className="font-normal text-dim">
                  · меньше 5 штрихов в среднем за урок
                </span>
              </h3>
              <ul className="divide-y divide-rule">
                {laggers.map((l) => (
                  <li key={l.name} className="flex items-center justify-between py-1.5 text-sm">
                    <span>{l.name}</span>
                    <span className="text-dim font-mono">
                      {Math.round(l.strokes / l.lessons)} штр/урок · {l.submitted}/{l.lessons} сдач
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      ) : (
        <section className="mb-8 rounded-xl border border-dashed border-rule p-6 text-center text-dim text-sm">
          За последние 7 дней уроков не было. Когда проведёте — здесь появится сводка по классу.
        </section>
      )}

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Ученики</h2>
        {klass.students.length === 0 ? (
          <p className="text-dim mb-3">Список пуст — добавьте имена ниже.</p>
        ) : (
          <ul className="divide-y divide-rule rounded-xl bg-paper border border-rule mb-4">
            {klass.students.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between px-4 py-2.5"
              >
                <span>{s.fullName}</span>
                <form action={deleteStudentAction}>
                  <input type="hidden" name="studentId" value={s.id} />
                  <input type="hidden" name="classId" value={klass.id} />
                  <button
                    type="submit"
                    className="text-xs text-dim hover:text-red transition"
                    title="Удалить из класса"
                  >
                    удалить
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        <form action={addStudentsAction} className="flex flex-col gap-2">
          <input type="hidden" name="classId" value={klass.id} />
          <textarea
            name="students"
            rows={4}
            placeholder={"Вставьте список — по одному с новой строки.\nМожно прямо из журнала или Excel:\n1. Иванова Анна\n2. Петров Борис"}
            className="px-3 py-2.5 rounded-lg border border-rule bg-paper outline-none focus:border-accent transition font-mono text-sm"
          />
          <p className="text-xs text-dim">
            Поймём нумерацию, столбцы из Excel и запятые. Повторы и уже
            добавленных пропустим.
          </p>
          <button
            type="submit"
            className="self-end px-4 py-2 rounded-lg border border-rule hover:bg-rule/40 transition text-sm"
          >
            + Добавить
          </button>
        </form>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-paper border border-rule px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-dim">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}
