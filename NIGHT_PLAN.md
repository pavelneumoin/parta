# Парта · Ночной план 2026-05-27 → 2026-05-28

**Старт:** ~22:50. **Финиш:** 15:00 (обновлено пользователем в 00:55). **Окно:** ~28 итераций по 30 мин.

Правила автономки:
- Делать новые папки, ставить npm-пакеты, прогонять тесты, инициализировать миграции — можно.
- Push на main, чужие папки, платные API — нельзя.
- Перед коммитом — typecheck + vitest. Без зелёных тестов не двигаться дальше.

## Roadmap по приоритету

### Сегодня (8 итераций; критика + production basics)

- [x] **It-1. Общий AppHeader для /app/\*** — обновлены цвета SVG-логотипа (#1e6f5c вместо #4f7cff), активная навигация через `AppNavLink` client component с usePathname, aria-current, email справа с truncate. Бонус: вынес `STAMPS` в `@/lib/stamps`, написал 14 unit-тестов для штампов (все зелёные).
- [x] **It-2. UX-copy для пустых состояний** — Empty компоненты (lessons/classes/dashboard/lesson-detail) с иконкой+текстом+CTA; нативный `confirm()` заменён инлайн-подтверждением в StudentCanvas; `✋` заменён на SVG; логотип в StudentCanvas исправлен (#4f7cff→#1e6f5c); копи CloseSessionButton улучшена.
- [ ] **It-3. Accessibility-аудит** через `design:accessibility-review` — контраст палитры (WebAIM), touch targets ≥ 44×44, фокус-кольца, screen reader labels на иконках.
- [ ] **It-4. Тесты для штампов** — unit-тест placeStamp, integration-тест API (учитель ставит штамп, layer=teacher).
- [x] **It-5. Учительские текст-комментарии** — `Comment` модель (migration `20260529_teacher_comments`), API POST+GET `/api/workspaces/[id]/comments`, UI: учитель → кнопка 💬 Заметка + floating панель ввода, ученик → read-only карточки над листом (poll 10s).
- [x] **It-6. Просмотр submitted-работ отдельно** — `/app/session/[id]/submitted`: grid 5×N с PNG-превью, имя+время+число штрихов, ссылка на полный холст; кнопка «Сданные работы (N)» в хедере session-страницы.
- [x] **It-7. Healthcheck + рейт-лимит** — `/api/health` (DB ping + uptime + ts), `lib/rateLimit.ts` sliding-window (GC 10 мин), 120/мин на `/api/strokes`, 60/мин на `/api/sessions/.../broadcast`. +8 unit-тестов (22 всего).
- [x] **It-8. PWA манифест + meta-теги** — `app/manifest.ts` (Next.js auto-serve), `app/apple-icon.tsx` (180×180 ImageResponse), `layout.tsx` полный Metadata с openGraph/twitter/appleWebApp/manifest/robots.

### Ночь 2 (4 итерации; фичи + тесты)

- [x] **It-9. Postgres-готовность** — `docker-compose.yml` (postgres:16-alpine + healthcheck), `.env.example` расширен с комментариями SQLite/Postgres/prod, `db:migrate-prod` + `db:reset` + `db:generate` в package.json.
- [ ] **It-10. Замечания учителя — UI** — компонент `TeacherComments` в холсте ученика, ученик видит read-only.
- [ ] **It-11. E2E-тест критического потока** — Playwright/Vitest browser: signin → создание класса → урок → сессия → join ученика → штрих → submit. Один длинный happy-path тест.
- [ ] **It-12. Visual regression snapshots** — Vitest browser screenshots для лендинга, дашборда, мозаики.

### Ночь 3 (3 итерации; маркетинг + полировка)

- [x] **It-13. Лендинг секция «Как работает»** — 3 шага (SVG-иконки + текст) + PricingTeaser (2 карточки) в landing page; обновлён footer с ссылками.
- [x] **It-14. Страница «Цены»** — `/pricing`: 3 плана (0/590/990 ₽) с чекмарками, FAQ 4 вопроса.
- [x] **It-15. Страница «О проекте»** — `/about` (манифест, принципы), `/privacy` (policy), `/contact` (3 email-адреса + форма).

### Ночь 4 (3 итерации; полировка кода)

- [ ] **It-16. Аудит TODO/FIXME** в коде + почистка.
- [ ] **It-17. README.md + CONTRIBUTING.md** — для будущих разработчиков и open source.
- [ ] **It-18. Промежуточная сводка** — typecheck + lint + npm test + STATUS.md обновление.

### Утро (10 итераций; расширение продукта)

- [ ] **It-19. Toast-система** — заменить нативный `confirm()` и `alert` в коде на дизайн-системные тосты (`useToast` хук + контейнер в layout). Особенно «Сдать работу?», «Закрыть урок?», «Удалить ученика?».
- [ ] **It-20. Onboarding-визард для нового учителя** — первый вход после signup ведёт на `/app/welcome`: создай класс → импортируй учеников → создай первый урок → старт. Skip-кнопки.
- [ ] **It-21. Импорт учеников из CSV/XLSX** — кнопка на `/app/classes/[id]`, парсинг через SheetJS (если уже есть в зависимостях) или просто CSV. Превью + подтверждение.
- [ ] **It-22. Аналитика учителя «За месяц»** — `/app/stats` страница: уроки по дням, активные классы, средняя сдача. Простые bar-charts на чистом SVG.
- [ ] **It-23. Keyboard shortcuts на сессии** — `Esc` подсветить «Закрыть урок», `B` toggle broadcast, `R` фильтр «рука», `?` показывает список шорткатов.
- [ ] **It-24. Replay сессии (v0)** — таймлайн strokes за урок, кнопки play/pause, скорость 1×/2×/4×. Хотя бы каркас.
- [ ] **It-25. Шаблоны из библиотеки (v0)** — отдельная вкладка «Готовые шаблоны» в `/app/lessons/new`: 5-10 моковых заголовков с превью-картинкой (можно из `library/` если есть доступ). Click → создаёт lesson с этим templateKind.
- [ ] **It-26. Локализация (структура)** — `lib/i18n.ts` со словарём ru-RU, `t()` функция. Не переводим — готовим. Удобно потом сделать английскую версию для пилотов.
- [ ] **It-27. Footer-страницы** — `/about`, `/privacy`, `/contact`. Простые статичные с правильным мета.
- [ ] **It-28. Финальная сводка + презентация** — обновить STATUS.md, дописать README, сделать gallery-страницу скриншотов в `design/screenshots/`. Сводка для пользователя что появилось за ночь.

## Резервные задачи (если итерация быстрая)

- `web/AGENTS.md` — чек-лист из CRITIQUE.md для будущих экранов.
- Иконка `apple-icon.tsx` через ImageResponse.
- Защита от XSS в textarea (студенты потенциально пишут произвольный текст).
- Логирование событий (sessions opened/closed, joins, submits) в ActivityLog для будущей аналитики.
- Pluralize для «штрих/штриха/штрихов» (helper уже есть для «ученик» — добавить generic).

## Что НЕ делать ночью

- Не катить миграции БД с потерей данных. Если меняем модель — Prisma `--name new_field`, никаких `db push --force-reset`.
- Не переключать SQLite → Postgres «по-настоящему». Только подготовить.
- Не трогать demo-аккаунт `demo@parta.ru` (засеян в `seed.ts`).
- Не push на git без явной просьбы.

## Прогресс

| It | Started | Done | Что сделано |
|---|---|---|---|
| 0 | 22:40 | 22:45 | План написан |
| 1 | 22:50 | 00:55 | AppHeader (navlink active state, обновлены SVG-цвета), STAMPS вынесены в lib + 14 тестов |
| 2 | 07:50 | 08:00 | UX-copy: Empty-состояния с иконками/CTA, инлайн-confirm вместо alert(), SVG вместо ✋ |
| 7 | 08:00 | 08:10 | /api/health, rateLimit.ts (sliding-window + GC), rate-limit на strokes/broadcast, +8 тестов |
| 8 | 08:10 | 08:18 | manifest.ts, apple-icon.tsx (ImageResponse), layout.tsx: og/twitter/appleWebApp/robots meta |
| 9 | 08:18 | 08:25 | docker-compose.yml (postgres:16), .env.example расширен, package.json: db:migrate-prod/reset/generate |
| 6 | 08:25 | 08:35 | /session/[id]/submitted: grid превью сданных работ, PNG lazy-load, кнопка в хедере session-страницы |
| 5 | 08:35 | 08:55 | Comment модель + migration, API comments GET+POST, UI учитель(ввод)/ученик(read-only), poll 10s |
| 13-15 | 08:55 | 09:15 | Лендинг «Как работает» + PricingTeaser; /pricing, /about, /privacy, /contact |

(заполняется после каждой итерации)
