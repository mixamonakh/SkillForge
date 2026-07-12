# ADR 0002: API как модульный монолит

- Статус: принято
- Дата: 2026-07-11

## Контекст

Assessment, autosave, evaluation, evidence, mastery и import apply образуют согласованные транзакции. Single-user local MVP не требует независимого scaling доменов, message broker или distributed tracing. При этом один giant service/controller сделал бы provenance и правила трудно тестируемыми.

## Решение

Реализовать один NestJS/Fastify API deployment unit как модульный монолит с модулями profile, curriculum, assessment, session, evaluation, mastery, review, import-export, metrics, battle-evidence и health.

Направление dependency: `controller → application use case → domain/repository port → Prisma adapter`. Controller не вызывает Prisma, не считает mastery и не управляет multi-record transactions. Модули взаимодействуют через public application services/contracts, а pure learning logic находится вне Nest.

## Последствия

Положительные:

- одна PostgreSQL transaction для import/evidence/recompute;
- простой Compose/startup/health;
- доменные boundaries и unit testing без сетевой сложности;
- возможность позже вынести runner/AI/jobs.

Стоимость:

- boundaries не обеспечиваются сетью и требуют lint/review;
- deployment/scaling API общий;
- cross-module use case нужно проектировать явно.

Меры: module ownership, repository ports, no direct cross-table convenience reads, size limits и integration tests.

## Рассмотренные варианты

- **Микросервисы:** отклонено для MVP из-за distributed transactions, queues, tracing и локальной операционной сложности.
- **Один service/controller:** отклонено как god monolith.
- **Serverless functions:** отклонено из-за local-first startup, migrations, long-lived DB workflow и provider lock-in.
