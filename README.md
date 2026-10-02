# Verde Marea — бронирование столов

Локальная система бронирования столов ресторана Verde Marea: Next.js, TypeScript, Tailwind CSS, Zod, PostgreSQL, Prisma.

Спецификация — [SPEC.md](SPEC.md), план — [Plan.md](Plan.md), дизайн — [design.md](design.md), журнал проверок — [CHECKS.md](CHECKS.md).

> Статус: готовы модель данных, правила бронирования, матрица ролей, seed (этап 3) и регистрация, вход, сессии, смена ролей (этап 4), сценарий бронирования гостя (этап 5), административный контур и история изменений (этап 6). единый интерфейс по `design.md` (этап 7). Остались чек-лист приёмки и финальная проверка с нуля (этап 9).

## Требования

- Node.js 20+ и npm
- PostgreSQL 14+ (локально, пользователь с правом создавать БД)

## Запуск

```bash
npm install
cp .env.example .env        # затем замените USER в DATABASE_URL на своего пользователя PostgreSQL
createdb verde_marea
npm run db:setup            # миграции, клиент Prisma, seed
```

## Запуск приложения

```bash
npm run dev      # http://localhost:3000
```

Страницы: `/register`, `/login`, `/account`, `/book`, `/bookings`, `/notifications` и административный контур `/admin`, `/admin/bookings`, `/admin/slots`, `/admin/history`, `/admin/users` (только `admin` и `super_admin`). API описан в [SPEC.md](SPEC.md), разделы 7a, 7b и 7c.

## Команды

| Команда | Что делает |
|---|---|
| `npm run db:setup` | применяет миграции, генерирует клиент, запускает seed |
| `npm run db:seed` | повторно заливает контрольные данные (безопасно: существующих пользователей и брони не трогает) |
| `npm run db:reset` | **удаляет все данные**, применяет миграции заново и запускает seed |
| `npm test` | модульные тесты правил и прав + проверка ограничений БД |
| `npm run typecheck` | проверка типов |

Для тестов ограничений БД создайте отдельную базу: `createdb verde_marea_test` (адрес — `TEST_DATABASE_URL` в `.env`). Без неё эти тесты пропускаются.

## Контрольные данные (seed)

| Роль | Email | Пароль |
|---|---|---|
| `super_admin` | из `SEED_SUPER_ADMIN_EMAIL` | `SEED_SUPER_ADMIN_PASSWORD` |
| `admin` | `admin@verdemarea.local` | `SEED_DEMO_PASSWORD` |
| `user` | `guest1@verdemarea.local`, `guest2@verdemarea.local` | `SEED_DEMO_PASSWORD` |

На главной странице и на странице входа в правом верхнем углу показана рамка «Демо-доступ» с этими аккаунтами (отключается `SHOW_DEMO_ACCOUNTS="false"` в `.env`). Значения паролей лежат в `.env` (шаблон — `.env.example`) и годятся только для локального запуска. Кроме пользователей seed создаёт 8 столов и 6 демо-броней во всех статусах.
