# Локальная разработка

## Требования

- Node.js 24 LTS (версии закреплены в `.nvmrc` и `.node-version`);
- Corepack и pnpm 10 из `package.json#packageManager`;
- Docker Desktop / Compose v2 для PostgreSQL и e2e;
- Git.

## Первый запуск

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
docker compose up -d db
pnpm db:migrate:deploy
pnpm content:validate
pnpm content:import -- --pack js-baseline-v1
pnpm dev
```

Если основной compose намеренно не публикует PostgreSQL port, используйте development override проекта или запускайте API/DB целиком через Compose. Не изменяйте production compose ради локального подключения.

Адреса development:

- web `http://localhost:3000`;
- API `http://localhost:4000/api/v1`;
- Swagger `http://localhost:4000/api/docs`.

## Environment

Безопасные defaults находятся в `.env.example`. Для host-process API `DATABASE_URL` должен указывать на доступный host/port dev PostgreSQL, а внутри Compose — на `db:5432`. Не коммитьте `.env`.

Штатный AI режим:

```dotenv
AI_MODE=manual
AI_MONTHLY_BUDGET_USD=0
OPENAI_API_KEY=
```

API key не нужен. Переменная с secret никогда не получает prefix `NEXT_PUBLIC_`.

## Task graph

Root commands запускаются через Turborepo:

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm test:e2e
```

Перед первым локальным e2e-запуском установите закреплённый Chromium для Playwright:

```bash
pnpm --dir e2e exec playwright install chromium
```

Критический e2e-сценарий изменяет данные и ожидает чистый disposable stack. Не запускайте его против профиля с ценными ответами; CI создаёт и удаляет отдельный volume внутри disposable runner.

Для отладки одного workspace используйте filter, например `pnpm --filter @skillforge/learning-engine test`. Точное имя берите из package `name`, не из предположения.

Integration/e2e требуют чисто настроенной test DB и не должны использовать личную development DB. Tests создают/очищают только явно test-scoped schema/database.

## OpenAPI

После изменения controller/DTO обновите generated contract принятой командой:

```bash
pnpm openapi:generate
```

Проверьте drift и web typecheck. Generated files вручную не редактируются.

## Content changes

```bash
pnpm content:validate
pnpm content:diff -- --pack js-baseline-v1
pnpm content:import -- --pack js-baseline-v1
```

Если used TaskVersion отличается checksum, создайте новую version. `prisma db push` и ручная правка production-like DB не используются.

## Перед передачей изменения

Запустите релевантные unit/integration tests во время работы, затем полный набор из [testing.md](../quality/testing.md). В отчёте перечислите именно выполненные команды и результат. Не используйте cached/не запускавшийся job как доказательство готовности.
