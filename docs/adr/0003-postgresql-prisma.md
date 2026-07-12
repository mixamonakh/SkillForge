# ADR 0003: PostgreSQL 18 и Prisma Migrate

- Статус: принято
- Дата: 2026-07-11

## Контекст

Answers/evidence должны переживать browser/container restart. Import apply требует атомарности, unique checksum и provenance relations. Content versions и attempts требуют foreign keys/constraints/indexes. LocalStorage или document DB не дают необходимого migration/relational contract.

## Решение

Использовать PostgreSQL 18 с persistent Docker volume и Prisma ORM 7. Схема/migrations находятся в `packages/db`; production startup выполняет `prisma migrate deploy`. Seed/default user и content import идемпотентны.

`prisma db push` запрещён в production workflow. Все user records scoped `userId`, все даты UTC. Unique/FK/index constraints защищают stable key/version, lifecycle references, checksum и user/status/due queries. Used TaskVersion immutable на уровне application/DB protections.

## Последствия

Положительные:

- ACID transaction для import/recompute;
- constraints/provenance и эффективные relational queries;
- сохранённая migration history и typed client;
- готовность к большему объёму attempts/user scoping.

Стоимость:

- нужен DB service, migrations и backup;
- Prisma abstractions не заменяют review SQL/index/N+1;
- schema rollback сложнее app rollback.

Меры: migration tests на PostgreSQL 18, backup/restore runbook, forward-fix preference, repository boundaries и pagination.

## Рассмотренные варианты

- **localStorage/IndexedDB как source of truth:** отклонено; допустим только emergency unsynced draft.
- **SQLite:** проще локально, но хуже соответствует concurrency/JSON transaction/index и будущему user scaling contract.
- **MongoDB:** relational provenance и constraints потребовали бы ручной реализации.
- **Hosted DB:** отклонено как обязательная внешняя зависимость local-first MVP.
