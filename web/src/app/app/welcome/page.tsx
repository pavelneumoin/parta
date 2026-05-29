import Link from "next/link";
import { requireTeacher } from "@/lib/session";
import { db } from "@/lib/db";

export const metadata = { title: "С чего начать" };

export default async function WelcomePage() {
  const teacher = await requireTeacher();

  const [classCount, lessonCount, sessionCount] = await Promise.all([
    db.class.count({ where: { teacherId: teacher.id } }),
    db.lesson.count({ where: { teacherId: teacher.id } }),
    db.session.count({ where: { teacherId: teacher.id } }),
  ]);

  const steps = [
    {
      done: classCount > 0,
      title: "Заведите класс",
      desc: "Добавьте учеников — можно вставить список прямо из журнала или Excel. Регистрация ученикам не нужна.",
      href: "/app/classes/new",
      cta: "Завести класс",
    },
    {
      done: lessonCount > 0,
      title: "Создайте урок",
      desc: "Загрузите свой PDF или выберите чистый лист: клетка, координаты, линейка. Урок — это рабочий лист, который увидит каждый ученик.",
      href: "/app/lessons/new",
      cta: "Создать урок",
    },
    {
      done: sessionCount > 0,
      title: "Проведите урок",
      desc: "Нажмите «Начать» — ученики войдут по коду или QR за 30 секунд. Вы увидите все листы класса в реальном времени.",
      href: "/app/lessons",
      cta: "К урокам",
    },
  ];

  const allDone = steps.every((s) => s.done);
  const nextIdx = steps.findIndex((s) => !s.done);

  return (
    <main className="max-w-2xl mx-auto px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">
          {allDone ? "Вы освоились" : `Добро пожаловать, ${teacher.name.split(" ")[0]}`}
        </h1>
        <p className="text-dim mt-2">
          {allDone
            ? "Все шаги пройдены. Дальше — обычная работа: создавайте уроки и проводите их."
            : "Три шага до первого цифрового урока. Каждый — пара минут."}
        </p>
      </div>

      <ol className="space-y-3">
        {steps.map((step, i) => {
          const isNext = i === nextIdx;
          return (
            <li
              key={step.title}
              className={`flex gap-4 rounded-2xl border p-5 transition ${
                step.done
                  ? "border-rule bg-chalk/40"
                  : isNext
                    ? "border-accent bg-paper shadow-sm"
                    : "border-rule bg-paper opacity-70"
              }`}
            >
              <div className="flex-shrink-0">
                {step.done ? (
                  <div className="w-9 h-9 rounded-full bg-accent text-paper grid place-items-center">
                    <CheckIcon className="w-5 h-5" />
                  </div>
                ) : (
                  <div
                    className={`w-9 h-9 rounded-full grid place-items-center font-semibold ${
                      isNext ? "bg-ink text-paper" : "bg-rule/60 text-dim"
                    }`}
                  >
                    {i + 1}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h2
                  className={`font-semibold ${step.done ? "text-dim line-through decoration-rule" : "text-ink"}`}
                >
                  {step.title}
                </h2>
                <p className="text-sm text-dim mt-1 leading-relaxed">{step.desc}</p>
                {!step.done && isNext && (
                  <Link
                    href={step.href}
                    className="inline-block mt-3 px-4 py-2 rounded-lg bg-ink text-paper text-sm font-medium hover:bg-toolbarHover transition"
                  >
                    {step.cta}
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-8 flex items-center gap-4 text-sm">
        <Link href="/app" className="text-accent hover:underline">
          {allDone ? "На дашборд →" : "Пропустить, я разберусь сам"}
        </Link>
        <Link href="/about" className="text-dim hover:text-ink transition">
          Что такое Парта?
        </Link>
      </div>
    </main>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <polyline points="5 12 10 17 19 7" />
    </svg>
  );
}
