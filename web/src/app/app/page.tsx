import Link from "next/link";
import { requireTeacher } from "@/lib/session";
import { db } from "@/lib/db";
import { formatScheduled, minutesUntil } from "@/lib/dates";
import { startSessionAction } from "./lessons/actions";

export default async function DashboardPage() {
  const teacher = await requireTeacher();

  // окно «сегодня» = от сейчас−2ч до конца дня
  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setHours(0, 0, 0, 0);
  windowStart.setTime(Math.min(windowStart.getTime(), now.getTime() - 2 * 3600_000));
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const [classes, lessons, recentSessions, scheduledToday] = await Promise.all([
    db.class.findMany({
      where: { teacherId: teacher.id },
      include: { _count: { select: { students: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.lesson.findMany({
      where: { teacherId: teacher.id },
      orderBy: { updatedAt: "desc" },
      take: 6,
    }),
    db.session.findMany({
      where: { teacherId: teacher.id, closedAt: null },
      include: { lesson: true, class: true },
      orderBy: { startedAt: "desc" },
      take: 4,
    }),
    db.lesson.findMany({
      where: {
        teacherId: teacher.id,
        scheduledFor: { gte: windowStart, lt: tomorrow },
      },
      include: {
        class: true,
        sessions: {
          where: { closedAt: null },
          select: { id: true },
          take: 1,
        },
      },
      orderBy: { scheduledFor: "asc" },
    }),
  ]);

  return (
    <main className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Здравствуйте, {teacher.name.split(" ")[0]}
          </h1>
          <p className="mt-1 text-dim">
            {classes.length === 0
              ? "Сначала заведите класс — и через минуту проведёте первый цифровой урок."
              : "Выберите урок или начните новый."}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/app/lessons/new"
            className="px-4 py-2.5 rounded-xl bg-ink text-paper font-medium hover:bg-toolbarHover transition"
          >
            + Новый урок
          </Link>
        </div>
      </div>

      {recentSessions.length > 0 && (
        <Section title="Идут сейчас">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {recentSessions.map((s) => (
              <Link
                key={s.id}
                href={`/app/session/${s.id}`}
                className="block p-4 rounded-xl bg-paper border border-rule hover:border-accent transition"
              >
                <div className="text-xs uppercase tracking-wide text-dim">
                  {s.class.name} · live
                </div>
                <div className="mt-2 font-medium">{s.lesson.title}</div>
                <div className="mt-3 text-xs text-dim">
                  Начат {timeAgo(s.startedAt)}
                </div>
              </Link>
            ))}
          </div>
        </Section>
      )}

      {scheduledToday.length > 0 && (
        <Section title="Сегодня">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {scheduledToday.map((l) => {
              const min = l.scheduledFor ? minutesUntil(l.scheduledFor) : null;
              const isLive = l.sessions.length > 0;
              const tag = isLive
                ? "идёт"
                : min == null
                  ? ""
                  : min < -10
                    ? "прошёл"
                    : min < 0
                      ? "только что"
                      : min < 10
                        ? `через ${min} мин`
                        : formatScheduled(l.scheduledFor);
              const tagColor = isLive
                ? "bg-accent text-paper"
                : min != null && min >= 0 && min < 30
                  ? "bg-red text-paper"
                  : "bg-rule/50 text-dim";
              return (
                <div
                  key={l.id}
                  className="p-4 rounded-xl bg-paper border border-rule"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="uppercase tracking-wide text-dim">
                      {l.class?.name ?? "без класса"}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] ${tagColor}`}
                    >
                      {tag}
                    </span>
                  </div>
                  <div className="mt-2 font-medium">{l.title}</div>
                  <div className="mt-1 text-xs text-dim">
                    {formatScheduled(l.scheduledFor)}
                    {" · "}
                    {templateKindLabel(l.templateKind)}
                  </div>
                  <div className="mt-3 flex gap-2">
                    {isLive ? (
                      <Link
                        href={`/app/session/${l.sessions[0]!.id}`}
                        className="text-sm px-3 py-1.5 rounded-lg bg-ink text-paper hover:bg-toolbarHover transition"
                      >
                        → к мозаике
                      </Link>
                    ) : l.classId ? (
                      <form action={startSessionAction}>
                        <input type="hidden" name="lessonId" value={l.id} />
                        <input type="hidden" name="classId" value={l.classId} />
                        <input type="hidden" name="mode" value="live" />
                        <button
                          type="submit"
                          className="text-sm px-3 py-1.5 rounded-lg bg-ink text-paper hover:bg-toolbarHover transition"
                        >
                          ▶ Начать
                        </button>
                      </form>
                    ) : (
                      <Link
                        href={`/app/lessons/${l.id}`}
                        className="text-sm px-3 py-1.5 rounded-lg border border-rule hover:bg-chalk transition"
                      >
                        Выбрать класс →
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      <div className="grid lg:grid-cols-2 gap-6 mt-8">
        <Section title="Уроки" link={{ href: "/app/lessons", text: "все уроки →" }}>
          {lessons.length === 0 ? (
            <Empty
              text="Уроков ещё нет — создайте первый и начните работать с классом."
              cta={{ href: "/app/lessons/new", text: "Создать первый урок" }}
            />
          ) : (
            <ul className="divide-y divide-rule rounded-xl bg-paper border border-rule">
              {lessons.map((l) => (
                <li key={l.id}>
                  <Link
                    href={`/app/lessons/${l.id}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-chalk transition"
                  >
                    <span>{l.title}</span>
                    <span className="text-xs text-dim">{templateKindLabel(l.templateKind)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Классы" link={{ href: "/app/classes", text: "все классы →" }}>
          {classes.length === 0 ? (
            <Empty
              text="Классов ещё нет — заведите первый и добавьте учеников."
              cta={{ href: "/app/classes/new", text: "Завести первый класс" }}
            />
          ) : (
            <ul className="divide-y divide-rule rounded-xl bg-paper border border-rule">
              {classes.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/app/classes/${c.id}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-chalk transition"
                  >
                    <span>{c.name}</span>
                    <span className="text-xs text-dim">
                      {c._count.students} {pluralStudents(c._count.students)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </main>
  );
}

function Section({
  title,
  link,
  children,
}: {
  title: string;
  link?: { href: string; text: string };
  children: React.ReactNode;
}) {
  return (
    <section className="mb-2">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {link && (
          <Link href={link.href} className="text-sm text-accent hover:underline">
            {link.text}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Empty({
  text,
  cta,
}: {
  text: string;
  cta: { href: string; text: string };
}) {
  return (
    <div className="rounded-xl border border-dashed border-rule p-8 text-center">
      <p className="text-dim mb-3">{text}</p>
      <Link
        href={cta.href}
        className="inline-block px-4 py-2 rounded-lg bg-ink text-paper text-sm hover:bg-toolbarHover transition"
      >
        {cta.text}
      </Link>
    </div>
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

function pluralStudents(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "ученик";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "ученика";
  return "учеников";
}

function timeAgo(d: Date) {
  const min = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (min < 1) return "только что";
  if (min < 60) return `${min} мин назад`;
  const h = Math.round(min / 60);
  return `${h} ч назад`;
}
