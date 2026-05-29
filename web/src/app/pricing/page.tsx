import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Цены",
  description: "Парта — бесплатно для одного класса. Безлимит за 590 ₽/мес или школьная лицензия за 990 ₽/мес.",
};

const plans = [
  {
    name: "Бесплатно",
    price: "0 ₽",
    period: "навсегда",
    cta: { text: "Начать бесплатно", href: "/signup" },
    ctaStyle: "border border-rule hover:bg-chalk",
    highlight: false,
    features: [
      "1 класс до 30 учеников",
      "5 уроков в месяц",
      "Шаблоны: клетка, линии, координаты",
      "История работ 30 дней",
      "QR-вход без регистрации для учеников",
    ],
    notIncluded: [
      "Загрузка своих PDF",
      "Текстовые комментарии к работам",
      "Аналитика класса",
      "Вечный архив",
    ],
  },
  {
    name: "Личный",
    price: "590 ₽",
    period: "в месяц",
    badge: "Популярный",
    cta: { text: "Попробовать 14 дней", href: "/signup?plan=personal" },
    ctaStyle: "bg-accent text-paper hover:opacity-90",
    highlight: true,
    features: [
      "Неограниченно классов",
      "Неограниченно уроков",
      "Загрузка своих PDF (до 100 МБ)",
      "Все шаблоны листов",
      "Текстовые комментарии к работам",
      "Аналитика класса за 30 дней",
      "Вечный архив",
      "Экспорт работ в PNG",
    ],
    notIncluded: [],
  },
  {
    name: "Школьный",
    price: "990 ₽",
    period: "в месяц, за учителя",
    cta: { text: "Связаться с нами", href: "/contact" },
    ctaStyle: "border border-rule hover:bg-chalk",
    highlight: false,
    features: [
      "Всё из Личного",
      "До 20 учителей в одном аккаунте",
      "Общая библиотека шаблонов школы",
      "Статистика по школе",
      "Приоритетная поддержка",
      "Счёт для бухгалтерии",
    ],
    notIncluded: [],
  },
];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-paper">
      <div className="max-w-5xl mx-auto px-6 py-16">
        <div className="text-center mb-14">
          <Link href="/" className="text-sm text-accent hover:underline inline-block mb-6">
            ← на главную
          </Link>
          <h1 className="text-4xl font-semibold tracking-tight mb-3">Простые цены</h1>
          <p className="text-dim text-lg max-w-xl mx-auto">
            Начните бесплатно. Платите только за то, что используете.
            Никаких скрытых комиссий.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-16">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-2xl p-8 relative flex flex-col ${
                plan.highlight
                  ? "border-2 border-accent bg-paper shadow-lg"
                  : "border border-rule bg-paper"
              }`}
            >
              {plan.badge && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-accent text-paper text-xs font-medium">
                  {plan.badge}
                </div>
              )}

              <div className={`text-sm uppercase tracking-wide mb-2 ${plan.highlight ? "text-accent" : "text-dim"}`}>
                {plan.name}
              </div>
              <div className="text-4xl font-semibold mb-0.5">{plan.price}</div>
              <div className="text-dim text-sm mb-7">{plan.period}</div>

              <ul className="space-y-2.5 mb-6 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2.5 text-sm">
                    <CheckMark accent={plan.highlight} />
                    {f}
                  </li>
                ))}
                {plan.notIncluded.map((f) => (
                  <li key={f} className="flex gap-2.5 text-sm text-dim line-through">
                    <CrossMark />
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                href={plan.cta.href}
                className={`block text-center px-4 py-2.5 rounded-xl font-medium text-sm transition ${plan.ctaStyle}`}
              >
                {plan.cta.text}
              </Link>
            </div>
          ))}
        </div>

        {/* FAQ */}
        <section className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-semibold mb-8 text-center">Частые вопросы</h2>
          <div className="space-y-6">
            {[
              {
                q: "Нужно ли устанавливать что-то на планшеты учеников?",
                a: "Нет. Ученики входят через браузер по QR-коду или короткой ссылке. Ни регистрации, ни приложений.",
              },
              {
                q: "Что будет с данными, если я не продлю подписку?",
                a: "На бесплатном тарифе история хранится 30 дней. На платном — бессрочно. При отмене подписки у вас есть 30 дней, чтобы экспортировать всё.",
              },
              {
                q: "Можно ли оплатить со счёта школы?",
                a: "Да. Для Школьного тарифа мы выставляем счёт. Напишите нам — оформим договор и закрывающие документы.",
              },
              {
                q: "Есть ли скидки для НКО или сельских школ?",
                a: "Да, мы готовы обсудить индивидуальные условия. Напишите через форму обратной связи.",
              },
            ].map(({ q, a }) => (
              <div key={q} className="border-b border-rule pb-6">
                <h3 className="font-medium mb-2">{q}</h3>
                <p className="text-dim text-sm leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function CheckMark({ accent }: { accent?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mt-0.5 flex-shrink-0" aria-hidden>
      <circle cx="8" cy="8" r="8" fill={accent ? "#1e6f5c" : "#e3dfd1"} />
      <path d="M5 8l2 2 4-4" stroke={accent ? "#fff" : "#7a7468"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CrossMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mt-0.5 flex-shrink-0 opacity-30" aria-hidden>
      <circle cx="8" cy="8" r="8" fill="#e3dfd1" />
      <path d="M6 6l4 4M10 6l-4 4" stroke="#7a7468" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
