import Link from "next/link";
import { requireTeacher } from "@/lib/session";
import { db } from "@/lib/db";

export const metadata = { title: "Сводка" };

const DAYS = 30;

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export default async function StatsPage() {
  const teacher = await requireTeacher();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const since = new Date(today);
  since.setDate(since.getDate() - (DAYS - 1));

  const sessions = await db.session.findMany({
    where: { teacherId: teacher.id, startedAt: { gte: since } },
    select: {
      startedAt: true,
      class: { select: { id: true, name: true } },
      workspaces: { select: { status: true } },
    },
    orderBy: { startedAt: "asc" },
  });

  // Сводные метрики
  let totalWorkspaces = 0;
  let totalSubmitted = 0;
  for (const s of sessions) {
    totalWorkspaces += s.workspaces.length;
    totalSubmitted += s.workspaces.filter((w) => w.status === "submitted").length;
  }
  const submitRate =
    totalWorkspaces > 0 ? Math.round((totalSubmitted / totalWorkspaces) * 100) : null;

  // Уроки по дням (30 столбцов)
  const counts = new Map<string, number>();
  for (const s of sessions) {
    const k = dateKey(new Date(s.startedAt));
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const days: { key: string; dom: number; count: number }[] = [];
  for (let i = 0; i < DAYS; i++) {
    const d = new Date(since);
    d.setDate(d.getDate() + i);
    const k = dateKey(d);
    days.push({ key: k, dom: d.getDate(), count: counts.get(k) ?? 0 });
  }

  // По классам
  const perClass = new Map<
    string,
    { name: string; sessions: number; workspaces: number; submitted: number }
  >();
  for (const s of sessions) {
    const cur = perClass.get(s.class.id) ?? {
      name: s.class.name,
      sessions: 0,
      workspaces: 0,
      submitted: 0,
    };
    cur.sessions += 1;
    cur.workspaces += s.workspaces.length;
    cur.submitted += s.workspaces.filter((w) => w.status === "submitted").length;
    perClass.set(s.class.id, cur);
  }
  const classRows = Array.from(perClass.values()).sort((a, b) => b.sessions - a.sessions);

  return (
    <main className="max-w-4xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Сводка за месяц</h1>
      <p className="text-dim mt-1 mb-6">Последние 30 дней — что происходило в ваших классах.</p>

      {sessions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-rule p-10 text-center">
          <p className="text-dim mb-4">
            За последние 30 дней уроков не было. Проведите первый — и здесь появится
            динамика по дням, классам и проценту сдачи.
          </p>
          <Link
            href="/app/lessons"
            className="inline-block px-4 py-2.5 rounded-xl bg-ink text-paper font-medium hover:bg-toolbarHover transition"
          >
            К урокам
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            <Metric label="Уроков" value={String(sessions.length)} />
            <Metric label="Рабочих листов" value={String(totalWorkspaces)} />
            <Metric label="Сдано" value={String(totalSubmitted)} />
            <Metric label="% сдачи" value={submitRate == null ? "—" : `${submitRate}%`} />
          </div>

          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-3">Уроки по дням</h2>
            <div className="rounded-xl bg-paper border border-rule p-4">
              <LessonsBarChart days={days} />
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">По классам</h2>
            <div className="rounded-xl bg-paper border border-rule overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-dim border-b border-rule">
                    <th className="px-4 py-2.5 font-medium">Класс</th>
                    <th className="px-4 py-2.5 font-medium text-right">Уроков</th>
                    <th className="px-4 py-2.5 font-medium text-right">Листов</th>
                    <th className="px-4 py-2.5 font-medium text-right">% сдачи</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">
                  {classRows.map((c) => {
                    const rate =
                      c.workspaces > 0
                        ? Math.round((c.submitted / c.workspaces) * 100)
                        : null;
                    return (
                      <tr key={c.name}>
                        <td className="px-4 py-2.5">{c.name}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{c.sessions}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{c.workspaces}</td>
                        <td className="px-4 py-2.5 text-right font-mono">
                          {rate == null ? "—" : `${rate}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
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

function LessonsBarChart({
  days,
}: {
  days: { key: string; dom: number; count: number }[];
}) {
  const W = 700;
  const H = 150;
  const plotH = 110; // высота области столбцов
  const baseline = plotH;
  const cellW = W / days.length;
  const barW = cellW - 5;
  const max = Math.max(1, ...days.map((d) => d.count));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto"
      role="img"
      aria-label="Столбчатая диаграмма: число уроков по дням за последние 30 дней"
    >
      {/* базовая линия */}
      <line x1={0} y1={baseline} x2={W} y2={baseline} className="stroke-rule" strokeWidth={1} />
      {days.map((d, i) => {
        const x = i * cellW + (cellW - barW) / 2;
        const barH = d.count > 0 ? Math.max(3, (d.count / max) * (plotH - 6)) : 0;
        const y = baseline - barH;
        const showLabel = i % 5 === 0 || i === days.length - 1;
        return (
          <g key={d.key}>
            {barH > 0 && (
              <rect x={x} y={y} width={barW} height={barH} rx={2} className="fill-accent" />
            )}
            {d.count > 0 && (
              <text
                x={x + barW / 2}
                y={y - 3}
                textAnchor="middle"
                className="fill-ink"
                fontSize={10}
              >
                {d.count}
              </text>
            )}
            {showLabel && (
              <text
                x={x + barW / 2}
                y={H - 8}
                textAnchor="middle"
                className="fill-dim"
                fontSize={10}
              >
                {d.dom}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
