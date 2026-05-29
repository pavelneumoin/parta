# Парта

**Цифровая тетрадь для класса.** Видно каждого. Слышно никого.

28 учеников — 28 рабочих листов на экране учителя в реальном времени. Ученик пишет — учитель видит. Подсказать тихо красным поверх работы, не вызывая к доске.

---

## Стек

| Слой | Технология |
|---|---|
| Framework | Next.js 15 (App Router, React 19) |
| Language | TypeScript 5 strict |
| Database | Prisma 6 + SQLite (dev) / PostgreSQL (prod) |
| Auth | Auth.js v5 (Credentials + JWT) |
| Handwriting | perfect-freehand + Pointer Events API |
| Styles | Tailwind CSS 3 (кастомная палитра) |
| Tests | Vitest (unit + integration) |
| PDF | pdf.js (client render), pdf-lib (server) |

## Структура репо

```
Parta/
├── web/                    ← основное Next.js приложение
│   ├── prisma/
│   │   ├── schema.prisma   ← доменная модель
│   │   ├── migrations/     ← история миграций
│   │   └── seed.ts         ← demo-данные
│   ├── src/
│   │   ├── app/
│   │   │   ├── api/        ← REST-эндпоинты
│   │   │   ├── app/        ← защищённые страницы учителя /app/*
│   │   │   ├── s/[wsid]/   ← холст ученика (без авторизации)
│   │   │   ├── j/[code]/   ← вход по коду / QR
│   │   │   ├── pricing/    ← страница цен
│   │   │   ├── about/      ← о проекте
│   │   │   └── page.tsx    ← лендинг
│   │   ├── components/     ← переиспользуемые компоненты
│   │   └── lib/            ← stamps, rateLimit, stroke, qr, ...
│   ├── docker-compose.yml  ← локальная Postgres для разработки
│   └── .env.example        ← пример переменных окружения
├── design/
│   ├── PROMPT.md           ← дизайн-бриф
│   └── CRITIQUE.md         ← разбор UI/UX
├── prototype/              ← ранний HTML-прототип рукописного ввода
├── STATUS.md               ← текущее состояние проекта
└── NIGHT_PLAN.md           ← план ночной разработки
```

## Быстрый старт

### Предварительные требования

- Node.js ≥ 20
- npm ≥ 10

### 1. Установить зависимости

```bash
cd Parta/web
npm install
```

### 2. Настроить переменные окружения

```bash
cp .env.example .env.local
```

Отредактировать `.env.local`:
```env
DATABASE_URL="file:./dev.db"
AUTH_SECRET="любая-строка-минимум-32-символа"
AUTH_URL="http://localhost:3030"
```

В `prisma/schema.prisma` убедитесь, что провайдер — `sqlite`:
```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}
```

### 3. Инициализировать базу данных

```bash
npm run db:push    # применить схему (без миграций, для dev)
npm run db:seed    # создать demo@parta.ru / demo123
```

### 4. Запустить

```bash
npm run dev
# → http://localhost:3030
```

Войти: **demo@parta.ru** / **demo123**

### 5. Протестировать e2e (5 минут)

1. Войти → Уроки → «Линейные уравнения» → **▶ Начать**
2. На второй вкладке открыть `http://localhost:3030/j/<код>`
3. Выбрать ученика → написать на холсте
4. Вернуться к учителю — плитка ученика обновится с превью

## Команды

| Команда | Описание |
|---|---|
| `npm run dev` | Dev-сервер на порту 3030 |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit-тесты |
| `npm run db:push` | Синхронизировать схему (dev) |
| `npm run db:migrate` | Создать migration (dev) |
| `npm run db:migrate-prod` | Применить миграции в prod (`prisma migrate deploy`) |
| `npm run db:reset` | Сбросить БД (dev only!) |
| `npm run db:seed` | Заполнить demo-данными |
| `npm run db:studio` | Prisma Studio (GUI) |

## Ключевые архитектурные решения

### Рукописный ввод
- `perfect-freehand` строит сглаженные SVG-path из точек `[x, y, pressure]`
- Palm rejection: блокируем `touch`, пропускаем `pen` и `mouse`
- Штрихи хранятся как `Json` в Prisma (массив точек)
- Синхронизация: polling каждые 600 мс (не WebSocket — меньше сложности)

### Слои (layers)
- Каждый штрих — `layer: "student" | "teacher"`
- Сервер enforce'ит роль независимо от клиента
- Учительский overlay (красный) видят только ученик и учитель этого workspace

### Штампы учителя
- `lib/stamps.ts` — 4 типа (+/−/?/✓), пакет из 1-2 готовых штрихов
- Ставятся кликом, генерируют обычные штрихи — без отдельной логики
- 14 unit-тестов покрывают все форматы и функцию `stampToStrokes`

### Превью мозаики
- Ученик каждые 4 сек рендерит офф-скрин canvas `200×280 PNG`, отправляет как base64
- Учитель получает мозаику через polling 2.5 сек
- PNG хранится в `WorkspacePreview.pngBytes` (Bytes, ≤80 КБ)

### Rate limiting
- In-memory sliding window (60 сек окно)
- 120 req/min на `/api/strokes` (по IP)
- 60 req/min на `/api/sessions/.../broadcast` (по teacherId)
- `lib/rateLimit.ts` с автоматическим GC каждые 10 мин

## Переменные окружения

| Переменная | Описание |
|---|---|
| `DATABASE_URL` | Строка подключения (SQLite или PostgreSQL) |
| `AUTH_SECRET` | Секрет Auth.js (мин. 32 символа) |
| `AUTH_URL` | Базовый URL для OAuth callback |
| `S3_ENDPOINT` | (опционально) S3-хранилище для PDF |
| `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | S3-реквизиты |

## Production

### Переключение на PostgreSQL

1. Заменить провайдер в `schema.prisma`:
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

2. Запустить миграции:
```bash
npm run db:migrate-prod
```

### Локальная Postgres (Docker)

```bash
docker compose up -d
# credentials: parta/parta@localhost:5432/parta
```

### Healthcheck

`GET /api/health` возвращает:
```json
{ "status": "ok", "uptime_ms": 12345, "uptime_s": 12, "db": "ok", "ts": "..." }
```

Статус 503 при недоступности БД.

## Что работает

- Создание классов, учеников, уроков (PDF + встроенные шаблоны)
- QR-вход ученика без регистрации
- Рукописный ввод с palm rejection и multi-page PDF
- Live-мозаика учителя (real-time превью 28 листов)
- Учительский overlay красным поверх работы ученика
- «Подсказка всему классу» (broadcast одного штриха)
- Штампы учителя (+/−/?/✓)
- Текстовые комментарии к работам
- «Поднять руку» + индикатор в мозаике
- «Сдать работу» + галерея сданных работ
- Экспорт: PNG одной страницы, ZIP всего класса
- Аналитика класса за 7 дней (отстающие, % сдачи)
- Rate limiting, /api/health, PWA manifest
- 22 unit-теста (stamps + rateLimit)

## Лицензия

Proprietary. © 2026 Парта.
