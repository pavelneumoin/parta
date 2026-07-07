// Реестр предметных инструментов доски: метаданные без React/DOM.
// Используется дровером (список), слоем виджетов (диспатч) и API (валидация kind).

export type BoardSubject = "math" | "geom" | "inf" | "prob" | "lesson";

export const BOARD_SUBJECTS: { id: BoardSubject; name: string }[] = [
  { id: "math", name: "Математика" },
  { id: "geom", name: "Геометрия" },
  { id: "inf", name: "Информатика" },
  { id: "prob", name: "Вер/стат" },
  { id: "lesson", name: "Урок" },
];

export type InstrumentMeta = {
  kind: string;
  subject: BoardSubject;
  name: string;
  /** содержимое <svg viewBox="0 0 24 24"> для кнопки дровера */
  icon: string;
  defaultState: Record<string, unknown>;
};

export const INSTRUMENTS: InstrumentMeta[] = [
  // -------- математика
  {
    kind: "plot", subject: "math", name: "График функции",
    icon: '<path d="M3 20h18M4 20V4"/><path d="M4 16c4 0 4-9 8-9s4 6 8 6"/>',
    defaultState: { expr: "x^2/4 - 2" },
  },
  {
    kind: "numline", subject: "math", name: "Числовая прямая",
    icon: '<path d="M3 12h18m-2-3 3 3-3 3"/><circle cx="8" cy="12" r="1.6" fill="currentColor"/><circle cx="14" cy="12" r="1.6"/>',
    defaultState: { spec: "[-2); [1; 4" },
  },
  {
    kind: "fraction", subject: "math", name: "Дроби наглядно",
    icon: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5V12l6 6"/>',
    defaultState: { num: 3, den: 8 },
  },
  {
    kind: "trig", subject: "math", name: "Тригонометрический круг",
    icon: '<circle cx="12" cy="12" r="8.5"/><path d="M12 12l7-4M12 12h8.5M19 8v4"/>',
    defaultState: { deg: 30 },
  },
  // -------- геометрия
  {
    kind: "triangle", subject: "geom", name: "Треугольник ABC",
    icon: '<path d="M12 4 3.5 19h17z"/>',
    defaultState: { pts: [[60, 200], [250, 200], [120, 40]] },
  },
  {
    kind: "circle", subject: "geom", name: "Окружность",
    icon: '<circle cx="12" cy="12" r="8"/><path d="M12 12h8"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/>',
    defaultState: { r: 84 },
  },
  {
    kind: "protractor", subject: "geom", name: "Транспортир",
    icon: '<path d="M4 16a8 8 0 0 1 16 0z"/><path d="M12 16V8m4.9 8-1.2-3M7.1 16l1.2-3"/>',
    defaultState: { rot: 0 },
  },
  {
    kind: "ruler", subject: "geom", name: "Линейка · 10 см",
    icon: '<rect x="3" y="9" width="18" height="6" rx="1"/><path d="M7 9v3m4-3v3m4-3v3"/>',
    defaultState: {},
  },
  // -------- информатика
  {
    kind: "code", subject: "inf", name: "Код Python",
    icon: '<path d="m8 8-4 4 4 4m8-8 4 4-4 4M13.5 5l-3 14"/>',
    defaultState: {
      src: "def count(a, b):\n    # задание 23\n    if a == b:\n        return 1\n    if a > b:\n        return 0\n    return count(a+1, b) + count(a*2, b)\n\nprint(count(2, 20))",
    },
  },
  {
    kind: "bases", subject: "inf", name: "Системы счисления",
    icon: '<path d="M4 7h7M4 12h7M4 17h7"/><path d="M15 7h5M15 12h5M15 17h5" stroke-dasharray="1.5 2.5"/>',
    defaultState: { value: "156", from: 10 },
  },
  {
    kind: "tree", subject: "inf", name: "Дерево (клик — ветвить)",
    icon: '<circle cx="12" cy="5" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M10.8 7 7 15.7M13.2 7 17 15.7"/>',
    defaultState: { root: { label: "2", children: [] } },
  },
  {
    kind: "truth", subject: "inf", name: "Таблица истинности",
    icon: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 9.5h16M4 15h16M12 4v16"/>',
    defaultState: { expr: "(A or B) and not C" },
  },
  // -------- вероятность и статистика
  {
    kind: "dice", subject: "prob", name: "Кубик и монета",
    icon: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1.3" fill="currentColor"/><circle cx="15" cy="15" r="1.3" fill="currentColor"/><circle cx="15" cy="9" r="1.3" fill="currentColor"/><circle cx="9" cy="15" r="1.3" fill="currentColor"/>',
    defaultState: { face: null, history: [] },
  },
  {
    kind: "chart", subject: "prob", name: "Диаграмма",
    icon: '<path d="M4 20h16M6 20v-6m4 6V8m4 12v-9m4 9V5"/>',
    defaultState: { data: "5, 3, 8, 2, 6" },
  },
  // -------- урок
  {
    kind: "timer", subject: "lesson", name: "Таймер",
    icon: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2.5h6"/>',
    defaultState: { running: false, endsAt: null, leftSec: 900, durSec: 900 },
  },
  {
    kind: "picker", subject: "lesson", name: "Случайный ученик",
    icon: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
    defaultState: { names: "", current: null, used: [] },
  },
  {
    kind: "light", subject: "lesson", name: "Светофор тишины",
    icon: '<rect x="8" y="3" width="8" height="18" rx="4"/><circle cx="12" cy="7.5" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="16.5" r="1.6"/>',
    defaultState: { idx: 0 },
  },
];

export const INSTRUMENT_KINDS = INSTRUMENTS.map((i) => i.kind);
export const instrumentMeta = (kind: string) => INSTRUMENTS.find((i) => i.kind === kind) ?? null;
