/**
 * Разбор «сырого» списка учеников, вставленного учителем.
 *
 * Учителя копируют списки из самых разных мест — электронного журнала,
 * Excel, Word, бумажки. Цель: чтобы вставка «как есть» просто работала,
 * без ручной чистки. Поддерживаем:
 *
 *  - перенос строки как разделитель учеников;
 *  - колонку «№» и нумерацию: `1.` `1)` `1 -` `№` + таб/пробел;
 *  - CSV/TSV-разбивку ФИО: запятая, точка с запятой, табуляция
 *    («Иванов, Иван» / «Иванов;Иван;Петрович» / «Иванов\tИван» → «Иванов Иван …»);
 *  - кавычки вокруг имени (" ' «»);
 *  - схлопывание повторных пробелов;
 *  - пропуск строк-заголовков («ФИО», «Список класса 7А», «Name» …);
 *  - дедупликацию (без учёта регистра) в пределах вставки.
 */

// Заголовки-точное совпадение (после нормализации, в нижнем регистре).
const HEADER_EXACT = new Set([
  "фио",
  "ф.и.о.",
  "фи",
  "имя",
  "ученик",
  "ученики",
  "учащиеся",
  "фамилия",
  "фамилия имя",
  "фамилия имя отчество",
  "name",
  "names",
  "student",
  "students",
  "full name",
]);

// Заголовки-префиксы: строка, начинающаяся с одного из них, — заголовок.
// («Список класса 7А», «List of students»).
const HEADER_PREFIXES = ["список", "list of"];

// Нумерация в начале одиночной строки: «1.», «12)», «3 -», «4 –» + пробел.
const LEADING_NUMBER = /^\s*\d+\s*[.)\-–—]?\s+/;
// Токен-маркер первой колонки: «№», «#», «1», «1.», «12)».
const COLUMN_MARKER = /^(?:[№#]|\d+\s*[.)\-–—]?)$/;
// Строка целиком из числа (артефакт колонки «№»).
const ONLY_NUMBER = /^\s*\d+\s*$/;

export type ParseStudentsOptions = {
  /** Максимальная длина одного имени (символов). По умолчанию 80. */
  maxNameLength?: number;
  /** Максимум имён за раз. По умолчанию 200. */
  maxCount?: number;
};

/**
 * Превращает «сырой» текст в чистый список имён.
 * Гарантии: без пустых строк, без дублей (case-insensitive), порядок сохранён.
 */
export function parseStudentNames(
  raw: string,
  opts: ParseStudentsOptions = {},
): string[] {
  const maxNameLength = opts.maxNameLength ?? 80;
  const maxCount = opts.maxCount ?? 200;

  const out: string[] = [];
  const seen = new Set<string>();

  for (const line of raw.split(/\r?\n/)) {
    const name = normalizeLine(line);
    if (!name) continue;
    if (isHeader(name)) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    out.push(name.slice(0, maxNameLength).trim());
    if (out.length >= maxCount) break;
  }

  return out;
}

/** Нормализует одну строку в имя или возвращает "" если строку надо пропустить. */
function normalizeLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) return "";

  // 1. Разбиваем строку на колонки по табам / запятым / точкам с запятой.
  let tokens = trimmed
    .split(/[,;\t]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  // 2. Если первая колонка — маркер «№» / номер, отбрасываем её.
  if (tokens.length > 1 && COLUMN_MARKER.test(tokens[0])) {
    tokens = tokens.slice(1);
  }

  // 3. Склеиваем колонки ФИО пробелом.
  let s = tokens.join(" ");

  // 4. Снимаем инлайн-нумерацию одиночной строки («1. Иванов»).
  s = s.replace(LEADING_NUMBER, "");

  // 5. Снимаем парные кавычки (после удаления номера).
  s = stripWrappingQuotes(s);

  // 6. Схлопываем повторные пробелы.
  s = s.replace(/\s+/g, " ").trim();

  // 7. Остаточный чистый номер — мусор.
  if (ONLY_NUMBER.test(s)) return "";

  return s;
}

function isHeader(name: string): boolean {
  const low = name.toLowerCase();
  if (HEADER_EXACT.has(low)) return true;
  return HEADER_PREFIXES.some((p) => low.startsWith(p));
}

function stripWrappingQuotes(s: string): string {
  if (s.length >= 2) {
    const first = s[0];
    const last = s[s.length - 1];
    if (
      (first === '"' && last === '"') ||
      (first === "'" && last === "'") ||
      (first === "«" && last === "»")
    ) {
      return s.slice(1, -1).trim();
    }
  }
  return s;
}
