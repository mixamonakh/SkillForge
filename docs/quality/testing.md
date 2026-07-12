# Стратегия тестирования

## Принцип

Критические доменные и data-integrity сценарии проверяются на соответствующем уровне. UI mock не заменяет integration с PostgreSQL; static fixture не закрывает import transaction или autosave persistence.

## Unit

- evidence normalization и help/recency factors;
- mastery estimate/confidence/status gates;
- recommendation и review schedule;
- readiness/data sufficiency;
- import/export Zod/JSON schemas и canonical checksum;
- content graph/schema validation;
- runner protocol utilities и output cap.

Целевое branch coverage: learning engine ≥90%, import/export ≥85%. Детерминированное API core (runner binding/evaluation, strict export/import boundaries, session planner и honest metric helpers) имеет обязательный threshold ≥80% для statements/branches/functions/lines. Transactional services дополнительно проверяются real-PostgreSQL integration и e2e; coverage не заменяет invariant assertions.

## Integration с PostgreSQL 18

- repository constraints и user scoping;
- assessment run snapshot/lifecycle/pause/resume;
- optimistic autosave и stale revision 409;
- deterministic Evaluation → Evidence persistence;
- recompute TopicState/ReviewSchedule в transaction;
- content import idempotency и immutable used TaskVersion;
- import validate/preview/apply/rollback/checksum deduplication;
- сохранение после API/container restart.

Tests используют отдельную test DB/schema и реальные migrations. Personal development data не очищается тестами.

## Web/component

- empty Dashboard без score/readiness;
- ResumeBanner без guilt/streak copy;
- StatusBadge не только цветом;
- assessment navigation и `Не знаю`;
- autosave indicator/conflict/error;
- code runner result/timeout;
- import preview current→projected;
- loading/empty/error/insufficient/populated states;
- keyboard/focus и accessible names.

## E2E Playwright

Критический путь:

1. clean start → «Профиль не откалиброван»;
2. start JS baseline;
3. answer block item;
4. refresh → answer remains;
5. pause, reopen, resume;
6. run code task → deterministic tests visible;
7. complete run/block;
8. export JSON и Markdown;
9. import valid analysis fixture;
10. preview и apply;
11. Roadmap status меняется только через evidence;
12. restart services → data persists.

## Обязательные edge cases

- русский title не влияет на stable ID;
- malformed/fenced JSON;
- unsupported schema;
- unknown topic/attempt;
- duplicate import checksum;
- stale import preview и autosave revision;
- zero evidence → unknown;
- one score 100 → not mastered;
- varied delayed transfer → mastered;
- time only → needsReview, not weak;
- solution viewed penalty;
- external AI не перевешивает repeated deterministic failures;
- prerequisite cycle rejected;
- worker infinite loop timeout и termination;
- console/source size capped;
- free text remains pending.

## Полная проверка

```bash
pnpm content:validate
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm test:e2e
docker compose build
```

После Compose startup отдельно проверяются health и persistence через restart. Фактический result/exit code записывается в CI/final report. Нельзя заявлять «green», если шаг не запускался или был skipped.

## CI gates

Jobs: install/cache, lint, typecheck, unit, integration с PostgreSQL 18 service, content validation, OpenAPI drift, build, e2e, docker-build и dependency audit. Любой обязательный failure блокирует merge; временный skip требует документированного product/technical решения, а не silent `continue-on-error`.
