# Обзор архитектуры

## Контекст

SkillForge — local-first single-user система с тремя runtime units:

```text
Browser → Next.js web :3000 → NestJS/Fastify API :4000 → PostgreSQL 18
           │                       │
           └─ JS Web Worker        ├─ Prisma repositories
                                   └─ pure learning engine/contracts
```

Web и API разделены, PostgreSQL недоступен браузеру. API реализован модульным монолитом: это сохраняет транзакции и простоту локального запуска, но доменные границы не позволяют превратить его в один giant service.

## Deployment units

### `apps/web`

Next.js App Router отвечает за маршруты, server/client rendering, доступный интерфейс, TanStack Query, forms, аварийный local draft и browser worker. Web не рассчитывает mastery, не применяет import и не импортирует Prisma.

### `apps/api`

NestJS 11 с Fastify владеет use cases, lifecycle assessment/session, optimistic autosave, export/import, transaction boundaries, evidence recompute, health/OpenAPI и structured logging.

Доменные модули: profile, curriculum, assessment, session, evaluation, mastery, review, import-export, metrics, battle-evidence, health.

### PostgreSQL

PostgreSQL 18 хранит attempts, snapshots, evaluations, evidence, topic state, imports/exports и content metadata. Prisma Migrate — единственный production migration path. Volume переживает restart контейнеров.

### Browser Web Worker

Выполняет небольшие JS/TS snippets вне main window, с timeout и ограничениями network/source/output. Это local-mode execution boundary, но не multi-user security sandbox.

## Shared packages

- `@skillforge/learning-engine`: pure deterministic functions без Nest/Prisma/React/fs/network;
- `@skillforge/contracts`: versioned enums, Zod/JSON schemas и public types;
- `@skillforge/db`: Prisma client, migrations, repositories и content commands без mastery policy;
- `@skillforge/content-schema`: content pack validation;
- `@skillforge/ui`: tokens и accessible primitives без API dependency.

## Архитектурные свойства

- evidence является source of truth, `TopicState` — пересчитываемый cache;
- content и task versions immutable после использования;
- AssessmentRun/Session сохраняют snapshot, поэтому продолжение не зависит от будущей правки blueprint;
- external AI import не доверяется и не пишет status напрямую;
- manual AI mode не требует сети или API key;
- stable English keys отделены от русских display titles;
- все даты хранятся в UTC, публичные timestamps — ISO 8601;
- write-use cases используют транзакции там, где меняется несколько агрегатов.

## Почему так

Frontend-only/localStorage не обеспечивает migration, atomic import и provenance. Микросервисы усложняют single-user MVP без пользы. Выбранный модульный монолит позволяет позже вынести worker или AI provider, не меняя learning domain.

Решения зафиксированы в [ADR 0001](../adr/0001-monorepo.md), [ADR 0002](../adr/0002-modular-monolith-api.md) и связанных ADR.
