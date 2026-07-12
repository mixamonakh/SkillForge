# Границы MVP

## Обязательный завершённый контур

MVP охватывает JavaScript Baseline v1 от первого запуска до обновлённой карты знаний:

- pnpm/Turborepo monorepo с отдельными web и API;
- PostgreSQL, Prisma Migrate, реальные миграции и persistent volume;
- один локальный пользователь без login только на localhost;
- идемпотентный импорт версионированного контента из Git;
- 18 тем, не менее 72 задач, blueprint на 36 заданий в четырёх блоках;
- минимум пять task kinds, включая code/output/choice/free text/debug/compare/AI review;
- AssessmentRun со snapshot, autosave, optimistic revision, pause/resume и сохранением после restart;
- детерминированная проверка code, output и choice; browser Web Worker для JS;
- Learning Session в режимах `TRAINING`, `REVIEW`, `RETURN`; базовая поддержка остальных заявленных режимов только при работающем сценарии;
- evidence-based mastery, review schedule и одна primary recommendation;
- строгий JSON/Markdown export;
- строгая валидация, preview, checksum deduplication и транзакционный import;
- Dashboard, Roadmap, Topic Detail, Assessment, Session, Import/Export, Metrics, Battle Evidence, Library и Settings без декоративных обязательных кнопок;
- честные loading, empty, error и insufficient-data states;
- OpenAPI, health checks, structured logs;
- lint, strict typecheck, unit/integration/e2e, production build и Docker verification;
- документация, ADR, backup/restore и CI.

## Состав JavaScript Baseline v1

Темы включают values/references, mutability, types, coercion/equality, variables/scope, functions, closures, `this`, objects/prototypes, arrays, Map/Set, errors, Promise, async/await, event loop, modules, browser events и fetch.

Четыре блока:

1. Values and execution basics.
2. Functions and object model.
3. Async and errors.
4. Engineering application.

Свободные объяснения остаются `pending external review`; keyword matching не используется как окончательная оценка.

## Допустимые упрощения

- только русская локализация;
- light theme по умолчанию;
- карточный Roadmap вместо canvas-графа;
- Web Worker вместо judge-кластера;
- manual AI workflow без API key;
- local draft лишь как аварийный буфер, PostgreSQL остаётся source of truth;
- схема и learning engine поддерживают версионированный `TargetTrack`, но bundled JS-only pack не создаёт фиктивный Yandex profile для отсутствующих доменов; без активного target profile в БД readiness показывает «Целевой профиль не настроен» и `value: null`.

## Не входит в MVP

- встроенный AI-чат и обязательный OpenAI API;
- полноценные TypeScript, React, algorithms/LeetCode, web/server/infra курсы;
- GitHub OAuth и автоматическое чтение приватных репозиториев;
- многопользовательский SaaS, платежи и мобильное приложение;
- полноценный server-side sandbox недоверенного кода;
- BKT/IRT без данных, социальные рейтинги, streak и push с давлением;
- web-admin для редактирования content packs.

Будущие возможности не должны выглядеть как работающие кнопки. Их место — [future roadmap](future-roadmap.md).

## Условия завершения

Функция считается реализованной только при работе с реальной БД/API, runtime validation и тестами. Статический экран или hardcoded данные не закрывают требование. Общая готовность проекта подтверждается только выполненными проверками и Docker-сценарием; сам этот документ такого подтверждения не даёт.
