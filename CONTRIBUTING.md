# Contributing to Парта

Спасибо, что хотите помочь! Парта — небольшой инди-проект, поэтому процесс простой.

## Быстрый старт для разработчика

```bash
cd Parta/web
npm install
cp .env.example .env.local   # настроить DATABASE_URL + AUTH_SECRET
npm run db:push
npm run db:seed              # demo@parta.ru / demo123
npm run dev                  # http://localhost:3030
```

## Стандарты кода

### TypeScript
- Strict mode включён — никаких `any`, кроме крайних случаев
- Предпочитать `type` перед `interface` для объектов данных
- Явно типизировать пропсы компонентов

### Именование
- Файлы: `kebab-case.ts`, компоненты: `PascalCase.tsx`
- Серверные компоненты — без суффикса, клиентские — с комментарием `"use client"` в первой строке
- API-роуты: `src/app/api/...route.ts` — отвечают `Response.json()`

### Стили (Tailwind)
Кастомная палитра (определена в `tailwind.config.ts`):
```
paper      #fbfaf6   ← фон страниц
ink        #0f1115   ← основной текст
chalk      #f4f1e8   ← светлый фон карточек
rule       #e3dfd1   ← линии / бордеры
dim        #7a7468   ← вспомогательный текст
accent     #1e6f5c   ← активные элементы / ссылки
toolbar    #1c1f23   ← фон тулбаров
```

Использовать семантические токены (`bg-paper`, `text-dim`, `border-rule`) — не хардкодить `#hex`.

### Компоненты
- Переиспользуемые компоненты — в `src/components/`
- Компоненты страниц (server) — в папке маршрута, рядом с `page.tsx`
- Клиентские интерактивные части выносить в отдельный `*Client.tsx` или `*Button.tsx`

## Тесты

Перед коммитом — обязательно:
```bash
npm run typecheck   # tsc --noEmit — должен пройти без ошибок
npm test            # vitest — все юнит-тесты зелёные
```

Unit-тесты живут рядом с кодом: `lib/stamps.test.ts`, `lib/rateLimit.test.ts`.

Интеграционные тесты (требуют сервер на :3030) — в `src/**/*.integration.test.ts`.  
Запускаются отдельно: `npx vitest run --reporter=verbose src/lib/stamps.integration.test.ts`.

## Изменения базы данных

1. Отредактировать `prisma/schema.prisma`
2. Создать именованную миграцию:
   ```bash
   npm run db:migrate -- --name описание_изменения
   ```
3. Никогда не использовать `db:push` на базе с данными — только для свежего dev-окружения

Миграции в prod применяются через `npm run db:migrate-prod`.

## Структура API

| Метод | Аутентификация |
|---|---|
| Учитель-эндпоинты | Session через Auth.js (`auth()` сервер-сайд) |
| Ученик-эндпоинты | Anon-токен из `x-student-token` header |
| Публичные | Без аутентификации |

Rate limiting: IP-based для `/api/strokes` (120/мин), teacherId-based для broadcast (60/мин).

## Добавление нового API-маршрута

```ts
// src/app/api/example/route.ts
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  // ...
  return Response.json({ data });
}
```

## Добавление нового штампа

1. Отредактировать `src/lib/stamps.ts` — добавить новый ключ в `STAMPS`
2. Дописать unit-тест в `src/lib/stamps.test.ts`
3. Убедиться, что `placeStamp()` возвращает корректные `layer: "teacher"` штрихи

## Git

- Ветки: `feat/название`, `fix/название`
- Коммиты — по-русски или по-английски, главное — ясно
- PR — только после зелёного `typecheck + test`
- Не трогать `demo@parta.ru` в seed.ts

## Что сейчас в приоритете

Смотри [`NIGHT_PLAN.md`](./NIGHT_PLAN.md) — там актуальный roadmap с отмеченными итерациями.

## Вопросы

Пишите на hello@parta.ru.
