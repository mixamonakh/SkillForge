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
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db
pnpm db:migrate:deploy
pnpm content:validate
pnpm content:import -- --pack js-baseline-v1
pnpm content:import -- --pack js-prebaseline-v1
pnpm dev
```

Development override публикует PostgreSQL только на `127.0.0.1:5432`, поэтому host-процессы API/Web из `pnpm dev` используют безопасные `localhost` defaults из `.env.example`. Основной production compose намеренно не публикует порт DB; не изменяйте его ради локального подключения.

Адреса development:

- web `http://localhost:3000`;
- API `http://localhost:4000/api/v1`;
- Swagger `http://localhost:4000/api/docs`.

## Environment

Безопасные defaults находятся в `.env.example`. Для host-process API `DATABASE_URL` должен указывать на доступный host/port dev PostgreSQL, а внутри Compose — на `db:5432`. Не коммитьте `.env`.

Штатный AI режим:

```dotenv
AI_MODE=manual
AI_MONTHLY_BUDGET_USD=10
OPENAI_API_KEY=
```

Hard limit 10 USD не включает AI сам по себе: все feature flags по умолчанию `false`, а `manual` не вызывает provider. API key не нужен. Переменная с secret никогда не получает prefix `NEXT_PUBLIC_`.

Read-only usage и безопасный smoke для уже запущенного API:

```bash
pnpm ai:usage
pnpm ai:smoke
```

По умолчанию smoke проверяет readiness и usage, поэтому работает и в `manual`. Для disposable fake-provider flow задайте `AI_MODE=api-assisted`, explicit `AI_PROVIDER=fake`, `AI_FAKE_PROVIDER_ENABLED=true` и нужные feature flags. Optional `AI_SMOKE_ATTEMPT_ID`/`AI_SMOKE_NUDGE_ATTEMPT_ID` должны ссылаться только на test-scoped attempts. CLI не печатает answer или hint body. Live OpenAI smoke дополнительно требует real key и актуальные explicit pricing env; он не входит в обязательные offline tests.

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
pnpm content:ai-review -- --pack js-core-training-v1
```

Последняя команда использует fake provider, создаёт advisory report вне pack и не активирует draft content.

Если used TaskVersion отличается checksum, создайте новую version. `prisma db push` и ручная правка production-like DB не используются.

### Изолированный pre-release flow training pack

`js-core-training-v1` остаётся canonical DRAFT до human approval. Его Playwright-сценарий разрешён только на отдельном disposable Compose volume:

```bash
export COMPOSE_PROJECT_NAME=skillforge-sfv2-sequence
export POSTGRES_VOLUME_NAME=skillforge_sfv2_sequence_data
export SEED_CONTENT_PACKS=js-baseline-v1,js-prebaseline-v1,js-core-training-v1
docker compose up -d --build
E2E_EXPECT_CLEAN=1 pnpm --dir e2e test critical-flow.spec.ts
docker compose down
```

Spec сначала проверяет canonical DRAFT manifest и только затем активирует в импортированном представлении ровно четыре acquisition tasks и четыре content items. Source JSON, review status, consolidation и transfer не изменяются. Не запускайте эту команду против volume с ценными answers/evidence.

## Перед передачей изменения

Запустите релевантные unit/integration tests во время работы, затем полный набор из [testing.md](../quality/testing.md). В отчёте перечислите именно выполненные команды и результат. Не используйте cached/не запускавшийся job как доказательство готовности.
