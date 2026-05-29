import { describe, it, expect } from "vitest";
import { parseStudentNames } from "./parseStudents";

describe("parseStudentNames — базовое", () => {
  it("разбивает по строкам и тримит", () => {
    expect(parseStudentNames("Иванов Иван\n  Петров Пётр  \nСидоров Семён")).toEqual([
      "Иванов Иван",
      "Петров Пётр",
      "Сидоров Семён",
    ]);
  });

  it("пропускает пустые строки", () => {
    expect(parseStudentNames("Иванов\n\n\nПетров\n   \n")).toEqual(["Иванов", "Петров"]);
  });

  it("пустой ввод → пустой массив", () => {
    expect(parseStudentNames("")).toEqual([]);
    expect(parseStudentNames("   \n  \n")).toEqual([]);
  });

  it("обрабатывает \\r\\n (Windows-переносы)", () => {
    expect(parseStudentNames("Иванов\r\nПетров")).toEqual(["Иванов", "Петров"]);
  });
});

describe("parseStudentNames — нумерация из журнала", () => {
  it("снимает «1.» «2)» «3 -»", () => {
    const raw = "1. Иванов Иван\n2) Петров Пётр\n3 - Сидоров Семён";
    expect(parseStudentNames(raw)).toEqual(["Иванов Иван", "Петров Пётр", "Сидоров Семён"]);
  });

  it("снимает число + пробел и число + таб", () => {
    expect(parseStudentNames("1 Иванов Иван\n2\tПетров Пётр")).toEqual([
      "Иванов Иван",
      "Петров Пётр",
    ]);
  });

  it("снимает многозначную нумерацию", () => {
    expect(parseStudentNames("10. Иванов\n11. Петров")).toEqual(["Иванов", "Петров"]);
  });

  it("отбрасывает строки из одного числа (колонка №)", () => {
    expect(parseStudentNames("1\n2\n3")).toEqual([]);
  });
});

describe("parseStudentNames — CSV / Excel", () => {
  it("склеивает «Фамилия, Имя» в одно ФИО", () => {
    expect(parseStudentNames("Иванов, Иван\nПетров, Пётр")).toEqual([
      "Иванов Иван",
      "Петров Пётр",
    ]);
  });

  it("обрабатывает точку с запятой (русский Excel CSV)", () => {
    expect(parseStudentNames("Иванов;Иван;Иванович")).toEqual(["Иванов Иван Иванович"]);
  });

  it("обрабатывает табуляцию (копипаст из Excel)", () => {
    expect(parseStudentNames("Иванов\tИван\nПетров\tПётр")).toEqual([
      "Иванов Иван",
      "Петров Пётр",
    ]);
  });

  it("комбинация нумерации и CSV", () => {
    expect(parseStudentNames("1. Иванов, Иван\n2. Петров, Пётр")).toEqual([
      "Иванов Иван",
      "Петров Пётр",
    ]);
  });
});

describe("parseStudentNames — кавычки и пробелы", () => {
  it("снимает двойные кавычки", () => {
    expect(parseStudentNames('"Иванов Иван"')).toEqual(["Иванов Иван"]);
  });

  it("снимает ёлочки «»", () => {
    expect(parseStudentNames("«Иванов Иван»")).toEqual(["Иванов Иван"]);
  });

  it("схлопывает повторные пробелы", () => {
    expect(parseStudentNames("Иванов    Иван")).toEqual(["Иванов Иван"]);
  });
});

describe("parseStudentNames — заголовки и дубли", () => {
  it("пропускает строку-заголовок «ФИО»", () => {
    expect(parseStudentNames("ФИО\nИванов Иван")).toEqual(["Иванов Иван"]);
  });

  it("пропускает «Список класса» в любом регистре", () => {
    expect(parseStudentNames("СПИСОК КЛАССА\nИванов")).toEqual(["Иванов"]);
  });

  it("убирает точные дубли без учёта регистра", () => {
    expect(parseStudentNames("Иванов Иван\nиванов иван\nПетров")).toEqual([
      "Иванов Иван",
      "Петров",
    ]);
  });
});

describe("parseStudentNames — лимиты", () => {
  it("обрезает длинное имя до maxNameLength", () => {
    const long = "Я".repeat(100);
    const [name] = parseStudentNames(long, { maxNameLength: 80 });
    expect(name.length).toBe(80);
  });

  it("ограничивает количество maxCount", () => {
    const raw = Array.from({ length: 50 }, (_, i) => `Ученик ${i}`).join("\n");
    expect(parseStudentNames(raw, { maxCount: 10 })).toHaveLength(10);
  });
});

describe("parseStudentNames — реалистичная вставка из журнала", () => {
  it("чистит грязный список целиком", () => {
    const raw = [
      "Список класса 7А",
      "№\tФИО",
      "1.\tАбрамова, Анна",
      "2.\tБорисов Борис",
      '3. "Власова Вера"',
      "",
      "4.  Громов   Глеб  ",
      "Абрамова, Анна", // дубль
    ].join("\n");
    expect(parseStudentNames(raw)).toEqual([
      "Абрамова Анна",
      "Борисов Борис",
      "Власова Вера",
      "Громов Глеб",
    ]);
  });
});
