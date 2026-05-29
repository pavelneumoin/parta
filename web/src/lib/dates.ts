/**
 * Утилиты для отображения дат в человеческом виде на русском.
 */

const MONTHS = [
  "янв", "фев", "мар", "апр", "май", "июн",
  "июл", "авг", "сен", "окт", "ноя", "дек",
];

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * "Сегодня в 10:30", "Завтра в 09:00", "Вчера", "25 мар в 14:00".
 */
export function formatScheduled(d: Date | string | null | undefined): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (isNaN(dt.getTime())) return "";

  const now = new Date();
  const todayStart = startOfDay(now).getTime();
  const dStart = startOfDay(dt).getTime();
  const diffDays = Math.round((dStart - todayStart) / 86400000);

  const hh = dt.getHours().toString().padStart(2, "0");
  const mm = dt.getMinutes().toString().padStart(2, "0");
  const time = `${hh}:${mm}`;

  if (diffDays === 0) return `Сегодня в ${time}`;
  if (diffDays === 1) return `Завтра в ${time}`;
  if (diffDays === -1) return `Вчера в ${time}`;
  if (diffDays > 1 && diffDays <= 6) {
    const days = ["воскр", "пн", "вт", "ср", "чт", "пт", "сб"];
    return `${days[dt.getDay()]} в ${time}`;
  }
  return `${dt.getDate()} ${MONTHS[dt.getMonth()]} в ${time}`;
}

/**
 * Сравнение даты с «сегодня».
 */
export function isToday(d: Date | string | null | undefined): boolean {
  if (!d) return false;
  const dt = typeof d === "string" ? new Date(d) : d;
  if (isNaN(dt.getTime())) return false;
  const now = new Date();
  return (
    dt.getFullYear() === now.getFullYear() &&
    dt.getMonth() === now.getMonth() &&
    dt.getDate() === now.getDate()
  );
}

/**
 * Сколько минут осталось до d. Может быть отрицательным.
 */
export function minutesUntil(d: Date | string): number {
  const dt = typeof d === "string" ? new Date(d) : d;
  return Math.round((dt.getTime() - Date.now()) / 60000);
}
