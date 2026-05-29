import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LogoMark />
          <span className="font-semibold text-lg tracking-tight">Парта</span>
        </div>
        <nav className="flex items-center gap-2 text-sm">
          <Link
            href="/signin"
            className="px-3 py-2 rounded-lg hover:bg-rule/50 transition"
          >
            Войти
          </Link>
          <Link
            href="/signup"
            className="px-3 py-2 rounded-lg bg-ink text-paper hover:bg-toolbarHover transition"
          >
            Завести класс
          </Link>
        </nav>
      </header>

      <section className="flex-1 grid lg:grid-cols-2 gap-12 px-6 lg:px-16 pt-8 lg:pt-20 pb-16 items-center max-w-7xl mx-auto w-full">
        <div>
          <h1 className="text-4xl lg:text-6xl font-semibold tracking-tight leading-[1.05]">
            Видно каждого.
            <br />
            Слышно никого.
          </h1>
          <p className="mt-6 text-lg lg:text-xl text-ink/70 leading-relaxed max-w-xl">
            28 учеников — 28 рабочих листов на вашем экране. Сразу видно,
            кто застрял, кто пишет ерунду, кто закончил. Подсказать тихо,
            не вызывая к доске.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/signup"
              className="px-5 py-3 rounded-xl bg-ink text-paper hover:bg-toolbarHover transition font-medium"
            >
              Завести класс
            </Link>
            <a
              href="/prototype/handwriting.html"
              className="px-5 py-3 rounded-xl border border-rule hover:bg-rule/40 transition font-medium"
            >
              Потрогать рукописный ввод
            </a>
          </div>
          <p className="mt-6 text-sm text-dim">
            Бесплатно для одного класса · Работает в браузере на любом планшете
          </p>
        </div>

        <div className="relative">
          <MosaicMockup />
        </div>
      </section>

      <FeatureGrid />

      <HowItWorks />

      <PricingTeaser />

      <footer className="px-6 py-8 border-t border-rule">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-dim">
          <span>Парта · школа без распечатки · {new Date().getFullYear()}</span>
          <nav className="flex gap-5">
            <Link href="/pricing" className="hover:text-ink transition">Цены</Link>
            <Link href="/about" className="hover:text-ink transition">О проекте</Link>
            <Link href="/privacy" className="hover:text-ink transition">Конфиденциальность</Link>
            <Link href="/contact" className="hover:text-ink transition">Контакты</Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}

function LogoMark() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="3" y="6" width="22" height="16" rx="2" fill="#1a1f2b" />
      <rect x="6" y="9" width="16" height="2" rx="1" fill="#f4f1e8" />
      <rect x="6" y="13" width="12" height="2" rx="1" fill="#f4f1e8" />
      <rect x="6" y="17" width="8" height="2" rx="1" fill="#f4f1e8" />
      <rect x="3" y="22" width="22" height="2" rx="1" fill="#1e6f5c" />
    </svg>
  );
}

function MosaicMockup() {
  // визуальный mock мозаики 4×7 — отражает РЕАЛЬНУЮ систему статусов из SessionMosaic.Tile.
  // 1 рука · 1 завис · 2 сдали · остальные спокойно работают.
  type Cell =
    | { kind: "hand" }
    | { kind: "stale" }
    | { kind: "submitted" }
    | { kind: "active"; intensity: number }
    | { kind: "not_joined" };

  const cells: Cell[] = Array.from({ length: 28 }, (_, i) => {
    if (i === 5) return { kind: "hand" };
    if (i === 14) return { kind: "stale" };
    if (i === 9 || i === 22) return { kind: "submitted" };
    if (i === 17) return { kind: "not_joined" };
    return { kind: "active", intensity: ((i * 31) % 70) / 100 + 0.1 };
  });

  return (
    <div className="rounded-2xl bg-toolbar p-4 shadow-2xl">
      <div className="flex items-center justify-between mb-3 text-paper/80 text-xs font-mono">
        <span>7А · Линейные уравнения · идёт</span>
        <span>27 / 28 вошли</span>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((c, i) => {
          const ring =
            c.kind === "hand"
              ? "ring-2 ring-red shadow-md"
              : c.kind === "stale"
                ? "ring-2 ring-yellow-500"
                : "ring-1 ring-paper/20";
          const dim = c.kind === "submitted" ? "opacity-75" : "";
          return (
            <div
              key={i}
              className={`aspect-[3/4] rounded-md bg-paper relative overflow-hidden ${ring} ${dim}`}
              style={{
                backgroundImage:
                  "linear-gradient(to right, #d8dee988 1px, transparent 1px), linear-gradient(to bottom, #d8dee988 1px, transparent 1px)",
                backgroundSize: "6px 6px",
              }}
            >
              {c.kind === "active" && (
                <div
                  className="absolute inset-1 rounded-sm bg-ink"
                  style={{ opacity: c.intensity * 0.15 }}
                />
              )}
              {c.kind === "not_joined" && (
                <div className="absolute inset-0 grid place-items-center text-[8px] text-dim bg-chalk/85">
                  не вошёл
                </div>
              )}
              {c.kind === "hand" && (
                <div className="absolute top-0.5 right-0.5 w-3 h-3 rounded-full bg-red animate-pulse" />
              )}
              {c.kind === "submitted" && (
                <div className="absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full bg-green" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HowItWorks() {
  const steps = [
    {
      num: "01",
      title: "Создайте урок за минуту",
      body: "Загрузите PDF с задачами или выберите чистый шаблон — координатная плоскость, клетка, линии. Укажите класс, и Парта сделает 28 индивидуальных листов.",
      icon: (
        <svg width="52" height="52" viewBox="0 0 52 52" fill="none" aria-hidden>
          <rect x="8" y="6" width="36" height="40" rx="4" fill="var(--color-chalk)" stroke="var(--color-rule)" strokeWidth="1.5" />
          <rect x="14" y="14" width="24" height="3" rx="1.5" fill="var(--color-ink)" opacity=".25" />
          <rect x="14" y="21" width="20" height="3" rx="1.5" fill="var(--color-ink)" opacity=".25" />
          <rect x="14" y="28" width="14" height="3" rx="1.5" fill="var(--color-ink)" opacity=".25" />
          <circle cx="38" cy="38" r="10" fill="var(--color-accent)" />
          <path d="M34 38h8M38 34v8" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      num: "02",
      title: "Ученики входят по QR",
      body: "Покажите QR-код на доске. Ученики открывают камеру — и сразу попадают на свой лист. Без регистрации, без приложения, без суеты.",
      icon: (
        <svg width="52" height="52" viewBox="0 0 52 52" fill="none" aria-hidden>
          <rect x="8" y="8" width="15" height="15" rx="2" stroke="var(--color-ink)" strokeWidth="2" fill="none" />
          <rect x="12" y="12" width="7" height="7" rx="1" fill="var(--color-ink)" opacity=".4" />
          <rect x="29" y="8" width="15" height="15" rx="2" stroke="var(--color-ink)" strokeWidth="2" fill="none" />
          <rect x="33" y="12" width="7" height="7" rx="1" fill="var(--color-ink)" opacity=".4" />
          <rect x="8" y="29" width="15" height="15" rx="2" stroke="var(--color-ink)" strokeWidth="2" fill="none" />
          <rect x="12" y="33" width="7" height="7" rx="1" fill="var(--color-ink)" opacity=".4" />
          <rect x="29" y="29" width="7" height="7" rx="1" fill="var(--color-accent)" opacity=".7" />
          <rect x="37" y="29" width="7" height="7" rx="1" fill="var(--color-accent)" opacity=".4" />
          <rect x="29" y="37" width="7" height="7" rx="1" fill="var(--color-accent)" opacity=".4" />
          <rect x="37" y="37" width="7" height="7" rx="1" fill="var(--color-accent)" opacity=".7" />
        </svg>
      ),
    },
    {
      num: "03",
      title: "Наблюдайте за классом",
      body: "На вашем экране — мозаика 28 листов в реальном времени. Кто застрял — виден сразу. Откройте лист, напишите красным — ученик увидит подсказку, не отрываясь от работы.",
      icon: (
        <svg width="52" height="52" viewBox="0 0 52 52" fill="none" aria-hidden>
          <rect x="4" y="8" width="44" height="32" rx="3" fill="var(--color-toolbar)" />
          {[0,1,2,3,4,5,6].map(col =>
            [0,1,2,3].map(row => (
              <rect
                key={`${col}-${row}`}
                x={7 + col * 6}
                y={11 + row * 7}
                width="5"
                height="5.5"
                rx="0.8"
                fill={col === 2 && row === 1 ? "var(--color-red)" : col === 5 && row === 3 ? "var(--color-green)" : "#f4f1e8"}
                opacity={col === 2 && row === 1 ? 1 : col === 5 && row === 3 ? 0.9 : 0.55}
              />
            ))
          )}
          <rect x="20" y="40" width="12" height="3" rx="1.5" fill="var(--color-rule)" />
          <rect x="16" y="43" width="20" height="2" rx="1" fill="var(--color-rule)" />
        </svg>
      ),
    },
  ];

  return (
    <section className="bg-chalk border-t border-rule py-20 px-6">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-3xl font-semibold tracking-tight text-center mb-2">
          Как работает Парта
        </h2>
        <p className="text-center text-dim mb-14 max-w-xl mx-auto">
          Три шага — и урок идёт. Без инструктажа для учеников, без ИТ-заявок.
        </p>
        <div className="grid md:grid-cols-3 gap-10">
          {steps.map((s) => (
            <div key={s.num} className="flex flex-col items-center text-center">
              <div className="mb-5 p-4 rounded-2xl bg-paper border border-rule shadow-sm">
                {s.icon}
              </div>
              <div className="text-xs font-mono text-dim mb-2 tracking-widest">{s.num}</div>
              <h3 className="font-semibold text-lg mb-3">{s.title}</h3>
              <p className="text-ink/70 leading-relaxed text-sm">{s.body}</p>
            </div>
          ))}
        </div>
        <div className="text-center mt-14">
          <a
            href="/signup"
            className="inline-block px-6 py-3 rounded-xl bg-ink text-paper font-medium hover:bg-toolbarHover transition"
          >
            Начать бесплатно
          </a>
        </div>
      </div>
    </section>
  );
}

function PricingTeaser() {
  return (
    <section className="py-20 px-6">
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="text-3xl font-semibold tracking-tight mb-3">Просто и понятно</h2>
        <p className="text-dim mb-10">Начните бесплатно. Расширяйте, когда нужно.</p>
        <div className="grid sm:grid-cols-2 gap-6 text-left">
          <div className="rounded-2xl border border-rule bg-paper p-8">
            <div className="text-dim text-sm uppercase tracking-wide mb-2">Бесплатно</div>
            <div className="text-4xl font-semibold mb-1">0 ₽</div>
            <div className="text-dim text-sm mb-6">навсегда</div>
            <ul className="space-y-2 text-sm text-ink/80">
              <li className="flex gap-2"><Tick />1 класс</li>
              <li className="flex gap-2"><Tick />До 30 учеников</li>
              <li className="flex gap-2"><Tick />Шаблоны клетка, линии, координаты</li>
              <li className="flex gap-2"><Tick />Архив 30 дней</li>
            </ul>
            <a href="/signup" className="mt-8 block text-center px-4 py-2.5 rounded-xl border border-rule hover:bg-chalk transition font-medium text-sm">
              Начать
            </a>
          </div>
          <div className="rounded-2xl border-2 border-accent bg-paper p-8 relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-accent text-paper text-xs font-medium">
              Популярный
            </div>
            <div className="text-accent text-sm uppercase tracking-wide mb-2">Личный</div>
            <div className="text-4xl font-semibold mb-1">590 ₽</div>
            <div className="text-dim text-sm mb-6">в месяц</div>
            <ul className="space-y-2 text-sm text-ink/80">
              <li className="flex gap-2"><Tick accent />Неограниченно классов</li>
              <li className="flex gap-2"><Tick accent />Загрузка своих PDF</li>
              <li className="flex gap-2"><Tick accent />Все шаблоны</li>
              <li className="flex gap-2"><Tick accent />Вечный архив</li>
              <li className="flex gap-2"><Tick accent />Текстовые комментарии</li>
            </ul>
            <a href="/pricing" className="mt-8 block text-center px-4 py-2.5 rounded-xl bg-accent text-paper hover:opacity-90 transition font-medium text-sm">
              Подробнее о тарифах
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function Tick({ accent }: { accent?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mt-0.5 flex-shrink-0" aria-hidden>
      <circle cx="8" cy="8" r="8" fill={accent ? "#1e6f5c" : "#e3dfd1"} />
      <path d="M5 8l2 2 4-4" stroke={accent ? "#fff" : "#7a7468"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FeatureGrid() {
  const items = [
    {
      title: "За 30 секунд",
      body:
        "Загружаешь PDF или открываешь чистый лист с координатами. Ученики входят по QR без регистрации."
    },
    {
      title: "Без распечаток",
      body:
        "Один шаблон → 28 индивидуальных листов. Никакой бумаги. Архив работ — навсегда."
    },
    {
      title: "Подсказка тихо",
      body:
        "Открываешь лист ученика, пишешь красным прямо в его работе. Остальные не отвлекаются."
    },
    {
      title: "Math-first",
      body:
        "Координатная плоскость, клетка, графики, рукописная математика. Не Miro — нормальная тетрадь."
    }
  ];
  return (
    <section className="bg-paper border-t border-rule">
      <div className="max-w-7xl mx-auto px-6 lg:px-16 py-16 grid md:grid-cols-2 lg:grid-cols-4 gap-8">
        {items.map((it) => (
          <div key={it.title}>
            <h3 className="font-semibold text-lg mb-2">{it.title}</h3>
            <p className="text-ink/70 leading-relaxed">{it.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
