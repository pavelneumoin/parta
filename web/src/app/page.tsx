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

      <footer className="px-6 py-8 text-sm text-dim text-center border-t border-rule">
        Парта · школа без распечатки · {new Date().getFullYear()}
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
