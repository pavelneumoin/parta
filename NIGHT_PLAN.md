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
- [x] **It-3. Accessibility-аудит** — измерил контраст в браузере: `dim` #7a7468 давал 4.44:1 на paper (FAIL WCAG AA), заменён на #6f695d (5.22:1 paper / 4.82:1 chalk — PASS на обоих фонах). Добавил глобальное `:focus-visible` кольцо (accent) для клавиатуры в globals.css. `<html lang="ru">` уже был. Проверено: computed `.text-dim` = rgb(111,105,93), CSS пересобран. *(maximumScale=1/userScalable=false на canvas — осознанное решение, не трогаю; иконки уже с aria-label из It-2.)*
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

- [x] **It-16. Аудит TODO/FIXME** — Grep по TODO/FIXME/console: только намеренный `console.info` в PdfBackground + документированные eslint-disable. Реальных долгов нет.
- [x] **It-17. README.md + CONTRIBUTING.md** — README переписан с нуля (quickstart, архитектура, команды, переменные), `CONTRIBUTING.md` добавлен (стандарты кода, палитра, тесты, правила API).
- [x] **It-18. Промежуточная сводка** — STATUS.md: новая секция «Прирост It-1…It-17», typecheck чисто, unit-тесты зелёные.

### Утро (10 итераций; расширение продукта)

- [ ] **It-19. Toast-система** — заменить нативный `confirm()` и `alert` в коде на дизайн-системные тосты (`useToast` хук + контейнер в layout). Особенно «Сдать работу?», «Закрыть урок?», «Удалить ученика?».
- [x] **It-20. Onboarding-визард для нового учителя** — `/app/welcome`: 3-шаговый прогресс (класс → урок → провести), шаги отмечаются галочкой по реальным данным (count классов/уроков/сессий), CTA только на текущем шаге, skip-ссылка. Баннер «Первый раз в Парте?» на дашборде при 0 классов. Проверено: demo = «Вы освоились» (3 галочки), баннер скрыт. *(Авто-redirect после signup НЕ делаю — мягкий баннер безопаснее, без риска B4-класса багов.)*
- [x] **It-21. Импорт учеников из CSV/XLSX** — `lib/parseStudents.ts` (устойчивый парсер: нумерация журнала, табы/запятые/точки с запятой из Excel, кавычки, заголовки, дедуп) + **21 unit-тест**; вшит в `createClassAction` и `addStudentsAction` (+пропуск уже добавленных), обновлены подсказки в обеих формах.
- [x] **It-22. Аналитика учителя «За месяц»** — `/app/stats`: 4 метрики (уроков/листов/сдано/% сдачи), SVG bar-chart уроков по дням (30 дней), таблица по классам. Empty + populated ветки проверены в браузере (1 урок · 12 листов · 0%). Ссылка «Сводка» в AppHeader.
- [x] **It-23. Keyboard shortcuts на сессии** — горячие клавиши мозаики через `e.code` (любая раскладка): `A`/`1` все, `R` рука, `Z` завис, `S` сдали, `Esc` сброс, `?` справка-оверлей. Кнопка «?» в панели фильтров. Проверено в браузере (?, Esc, R). *(B/broadcast и Esc→«Закрыть урок» живут в др. компонентах — вне SessionMosaic, отложено.)*
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
| 16-17 | 13:40 | 13:54 | TODO-аудит (чисто), README переписан, CONTRIBUTING.md добавлен |
| 18 | 13:54 | 14:00 | STATUS.md: секция «Прирост It-1…It-17» |
| 21 | 14:00 | 14:20 | parseStudents.ts (журнал/Excel/CSV) + 21 тест, вшит в actions, дедуп существующих |
| 22 | 14:20 | 14:45 | /app/stats: метрики + SVG bar-chart + таблица по классам; ссылка в AppHeader |
| 23 | 14:45 | 15:10 | Горячие клавиши мозаики (e.code, любая раскладка) + справка-оверлей «?» |
| verify | 15:10 | 15:30 | Браузерная проверка It-21/22/23 на demo: парсер, обе ветки stats, шорткаты ?/Esc/R. Почищен .next (corruption на YandexDisk), демо-данные восстановлены |
| 20 | 15:30 | 15:50 | /app/welcome (3-шаговый онбординг по реальным данным) + баннер новичка; проверено в браузере |
| 3 | 15:50 | 16:15 | a11y: dim до WCAG AA (#6f695d), :focus-visible кольцо; контраст измерен и проверен в браузере |

(заполняется после каждой итерации)
