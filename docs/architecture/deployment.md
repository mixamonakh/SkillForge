# Deployment

## Поддерживаемый MVP deployment

Поддерживается локальный single-user запуск через Docker Compose:

| Service | Назначение                        | Внутренний порт | Host                                 |
| ------- | --------------------------------- | --------------: | ------------------------------------ |
| `db`    | PostgreSQL 18 + persistent volume |            5432 | не публикуется в основном compose    |
| `api`   | NestJS/Fastify                    |            4000 | `localhost:4000` для API/docs/health |
| `web`   | Next.js production server         |            3000 | `localhost:3000`                     |

Web проксирует `/api/v1` same-origin к `api:4000` во внутренней сети Compose. CORS не нужен для штатного local UI.

## Startup order

```text
db healthy
→ api entrypoint: image-local prisma migrate deploy
→ ensure default local user
→ validate/import configured content pack idempotently
→ start API and become ready
→ web starts and proxy becomes usable
```

Автоматический destructive reset запрещён. Readiness API проверяет DB connection и применённость migrations; liveness не зависит от тяжёлых downstream checks.

Runtime startup вызывает Prisma и content importer из уже установленных image-local binaries. Он не загружает pnpm/Corepack или другие пакеты из сети, поэтому обычный restart работает без registry access.

## Images

- Node.js 24 LTS с точным base tag, без `latest`;
- multi-stage build и `pnpm install --frozen-lockfile`;
- production dependencies/assets в runtime stage;
- non-root user;
- healthcheck и graceful shutdown;
- public source maps выключены, если отдельно не настроены;
- build context исключает `.env`, backups, node_modules и VCS metadata.

## Configuration

`.env.example` документирует безопасные defaults. `AI_MODE=manual`, `AI_MONTHLY_BUDGET_USD=0`, пустой `OPENAI_API_KEY` — штатный запуск. Секреты не встраиваются в image и не имеют `NEXT_PUBLIC_` prefix.

Основные runtime limits: import 5 MiB, runner timeout 2000 ms, resume threshold 7 дней. Любое изменение лимита оценивается вместе с threat model.

## Persistence

Named volume `skillforge_postgres_data` переживает `docker compose restart` и `docker compose down`. Команда `docker compose down -v` удаляет данные и не используется в обычной эксплуатации. Content source остаётся в Git; imported metadata и пользовательские данные — в PostgreSQL.

## Не поддерживается без отдельной работы

- внешний bind без auth/TLS;
- multi-user deployment;
- выполнение недоверенного кода;
- cloud secret management, object storage, queue/worker;
- горизонтальное масштабирование write API.

Для этих сценариев нужна новая threat model и ADR; Docker Compose MVP не заявляет cloud production readiness.
