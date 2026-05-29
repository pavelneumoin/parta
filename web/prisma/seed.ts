/**
 * Парта · seed демо-данных для разработки.
 *
 * Запуск: `npm run db:seed`
 *
 * Создаёт:
 * - демо-учителя demo@parta.ru / demo123
 * - класс «7А» с 12 учениками
 * - 3 шаблонных урока
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  const email = "demo@parta.ru";
  const passwordHash = await bcrypt.hash("demo123", 10);

  const teacher = await db.teacher.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: "Демо Учитель",
      passwordHash,
    },
  });
  console.log("✔ teacher:", teacher.email);

  // класс
  let klass = await db.class.findFirst({
    where: { teacherId: teacher.id, name: "7А" },
  });
  if (!klass) {
    const names = [
      "Иванов Иван",
      "Петрова Анна",
      "Сидоров Сергей",
      "Кузнецова Мария",
      "Смирнов Олег",
      "Васильева Ольга",
      "Морозов Артём",
      "Новикова Дарья",
      "Фёдоров Никита",
      "Алексеева Елена",
      "Михайлов Павел",
      "Лебедева Полина",
    ];
    klass = await db.class.create({
      data: {
        teacherId: teacher.id,
        name: "7А",
        grade: 7,
        subject: "math",
        students: {
          create: names.map((fullName) => ({
            fullName,
            anonToken:
              "demo-" +
              fullName.replace(/[^a-zA-Zа-яА-Я]/g, "").toLowerCase() +
              "-" +
              Math.random().toString(36).slice(2, 8),
          })),
        },
      },
    });
    console.log("✔ class:", klass.name);
  } else {
    console.log("• class already exists:", klass.name);
  }

  // уроки
  const lessons = [
    { title: "Линейные уравнения", templateKind: "blank_grid", pageCount: 1 },
    { title: "Графики функций y=kx+b", templateKind: "blank_coord", pageCount: 1 },
    { title: "Теорема Пифагора · теория", templateKind: "blank_lined", pageCount: 2 },
  ];

  for (const l of lessons) {
    const exists = await db.lesson.findFirst({
      where: { teacherId: teacher.id, title: l.title },
    });
    if (!exists) {
      await db.lesson.create({
        data: { teacherId: teacher.id, ...l },
      });
      console.log("✔ lesson:", l.title);
    } else {
      console.log("• lesson already exists:", l.title);
    }
  }

  console.log("\nГотово. Войти:");
  console.log("  email:    demo@parta.ru");
  console.log("  password: demo123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
