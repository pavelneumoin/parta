import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "О проекте",
  description: "Парта — цифровая тетрадь для класса. Мы делаем урок видимым для учителя.",
};

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-paper">
      <div className="max-w-2xl mx-auto px-6 py-16">
        <Link href="/" className="text-sm text-accent hover:underline inline-block mb-8">
          ← на главную
        </Link>

        <h1 className="text-4xl font-semibold tracking-tight mb-8">О проекте</h1>

        <div className="prose prose-slate max-w-none space-y-6 text-ink/80 leading-relaxed">
          <p className="text-lg text-ink font-medium">
            Парта — это цифровая тетрадь для классной работы, которую видно.
          </p>

          <p>
            Мы сделали Парту, потому что видели один и тот же сценарий в тысячах
            классов: учитель задал задачу, 28 учеников пишут в тетрадях — и учитель
            не знает, кто уже решил, кто застрял, а кто нарисовал котика.
          </p>

          <p>
            Парта решает это без революции. Ученики пишут на привычном листе —
            только на планшете. Учитель видит все 28 листов сразу — в реальном времени.
            Никакой регистрации для учеников, никаких приложений, никакого ИТ-отдела.
          </p>

          <h2 className="text-xl font-semibold mt-10 mb-4 text-ink">Принципы</h2>

          <ul className="space-y-3">
            {[
              ["Урок, а не платформа", "Парта не пытается заменить электронный журнал или LMS. Она делает один конкретный момент — работу на уроке — видимым и управляемым."],
              ["Тетрадь, не конструктор", "Мы не добавляем тесты с галочками, интерактивные слайды и геймификацию. Ученик пишет рукой — учитель видит, как думает ребёнок, а не только ответ."],
              ["Математика в приоритете", "Координатная плоскость, клетчатый лист, графики — не afterthought, а основа. Парта делается учителем математики, для учителей математики."],
              ["Минимализм намеренный", "Каждая функция добавляется с болью. Если можно не добавлять — не добавляем."],
            ].map(([title, body]) => (
              <li key={title as string} className="flex gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-accent mt-2.5 flex-shrink-0" />
                <div>
                  <span className="font-medium text-ink">{title}</span>
                  {" — "}
                  {body}
                </div>
              </li>
            ))}
          </ul>

          <h2 className="text-xl font-semibold mt-10 mb-4 text-ink">Кто делает</h2>

          <p>
            Парта — инди-проект, который делает учитель математики и разработчик
            в одном лице. Мы пилотируем его в реальных классах.
          </p>

          <p>
            Если вы учитель и хотите попробовать — начните бесплатно.
            Если хотите помочь или просто поговорить об образовании —
            напишите нам.
          </p>
        </div>

        <div className="mt-12 flex gap-4 flex-wrap">
          <Link
            href="/signup"
            className="px-5 py-3 rounded-xl bg-ink text-paper hover:bg-toolbarHover transition font-medium text-sm"
          >
            Попробовать Парту
          </Link>
          <Link
            href="/contact"
            className="px-5 py-3 rounded-xl border border-rule hover:bg-chalk transition font-medium text-sm"
          >
            Написать нам
          </Link>
        </div>
      </div>
    </main>
  );
}
