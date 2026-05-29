# Парта

Цифровая тетрадь для класса с live-наблюдением учителя.

**Не Miro, не LMS.** Один шаблон → 28 индивидуальных рабочих листов → мозаика учителя на одном экране → подсказка красным поверх работы ученика.

## Структура репо

```
Parta/
├── prototype/              ← standalone handwriting-прототип (1 HTML файл)
│   ├── handwriting.html    ← открыть в браузере или серве `python -m http.server`
│   └── TESTING.md          ← чек-лист тестирования на планшете
├── web/                    ← основное Next.js приложение
│   ├── src/
│   │   ├── app/            ← App Router: страницы и API
│   │   │   ├── (app)/      ← защищённая зона учителя (/app, /app/classes, /app/lessons, /app/session/[id])
│   │   │   ├── api/        ← REST API: strokes, sessions, workspaces
│   │   │   ├── j/[code]/   ← вход ученика по коду урока
│   │   │   ├── s/[wsid]/   ← ученический холст
│   │   │   ├── signin/     ← вход учителя
│   │   │   └── signup/     ← регистрация
│   │   ├── auth.ts         ← Auth.js v5 конфиг
│   │   ├── components/     ← переиспользуемые компоненты
│   │   ├── lib/            ← Prisma, токены, QR, штрихи
│   │   └── middleware.ts   ← защита /app, редиректы
│   ├── prisma/
│   │   ├── schema.prisma   ← доменная модель
│   │   ├── seed.ts         ← демо-данные
│   │   └── dev.db          ← SQLite БД (в .gitignore)
│   ├── .env                ← локальные переменные
│   └── package.json
├── STATUS.md               ← состояние работы ночи 2026-05-25/26
└── README.md               ← этот файл
```

## Быстрый старт

### 1. Прототип handwriting (без сборки, для тестов на планшете)

```powershell
cd E:\YA\YandexDisk\Parta\prototype
python -m http.server 8765
# открыть http://localhost:8765/handwriting.html
# c планшета — http://<IP-компа>:8765/handwriting.html
```

Чек-лист тестирования — в `prototype/TESTING.md`.

### 2. Полное приложение (Next.js)

```powershell
cd E:\YA\YandexDisk\Parta\web
npm install                # если ещё не делал
npm run dev                # запуск на http://localhost:3030
```

Демо-аккаунт уже засеян: `demo@parta.ru` / `demo123`.

В нём есть класс «7А» с 12 учениками и 3 шаблонных урока (клетка, координаты, линии).

### 3. End-to-end сценарий (5 минут)

1. Открой `http://localhost:3030` → **Войти** → demo@parta.ru / demo123.
2. На дашборде нажми **Уроки → «Линейные уравнения» → ▶ Начать**.
3. На экране — QR-код и 6-значный код (например, `347659`).
4. На втором устройстве (или вкладке) открой `http://localhost:3030/j/347659`.
5. Выбери ученика из списка → откроется его холст.
6. Напиши пером/пальцем.
7. Вернись на вкладку учителя → плитка ученика подсветится, счётчик штрихов растёт.

## Технологии

- **Next.js 15** (App Router, React 19)
- **Prisma 6** + **SQLite** (для dev; Postgres — для prod)
- **Auth.js v5** (Credentials, JWT-сессии)
- **perfect-freehand** (handwriting)
- **Pointer Events API** (stylus / touch / mouse)
- **Tailwind CSS 3** (без кастомных шрифтов)
- **TypeScript strict**

## Команды

```powershell
npm run dev          # запуск dev-сервера (порт 3030)
npm run build        # production-сборка
npm run typecheck    # tsc --noEmit
npm run test         # vitest run — unit-тесты (34 в текущем состоянии)
npm run test:watch   # vitest watch mode
npm run db:push      # обновить БД из schema
npm run db:migrate   # создать миграцию
npm run db:studio    # Prisma Studio (визуальный браузер БД)
npm run db:seed      # запустить seed.ts
```

## Что уже работает

- Создание классов, учеников, уроков (включая загрузку PDF)
- Стартовый QR + 6-значный код, вход ученика без регистрации
- Рукописный ввод (Canvas + perfect-freehand + Pointer Events + palm rejection)
- Multi-page PDF навигация
- Live-мозаика учителя с реальными PNG-превью (4 сек polling)
- Учительский overlay: красный поверх работы ученика
- «Подсказка всему классу» (broadcast одного штриха всем 28 ученикам)
- «Поднять руку» — кнопка ученика + тост учителю + индикатор в мозаике
- Стирание со синком (soft delete)
- Real-time закрытие сессии (без F5)
- Экспорт PNG одной страницы, ZIP всего класса
- «Сдать работу» — статус submitted, плитка с зелёным значком
- Финал-экран ученика после закрытия урока
- Расписание уроков + секция «Сегодня» на дашборде
- 34 unit-теста

## Что НЕ сделано (см. STATUS.md)

Это MVP, готовый к первому живому тесту с учениками. Точечные пропуски:
- WebSocket — пока polling 2.5–4 сек.
- Postgres + деплой — пока SQLite + localhost.
- Аналитика, замечания, шаблоны из библиотеки — V2.
- Server-side рендер PDF в высоком разрешении (ZIP содержит миниатюры 200×280).
- e2e-тесты Playwright — пока только unit + ручной smoke.

Подробности — в `STATUS.md`.
