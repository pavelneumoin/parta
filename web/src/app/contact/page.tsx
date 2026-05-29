import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Контакты",
  description: "Напишите нам — вопросы о Парте, партнёрство, поддержка.",
};

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-paper">
      <div className="max-w-xl mx-auto px-6 py-16">
        <Link href="/" className="text-sm text-accent hover:underline inline-block mb-8">
          ← на главную
        </Link>

        <h1 className="text-4xl font-semibold tracking-tight mb-3">Контакты</h1>
        <p className="text-dim mb-10">
          Отвечаем в течение рабочего дня. Пишите на русском или английском.
        </p>

        <div className="space-y-6 mb-12">
          {[
            {
              label: "Общие вопросы и поддержка",
              value: "hello@parta.ru",
              href: "mailto:hello@parta.ru",
            },
            {
              label: "Вопросы по данным и конфиденциальности",
              value: "privacy@parta.ru",
              href: "mailto:privacy@parta.ru",
            },
            {
              label: "Школьные лицензии и партнёрство",
              value: "schools@parta.ru",
              href: "mailto:schools@parta.ru",
            },
          ].map(({ label, value, href }) => (
            <div key={label} className="p-5 rounded-xl border border-rule bg-paper">
              <div className="text-xs uppercase tracking-wide text-dim mb-1">{label}</div>
              <a href={href} className="text-accent hover:underline font-medium">
                {value}
              </a>
            </div>
          ))}
        </div>

        <div className="rounded-xl bg-chalk border border-rule p-6">
          <h2 className="font-semibold mb-3">Хотите рассказать о своём опыте?</h2>
          <p className="text-dim text-sm leading-relaxed mb-4">
            Мы учимся у учителей. Если вы провели урок с Партой и у вас есть
            отзыв — мы искренне хотим его услышать. Хорошее и плохое.
          </p>
          <a
            href="mailto:hello@parta.ru?subject=Отзыв о Парте"
            className="inline-block px-4 py-2 rounded-lg bg-ink text-paper text-sm hover:bg-toolbarHover transition font-medium"
          >
            Написать отзыв
          </a>
        </div>

        <div className="mt-10 pt-8 border-t border-rule text-sm text-dim">
          <p>
            Парта — проект одного учителя математики.
            Мы не корпорация, поэтому отвечаем лично.
          </p>
          <div className="flex gap-6 mt-4">
            <Link href="/about" className="hover:text-ink transition">О проекте</Link>
            <Link href="/pricing" className="hover:text-ink transition">Цены</Link>
            <Link href="/privacy" className="hover:text-ink transition">Конфиденциальность</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
