"use client";

import { useEffect, useRef, useState } from "react";

type WorkspaceTile = {
  id: string;
  studentName: string;
  status: "not_joined" | "active" | "idle" | "submitted";
  strokes: number;
  lastActivityAt: string | null;
  templateKind: string;
  previewUpdatedAt: string | null;
  previewPageIndex: number | null;
  handRaisedAt: string | null;
};

type StateResp = {
  sessionId: string;
  closedAt: string | null;
  workspaces: WorkspaceTile[];
};

const POLL_MS = 2500;

type ToastItem = { id: number; text: string };

type Filter = "all" | "active" | "hand" | "idle" | "submitted";
type SortBy = "name" | "hand" | "activity" | "strokes";

export function SessionMosaic({ sessionId }: { sessionId: string }) {
  const [state, setState] = useState<StateResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("name");
  const [helpOpen, setHelpOpen] = useState(false);
  // мапа workspaceId → последний known handRaisedAt (для detection изменений)
  const prevHandsRef = useRef<Map<string, string | null>>(new Map());
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastIdRef = useRef(0);

  const pushToast = (text: string) => {
    const id = ++toastIdRef.current;
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 5000);
  };

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let isFirstTick = true;

    const tick = async () => {
      try {
        const r = await fetch(`/api/sessions/${sessionId}/state`, {
          cache: "no-store",
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = (await r.json()) as StateResp;
        if (!cancelled) {
          // detect новые «руки» — только начиная со второго тика, чтобы initial не флудил
          if (!isFirstTick) {
            for (const w of data.workspaces) {
              const prev = prevHandsRef.current.get(w.id) ?? null;
              if (!prev && w.handRaisedAt) {
                pushToast(`✋ ${w.studentName} поднял руку`);
              }
            }
          }
          prevHandsRef.current.clear();
          for (const w of data.workspaces) {
            prevHandsRef.current.set(w.id, w.handRaisedAt);
          }
          isFirstTick = false;
          setState(data);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "ошибка");
      } finally {
        if (!cancelled) timer = setTimeout(tick, POLL_MS);
      }
    };
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [sessionId]);

  // Горячие клавиши для живого урока. e.code — независимо от раскладки (рус/eng).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)
      ) {
        return;
      }

      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen((v) => !v);
        return;
      }
      if (e.key === "Escape") {
        setHelpOpen(false);
        setFilter("all");
        return;
      }

      switch (e.code) {
        case "KeyA":
        case "Digit1":
          setFilter("all");
          break;
        case "KeyR":
          setFilter((f) => (f === "hand" ? "all" : "hand"));
          break;
        case "KeyZ":
          setFilter((f) => (f === "idle" ? "all" : "idle"));
          break;
        case "KeyS":
          setFilter((f) => (f === "submitted" ? "all" : "submitted"));
          break;
        default:
          return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!state) {
    return <div className="text-dim text-center py-12">Подключаюсь…</div>;
  }

  const joined = state.workspaces.filter((w) => w.status !== "not_joined").length;
  const total = state.workspaces.length;
  const handsUp = state.workspaces.filter((w) => w.handRaisedAt).length;
  const submitted = state.workspaces.filter((w) => w.status === "submitted").length;
  const idleCount = state.workspaces.filter((w) => {
    if (w.status !== "active") return false;
    if (!w.lastActivityAt) return false;
    return Date.now() - new Date(w.lastActivityAt).getTime() > 120_000;
  }).length;

  const filtered = (() => {
    let arr = state.workspaces.slice();
    if (filter === "hand") arr = arr.filter((w) => w.handRaisedAt);
    else if (filter === "submitted") arr = arr.filter((w) => w.status === "submitted");
    else if (filter === "idle") {
      arr = arr.filter(
        (w) =>
          w.status === "active" &&
          w.lastActivityAt &&
          Date.now() - new Date(w.lastActivityAt).getTime() > 120_000,
      );
    } else if (filter === "active") {
      arr = arr.filter((w) => w.status === "active");
    }

    arr.sort((a, b) => {
      if (sortBy === "name") return a.studentName.localeCompare(b.studentName, "ru");
      if (sortBy === "hand") {
        const ah = a.handRaisedAt ? new Date(a.handRaisedAt).getTime() : 0;
        const bh = b.handRaisedAt ? new Date(b.handRaisedAt).getTime() : 0;
        return bh - ah;
      }
      if (sortBy === "activity") {
        const al = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
        const bl = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
        return bl - al;
      }
      if (sortBy === "strokes") return b.strokes - a.strokes;
      return 0;
    });
    return arr;
  })();

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="text-lg font-semibold">
          Класс ·{" "}
          <span className="text-dim font-normal">
            {joined} / {total} вошли
          </span>
        </h2>
        <SessionTimer />
        {error && <span className="text-red text-xs">синк: {error}</span>}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
          Все · {total}
        </FilterChip>
        <FilterChip
          active={filter === "active"}
          onClick={() => setFilter("active")}
        >
          Активные · {state.workspaces.filter((w) => w.status === "active").length}
        </FilterChip>
        <FilterChip
          active={filter === "hand"}
          onClick={() => setFilter("hand")}
          disabled={handsUp === 0}
          color="red"
        >
          <HandIcon className="w-3.5 h-3.5 inline-block -mt-0.5 mr-1" />
          Рука · {handsUp}
        </FilterChip>
        <FilterChip
          active={filter === "idle"}
          onClick={() => setFilter("idle")}
          disabled={idleCount === 0}
          color="yellow"
        >
          Завис · {idleCount}
        </FilterChip>
        <FilterChip
          active={filter === "submitted"}
          onClick={() => setFilter("submitted")}
          disabled={submitted === 0}
          color="green"
        >
          <CheckIcon className="w-3 h-3 inline-block -mt-0.5 mr-1" />
          Сдали · {submitted}
        </FilterChip>

        <span className="text-xs text-dim ml-3 mr-1">Сортировка:</span>
        <SortChip active={sortBy === "name"} onClick={() => setSortBy("name")}>
          по имени
        </SortChip>
        <SortChip active={sortBy === "hand"} onClick={() => setSortBy("hand")}>
          по руке
        </SortChip>
        <SortChip active={sortBy === "activity"} onClick={() => setSortBy("activity")}>
          по активности
        </SortChip>
        <SortChip active={sortBy === "strokes"} onClick={() => setSortBy("strokes")}>
          по штрихам
        </SortChip>

        <button
          onClick={() => setHelpOpen(true)}
          className="ml-auto w-7 h-7 grid place-items-center rounded-full border border-rule text-dim hover:bg-rule/40 transition text-sm font-medium"
          title="Горячие клавиши"
          aria-label="Горячие клавиши"
        >
          ?
        </button>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-7 gap-3">
        {filtered.length === 0 ? (
          <div className="col-span-full text-dim text-center py-12">
            По выбранному фильтру никого нет.
          </div>
        ) : (
          filtered.map((w) => <Tile key={w.id} w={w} />)
        )}
      </div>

      {/* тосты — фиксированный стек справа-снизу */}
      <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-50 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="px-4 py-3 rounded-xl bg-red text-paper text-sm font-medium shadow-lg animate-in slide-in-from-bottom-3"
          >
            {t.text}
          </div>
        ))}
      </div>

      {helpOpen && (
        <div
          className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-4"
          onClick={() => setHelpOpen(false)}
        >
          <div
            className="bg-paper rounded-2xl border border-rule shadow-xl max-w-sm w-full p-6"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Горячие клавиши"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">Горячие клавиши</h3>
              <button
                onClick={() => setHelpOpen(false)}
                className="text-dim hover:text-ink transition"
                aria-label="Закрыть"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <ul className="space-y-2.5 text-sm">
              <ShortcutRow keys={["A", "1"]} desc="Показать всех" />
              <ShortcutRow keys={["R"]} desc="Кто поднял руку" />
              <ShortcutRow keys={["Z"]} desc="Кто завис" />
              <ShortcutRow keys={["S"]} desc="Кто сдал работу" />
              <ShortcutRow keys={["Esc"]} desc="Сбросить фильтр" />
              <ShortcutRow keys={["?"]} desc="Эта справка" />
            </ul>
            <p className="text-xs text-dim mt-4">
              Работают на любой раскладке клавиатуры. Повторное нажатие фильтра —
              снова все.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function ShortcutRow({ keys, desc }: { keys: string[]; desc: string }) {
  return (
    <li className="flex items-center justify-between gap-4">
      <span className="text-ink/80">{desc}</span>
      <span className="flex gap-1">
        {keys.map((k) => (
          <kbd
            key={k}
            className="px-2 py-0.5 rounded border border-rule bg-chalk font-mono text-xs text-ink/70"
          >
            {k}
          </kbd>
        ))}
      </span>
    </li>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}

function Tile({ w }: { w: WorkspaceTile }) {
  const lastActive = w.lastActivityAt ? new Date(w.lastActivityAt) : null;
  const idleSec = lastActive
    ? Math.round((Date.now() - lastActive.getTime()) / 1000)
    : null;
  const isStale = idleSec != null && idleSec > 120 && w.status === "active";
  const handUp = !!w.handRaisedAt;

  // Вариант А (см. design/CRITIQUE.md): рамку усиливают ТОЛЬКО проблемы.
  // «Работает спокойно» — никаких колец, плитка не дребезжит.
  const ring = handUp
    ? "ring-2 ring-red shadow-md"
    : isStale
    ? "ring-2 ring-yellow-500"
    : "ring-1 ring-rule/60";

  // submitted — мягкое затемнение превью + угловая зелёная плашка.
  const previewDim = w.status === "submitted" ? "opacity-75" : "";

  return (
    <a
      href={`/s/${w.id}`}
      target="_blank"
      rel="noreferrer"
      className={`block rounded-lg bg-paper border border-rule overflow-hidden hover:shadow-md transition ${ring}`}
      title={`${w.studentName} — ${w.strokes} штрихов`}
    >
      <div className={`aspect-[3/4] relative bg-chalk ${previewDim}`}>
        {w.previewUpdatedAt ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/workspaces/${w.id}/preview?page=${w.previewPageIndex ?? 0}&v=${encodeURIComponent(w.previewUpdatedAt)}`}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <StubPreview kind={w.templateKind} strokes={w.strokes} />
        )}
        {w.previewPageIndex != null && w.previewPageIndex > 0 && (
          <div
            className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-toolbar/85 text-paper text-[10px] font-mono"
            title="Страница, на которой пишет ученик"
          >
            стр {w.previewPageIndex + 1}
          </div>
        )}
        {w.status === "not_joined" && (
          <div className="absolute inset-0 flex items-center justify-center text-dim text-xs bg-chalk/85">
            не вошёл
          </div>
        )}
        {handUp && (
          <div
            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red text-paper flex items-center justify-center shadow-lg animate-pulse"
            title="Поднял руку"
            aria-label="Поднял руку"
          >
            <HandIcon className="w-3.5 h-3.5" />
          </div>
        )}
        {w.status === "submitted" && (
          <div
            className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-green text-paper grid place-items-center"
            title="Работа сдана"
            aria-label="Работа сдана"
          >
            <CheckIcon className="w-3 h-3" />
          </div>
        )}
      </div>
      <div className="px-2 py-1.5 text-xs flex items-center justify-between">
        <span className="truncate">{w.studentName}</span>
        <span className="text-dim ml-2">{w.strokes}</span>
      </div>
    </a>
  );
}

// Минимальные inline-иконки — заменяем эмодзи. Lucide-style геометрия.
function HandIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M12 11V4.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M15 11V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1a6 6 0 0 1-5.5-3.6L4 13a1.5 1.5 0 0 1 2.7-1.3L9 14" />
    </svg>
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

function StubPreview({ kind, strokes }: { kind: string; strokes: number }) {
  // визуальный плейсхолдер: интенсивность зависит от количества штрихов
  const intensity = Math.min(strokes / 80, 1);
  const bg =
    kind === "blank_coord"
      ? "linear-gradient(to right, #d8dee9 1px, transparent 1px), linear-gradient(to bottom, #d8dee9 1px, transparent 1px)"
      : kind === "blank_lined"
      ? "linear-gradient(to bottom, transparent calc(100% - 1px), #d8dee9 calc(100% - 1px))"
      : "linear-gradient(to right, #d8dee9 1px, transparent 1px), linear-gradient(to bottom, #d8dee9 1px, transparent 1px)";

  return (
    <div
      className="absolute inset-0"
      style={{
        backgroundImage: bg,
        backgroundSize: kind === "blank_lined" ? "100% 8px" : "6px 6px",
      }}
    >
      <div
        className="absolute inset-2 rounded-sm"
        style={{
          backgroundColor: "rgba(12,13,16,0.04)",
          opacity: intensity,
        }}
      />
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  disabled,
  color,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  color?: "red" | "green" | "yellow";
  children: React.ReactNode;
}) {
  const palette =
    active && color === "red"
      ? "bg-red text-paper border-red"
      : active && color === "green"
        ? "bg-green text-paper border-green"
        : active && color === "yellow"
          ? "bg-yellow-400 text-ink border-yellow-400"
          : active
            ? "bg-ink text-paper border-ink"
            : "bg-paper border-rule hover:bg-rule/40";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1 rounded-full border text-xs font-medium transition disabled:opacity-40 disabled:cursor-not-allowed ${palette}`}
    >
      {children}
    </button>
  );
}

function SortChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 rounded text-xs transition ${
        active ? "bg-ink text-paper" : "text-dim hover:bg-rule/40"
      }`}
    >
      {children}
    </button>
  );
}

function SessionTimer() {
  const [now, setNow] = useState(Date.now());
  const startRef = useRef<number>(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const sec = Math.max(0, Math.floor((now - startRef.current) / 1000));
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toString().padStart(2, "0");
  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-paper border border-rule text-sm font-mono text-ink/80"
      title="Время с момента, как вы открыли мозаику"
    >
      <ClockIcon className="w-3.5 h-3.5" />
      {m}:{s}
    </span>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 16 14" />
    </svg>
  );
}
