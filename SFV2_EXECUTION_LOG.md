# SkillForge Learning System v2 — execution log

Обновлено: 2026-07-15 20:23 MSK.

Этот журнал является точкой безопасного продолжения для полного выполнения `SFV2_TASK_LEDGER.md`. Источники требований по приоритету: `AGENTS.md`, актуальный runtime-код и сохранность данных, `CODEX_GOAL_PROMPT.md`, `SFV2_IMPLEMENTATION_SPEC.md`, затем остальные SFv2-документы.

## Статус фаз

| Phase | Status      | Started              | Finished             | Checks                          | Notes                                                 |
| ----- | ----------- | -------------------- | -------------------- | ------------------------------- | ----------------------------------------------------- |
| 0     | COMPLETE    | 2026-07-15 18:32 MSK | 2026-07-15 18:42 MSK | Links + Prettier PASS           | Постоянные docs и ADR созданы                         |
| 1     | COMPLETE    | 2026-07-15 18:43 MSK | 2026-07-15 19:13 MSK | Unit/integration/build/e2e PASS | Content schema v2 и partial evaluation                |
| 2     | COMPLETE    | 2026-07-15 18:52 MSK | 2026-07-15 19:16 MSK | Unit/API/Web/build/e2e PASS     | Capability Profile как pure read-only projection      |
| 3     | COMPLETE    | 2026-07-15 19:03 MSK | 2026-07-15 19:58 MSK | Unit/integration/build PASS     | Interleaved immutable CONTENT/TASK Session Builder    |
| 4     | IN_PROGRESS | 2026-07-15 19:15 MSK |                      | API/Web/PostgreSQL PASS         | Adaptive runtime и external import suppression готовы |
| 5     | IN_PROGRESS | 2026-07-15 19:28 MSK |                      | API/PostgreSQL/content PASS     | Runtime готов; UI/human release gate остаётся         |
| 6     | IN_PROGRESS | 2026-07-15 19:38 MSK |                      | Provider package gates PASS     | Bounded AI platform и rubric grading                  |
| 7     | IN_PROGRESS | 2026-07-15 19:52 MSK |                      | Content review CLI PASS         | Content AI review готов; one nudge остаётся           |
| 8     | PENDING     |                      |                      |                                 | Stabilization, Docker и user trial                    |

## Неприкосновенные ограничения

- Не удалять и не повреждать answers, attempts, evaluations, evidence, snapshots, imports и review history.
- Не изменять использованные `TaskVersion`, старые machine keys и `js-baseline-v1` задним числом.
- `content/packs/` остаётся canonical source; PostgreSQL — импортированное представление.
- AI создаёт только validated candidate/evaluation/evidence и никогда напрямую не присваивает `TopicStatus`/mastery.
- `AI_MODE=manual` без API key остаётся полноценным; тесты используют fake provider.
- Не добавлять AI-chat, streak/daily goals/guilt, IRT/BKT, vector database и destructive reset.
- Не создавать commit, branch, issue или PR.

## План и границы

### Phase 0 — документы и ADR

План: инвентаризировать актуальные docs, перенести принятые решения о capability model, adaptivity, schema v2, learning phases, bounded AI, migrations и rejected alternatives в постоянную структуру; проверить ссылки. Runtime, Prisma и content packs в этой фазе не менять.

### Phase 1 — schema v2 и partial evaluation

План: добавить strict v2 pedagogy metadata с v1 normalization, runtime/JSON contracts, dimension coverage, API/UI pending-state и regression tests без изменения mastery.

### Phase 2 — capability profile

План: реализовать `capability-profile-v1.0` как conservative pure projection, API summary/topic endpoints и доступную capability matrix без materialized table.

### Phase 3 — recommendation и session builder

План: добавить explainable deterministic ranking/stop rules, versioned sequence blueprint, safe `LearningPhase` migration/backfill и immutable snapshots.

### Phase 4 — pre-baseline

План: создать production-quality pack из 16–20 items, adaptive next/stop, RoutingProfile, import/validation/integration/e2e и сохранить старый baseline.

### Phase 5 — acquisition sequence

План: реализовать полный learning loop по values/references/mutability/shallow copy/state update, включая delayed review и transfer.

### Phase 6 — AI grading

План: provider abstraction, fake и opt-in OpenAI adapter, prompt registry, additive Prisma migration, atomic budget/cache/audit, preview/apply/reject/rollback, usage UI и gold calibration.

### Phase 7 — review и nudge

План: bounded content-review CLI с JSON/Markdown report без автоправок и одна безопасная подсказка на попытку с adversarial tests.

### Phase 8 — stabilization

План: полный требуемый check, Docker cold start/health/persistence/restart, backup/restore smoke, критические пользовательские flows, accessibility, docs consistency и manual user-trial checklist.

## Выполненные действия

- Полностью прочитаны 11 обязательных root-документов.
- Подтверждена активная Goal-задача текущего потока.
- Запущены независимые read-only аудиты: architecture/data; learning/content; web/AI/tests.
- Создан этот execution log до runtime-изменений.
- Phase 0: решения о capability, adaptive routing, session builder, pre-baseline, schema v2 и bounded AI перенесены в постоянные docs.
- Phase 0: приняты ADR 0010 и ADR 0011; временные SFv2-файлы сохранены в корне.
- Обнаруженные macOS `dataless` зависимости восстановлены безопасной frozen/offline переустановкой без изменения lockfile.
- Phase 1: добавлены strict content metadata v2, conservative v1 normalization и generated JSON Schema artifacts.
- Phase 1: добавлены `EvaluationCoverage`/`EvaluationResultV2`; exact-match сохраняет только явно поддержанные rubric dimensions, а partial overall остаётся nullable.
- Phase 1: API сохраняет V2 result, повторный submit возвращает ту же projection, pending count выводится из coverage; UI показывает dimension result и pending/unsupported criteria без ложного итогового нуля.
- Исправлен legacy exact-match choice contract: canonical `selectedOptionIds` теперь читается без изменения старых task JSON/TaskVersion.
- Generated `dist`/`.next`/Turbo/Vitest artifacts с macOS `dataless` flags очищены и пересобраны; исходники и данные PostgreSQL не затрагивались.
- Phase 1: обновлены постоянные content/API/data-flow/testing docs; сгенерированы и проверены OpenAPI JSON и Web API types.
- Phase 1: PostgreSQL integration прошёл для DB и API; isolated Playwright run проверил clean start, autosave/refresh, pause/resume, code runner, старый baseline и strict export/import preview/apply.
- Phase 2: реализован pure `capability-profile-v1.0` для семи families с nullable estimate, conservative v1 mapping, pending mixed-evidence handling, help/recency weighting и sufficiency gates.
- Phase 2: добавлены read-only user-scoped API endpoints topic profile/user summary; чтение не материализует состояние и не меняет mastery/`TopicStatus`.
- Phase 2: Topic UI отображает доступную capability matrix, `NOT_TESTED`/`INSUFFICIENT`/`SUFFICIENT`, loading/error/empty states и не показывает mastery confidence до калибровки.
- Phase 3: реализовано pure ядро `recommendation-v2.0`, explainable additive breakdown, явная load-aware стратегия, детерминированные routing stop rules и immutable sequence snapshot builder; API/DB/content integration продолжается.
- Phase 3: `LearningSequenceBlueprint` загружается из optional `sequences/`, проходит exact-reference/topic/completion validation и участвует в canonical checksum без изменения legacy checksum.
- Phase 3: добавлены atomic/idempotent sequence import, typed diff/export и checksum conflicts. Cross-pack reuse не меняет ownership/status/metadata/dependency graph общих Track/Topic; несовместимые definitions отклоняются до записи.
- Phase 3: добавлены `LearningPhase` и `LearningSequenceBlueprint` в Prisma; миграция безопасно backfill-ит шесть `SessionMode`, делает поле обязательным и не меняет snapshots/attempt answers.
- Phase 3: локальная БД перед миграцией имела нулевые counts пользовательских таблиц; после Prisma Migrate counts и ID-hashes не изменились, новая колонка не содержит `NULL`. Отдельный isolated-schema fixture доказал сохранность непустых данных.
- Phase 3: zero penalties recommendation breakdown нормализованы в обычный `0`, а не JavaScript `-0`; добавлен regression test.
- Phase 4 content: создан draft pack `js-prebaseline-v1` — 18 items/29 минут, 6 topics, 6 task kinds, TRACE 6, DEBUG 3, CODE_PRODUCTION 2, TRANSFER/WORK_LIKE 2, TERM 3, MECHANISM 2.
- Phase 4 content: все items имеют v2 metadata, authoritative sources и пустые hints; choices поддерживают «Не знаю», PREDICT/CODE reference outputs и visible/hidden tests проверены. Honest review report оставляет 18 items в `NEEDS_HUMAN_REVIEW` без поддельного human approval.
- Phase 5 foundation: content contract расширен для training pack без декоративного assessment — optional assessments directory, zero assessment counts/thresholds и semantic guard; legacy pack остаётся совместимым.
- Phase 5 content: создан `js-core-training-v1` с 4 theory items, 10 v2 tasks и тремя versioned sequences для acquisition/consolidation/transfer; reference PREDICT/CODE outputs проверены. Pack честно остаётся DRAFT до human solve/UI dry run.
- Phase 6 provider foundation: создан отдельный `@skillforge/ai-provider` со strict attempt/nudge/content-review contracts, fake/manual/OpenAI Responses adapters, повторной local/domain validation, versioned prompt registry, env model routing и token cost calculator.
- Phase 6 calibration foundation: технический report contract отдельно проверяет schema/identity/ranges/coverage/misconceptions/no-answer/prompt-injection gates и не разрешает default enablement без явного `human:*` reviewer.
- Phase 3 Session Builder: versioned sequence теперь создаёт в одной транзакции ordered `LearningSessionContentStep`, task `SessionItem` и только task `Attempt`; все шаги используют original sequence position и immutable content/task snapshot.
- Phase 3 Session UI: CONTENT/TASK отображаются вперемешку; content completion user-scoped, ACTIVE-only, идемпотентен и переживает pause/restart. Completion gate требует обязательные content/task steps и minimum no-help successes; legacy task-only sessions сохраняют fallback.
- Phase 4 runtime: добавлены три adaptive endpoint, snapshot v2, динамическое создание только выбранных items, идемпотентный `next`, stop rules 18/35, pause-aware active time и RoutingProfile без pass/fail/mastery.
- Phase 4 UI: отдельный русский pre-baseline flow с `Не знаю`, autosave, pause/resume, partial/unknown states и объяснимым stop; старый baseline сохранён как расширенная диагностика.
- Phase 4 safety: локальная pre-baseline Evaluation остаётся audit/routing signal и никогда не создаёт Evidence/TopicState; аналогичный внешний import path проходит отдельный regression audit.
- Phase 4 external import safety: preview показывает `CREATE_AUDIT_RECORD` + `Evidence SUPPRESSED` + `TopicState/mastery NO_MUTATION`; apply повторно проверяет snapshot v2, сохраняет Evaluation для audit и не создаёт Evidence, topic misconception links, ReviewSchedule или MetricSnapshot.
- Phase 7 content review: реализована bounded CLI `pnpm content:ai-review -- --pack <key>` с strict provider output, batches не более 10, hard item cap, JSON/Markdown reports и нулевыми auto-edits canonical JSON.
- Phase 7 fake review `js-core-training-v1`: 17/17 artifacts получили честный `NEEDS_HUMAN_REVIEW`; fake provider явно не выдаёт approval и не заменяет human gate.
- Phase 6 evaluator gold: создано ровно 50 self-contained cases (10 topics × 5 anchors) со всеми response/adversarial classes; manifest остаётся `DRAFT_NEEDS_HUMAN_REVIEW` с AI reviewer only.
- Phase 6 fake calibration: 50/50 agreement, schema/identity/no-answer/prompt-injection/direct-assignment gates PASS; `humanReviewComplete=false`, поэтому `eligibleForDefaultEnablement=false` и AI grading остаётся выключенным.
- Phase 6 DB core: additive AI tables/enums, immutable prompt versions, atomic reserve/reconcile/release, partial unique cache owner, cross-attempt cache rebinding contract и transactional draft lifecycle реализованы без изменения legacy rows.
- Integration hygiene: legacy PostgreSQL content suite переведён с общей `public` schema на disposable per-run schema с корректным trigger `search_path`; сохранённые пользовательские packs/data больше не влияют на test counts и не очищаются.
- Phase 5 runtime gate: recommendation и direct sequence selection допускают blueprint только при ACTIVE exact `ContentPack` и ACTIVE exact refs того же `sourcePack/sourceVersion`; DRAFT и частично активированные sequences скрыты до session creation.
- Phase 5 acquisition completion rule исправлен в ещё не выпущенном DRAFT blueprint с двух до одного final no-help success. Mixed CODE evaluation остаётся partial (`passed=null`) и не засчитывается как final completion success; human review status не изменён.
- Phase 5 isolated PostgreSQL flow импортирует baseline+training в уникальную schema, доказывает DRAFT hiding, активирует только acquisition rows и проходит recommendation → 8 ordered CONTENT/TASK → gate rejection → no-help retry → completion → Evidence/Capability/ReviewSchedule. Consolidation остаётся недоступной.
- Numeric PREDICT output больше не теряет строку `2`: evaluator удаляет только явные list markers; добавлен regression.
- Prisma client factory теперь передаёт стандартный `?schema=` в `PrismaPg`, поэтому API integration действительно не обращается к personal `public` schema.
- Phase 5 Playwright fixture/spec подготовлены с fail-closed test-only guard; запуск отложен до отдельного Phase 8 Compose volume.

## Изменённые файлы

- `SFV2_EXECUTION_LOG.md` — создан журнал выполнения.
- Phase 0: добавлены `docs/product/learning-system-v2.md`, `docs/product/pre-baseline.md`.
- Phase 0: добавлены `docs/domain/capability-profile.md`, `docs/domain/adaptive-selection.md`, `docs/domain/session-builder.md`.
- Phase 0: добавлены `docs/ai/architecture.md`, `docs/ai/evaluator.md`, `docs/ai/budget-and-privacy.md`.
- Phase 0: добавлены `docs/content/content-schema-v2.md`, `docs/content/quality-gates.md`.
- Phase 0: добавлены `docs/adr/0010-capability-model.md`, `docs/adr/0011-ai-assisted-evaluation.md`.
- Phase 0: обновлены `docs/README.md`, `docs/architecture/repository-map.md`, `docs/domain/glossary.md`, `docs/product/future-roadmap.md`.
- Phase 1 contracts: добавлены `packages/contracts/src/evaluation.ts`, `packages/contracts/tests/evaluation.test.ts`, `packages/contracts/schemas/evaluation-coverage.schema.json`, `packages/contracts/schemas/evaluation-result-v2.schema.json`; обновлены public exports/schema generator и v1 regression tests.
- Phase 1 content: обновлены `packages/content-schema/package.json`, schema generator, app schema version, public exports, runtime schemas/tests; добавлены normalization, v2/sequence JSON schemas и v1 checksum regression.
- Phase 1 API: обновлены assessment deterministic evaluation/submit/query/task projection и тесты `deterministic-evaluation`/`runner-integrity`.
- Phase 1 Web: обновлены assessment result/active UI, shared API types и component tests.
- Phase 1 docs: обновлены `docs/content/authoring.md`, `docs/content/schema.md`, `docs/api/overview.md`, `docs/quality/testing.md`, `docs/architecture/data-flow.md`.
- Phase 2 engine: добавлен `packages/learning-engine/src/capability.ts`; обновлены config/types/public exports и unit tests.
- Phase 2 API: добавлен `apps/api/src/modules/capability/` и подключён `CapabilityModule`; добавлены projection/evidence/API tests.
- Phase 2 Web: добавлена `apps/web/src/features/topics/topic-capability-matrix.tsx`, обновлены topic detail/types/styles/component tests.
- Phase 2 docs: обновлены `docs/domain/capability-profile.md`, `docs/domain/learning-engine.md`, `docs/api/overview.md`, `docs/architecture/data-flow.md`, `docs/quality/testing.md`.
- Phase 3 engine: добавлены `recommendation-v2.ts`, `adaptive-routing.ts`, `session-sequence.ts` и соответствующие unit tests; обновлены config/types/public exports.
- Phase 3 content/DB: обновлены loader/validation/public exports; добавлены optional sequence tests, `packages/db/src/content/ownership.ts`, sequence-aware importer/diff/export и integration migration/cross-pack tests.
- Phase 3 Prisma: обновлены `packages/db/prisma/schema.prisma`, generated client и добавлена миграция `20260715000000_learning_sequences_and_phases`.
- Phase 3 API foundation: assessment session creation теперь явно сохраняет `LearningPhase.CALIBRATION`; Session Builder integration продолжается.
- Phase 4 content: добавлен `content/packs/js-prebaseline-v1/` с manifest, exact shared curriculum definitions, 18 task JSON, candidate-pool assessment, empty theory layer и `review-report.json`.
- Phase 5 content foundation: обновлены manifest/loader/validation tests для non-assessment training packs; `js-core-training-v1` авторится отдельно.
- Phase 5 pack: добавлен `content/packs/js-core-training-v1/` с manifest, exact shared curriculum definitions, theory, 10 tasks, 3 sequences и honest `review-report.json`.
- Phase 6 provider: добавлен workspace `packages/ai-provider/`; обновлены `pnpm-lock.yaml` и workspace links без новых runtime network downloads.
- Phase 3 Session CONTENT: добавлены `LearningSessionContentStep`, migration `20260715001000_learning_session_content_steps`, API completion endpoint, ordered response/types, Web interleaved flow и API/DB/Web regression tests.
- Phase 4 runtime: добавлены `prebaseline-{snapshot,routing,assessment.service}.ts`, adaptive controller/query/lifecycle wiring, `active-prebaseline.tsx`, API/Web types/OpenAPI и unit/integration/UI tests.
- Phase 4 import safety: добавлен `external-evaluation-policy.ts`; обновлены import preview/apply, Import Center/types, постоянные pre-baseline/import docs и unit/PostgreSQL/UI regression tests.
- Phase 7 content review: добавлены `packages/ai-provider/src/content-review{,-cli}.ts`, tests и root/package scripts; generated reports находятся в `reports/content-ai-review/`.
- Phase 6 gold: добавлены `content/evaluator-gold/**` и `reports/ai-calibration/evaluator-gold-v1-fake.{json,md}`.
- Phase 6 DB: добавлены `packages/db/src/ai/**`, migration `20260715002000_ai_platform`, Prisma models/generated client и unit/PostgreSQL tests.
- Phase 6/7 API: добавлены bounded evaluate/get/apply/reject/rollback/usage/nudge endpoints, atomic ledger/cache orchestration, cross-attempt rebinding, pre-baseline audit-only guard, append-only compensation и monotonic help audit.
- Phase 6/7 operations: добавлены безопасные `pnpm ai:smoke`/`pnpm ai:usage`, exact `docs/api/ai.md`, error/local-development docs и disposable fake-provider PostgreSQL flow.
- Test isolation: обновлён `packages/db/tests/integration/postgres-content.test.ts`; test создаёт/мигрирует/удаляет только уникальную schema.
- Phase 5 runtime: обновлены `apps/api/src/modules/sessions/session-{sequence,recommendation.service}.ts`, `sessions.service.ts`, deterministic evaluator и unit tests; добавлен `apps/api/test/learning-sequence-flow.integration.test.ts`.
- Phase 5 release fixture: добавлены `scripts/e2e-training-sequence-fixture.ts`, `e2e/tests/training-sequence.spec.ts` и `e2e/tests/fixtures/training-sequence-fixture.ts`; fixture закрыт двойным test-only env guard.
- Phase 5 content/docs: обновлены acquisition sequence/review report, `docs/domain/session-builder.md`, `docs/quality/testing.md`, `docs/operations/local-development.md` и DB client schema handling.
- Phase 6/7 Web: добавлены `apps/web/src/features/ai/{contracts,api,ai-evaluation-review,ai-usage}.ts(x)` со strict response validation, persisted draft restore, preview/apply/reject/rollback, usage и bounded nudge UI; обновлены assessment/prebaseline/session/settings integration, responsive styles и component tests.

## Архитектурные решения

- На старте приняты без изменений инварианты `AGENTS.md` и SFv2: capability — projection, routing rule-based, AI bounded/previewed, manual fallback mandatory, migrations additive and data-preserving.
- До сведения результатов аудита агенты не редактируют общие файлы.
- `js-baseline-v1` остаётся schema v1; normalization не добавляет capability labels и не меняет canonical checksum.
- Deterministic evaluator v2 разделяет overall result и dimension results: только final coverage может иметь итоговые score/pass; pending explanation не проецируется как failed.
- Sequence blueprint contract опубликован заранее как schema-only foundation; loader/importer/reference validation остаются Phase 3.
- Capability Profile является read-only projection: API читает только локального пользователя, pure engine не знает о Prisma, а никакой результат capability не записывает mastery/`TopicStatus`.
- До двух scored signals с суммарным надёжным весом `1.5` capability estimate остаётся `null`; mixed v2 evidence без dimension linkage остаётся pending.
- Recommendation v2 добавлен отдельной версией без изменения `recommendation-v1.0`; ranking и routing используют стабильный tie-break и возвращают объяснение вместо скрытого score.
- `LearningPhase` не выводится из режима неявно при новых writes: migration default существует только как staged safety; assessment пишет `CALIBRATION`, обычные sessions должны писать explicit recommendation/plan phase.
- `LearningSequenceBlueprint` version immutable по key/version/checksum; active session хранит snapshot, а не live reference.
- Cross-pack ownership определяется `sourcePack`: семантически идентичные общие Track/Topic reuse-only; новый pack не получает права перезаписать старый curriculum graph.
- Pre-baseline остаётся `draft` до реального human dry run. Runtime интеграция может запускать exact pre-release key, но release status не подменяется техническими тестами.
- Training content pack не обязан создавать фиктивный assessment: отсутствие каталога и нулевые assessment thresholds являются явным schema contract.
- CONTENT progress хранится отдельно от `Attempt`: чтение теории не подделывается task answer/evidence, но session snapshot сохраняет точный текст/payload, checksum и исходную позицию для воспроизводимости.
- Fake content review является техническим provider-flow test и всегда возвращает `NEEDS_HUMAN_REVIEW`; только explicit live provider плюс последующий human review может влиять на release decision, но никогда не меняет JSON автоматически.
- External Evaluation для pre-baseline является audit-only: policy определяется из immutable assessment snapshot внутри preview и apply, fail-closed для v2 marker; пустой affected-topic set не вызывает mastery recompute/snapshot.
- Sequence availability — release boundary, а не догадка по наличию blueprint: exact source pack и все exact same-source refs должны быть ACTIVE. Import DRAFT остаётся допустимым для audit/disposable verification.
- Partial evaluation не переопределена: `passed=null` может участвовать в evidence projection по действующему engine, но completion no-help gate требует `passed=true`.
- Web хранит в browser storage только `draftId` для восстановления lifecycle; candidate/preview всегда читаются из PostgreSQL-backed API и повторно валидируются strict Zod schema. AI query/mutation errors изолированы от autosave/submit/pause/complete, а scoped manual export остаётся доступным.

## Миграции

- `packages/db/prisma/migrations/20260715000000_learning_sequences_and_phases/migration.sql`:
  - создаёт enum `LearningPhase` и versioned `LearningSequenceBlueprint`;
  - добавляет nullable `LearningSession.learningPhase`;
  - backfill: `ASSESSMENT→CALIBRATION`, `TRAINING→ACQUISITION`, `REVIEW/RETURN→CONSOLIDATION`, `INTERVIEW/BATTLE→TRANSFER`;
  - только после backfill ставит `NOT NULL` и staged default `ACQUISITION`;
  - не удаляет и не обновляет attempts/evaluations/evidence/snapshots/imports.
- Миграция применена через Prisma Migrate к локальному PostgreSQL. До/после: `LearningSession=0`, `Attempt=0`, `Evaluation=0`, `Evidence=0`, `AssessmentRun=0`, `ImportBatch=0`; ID hashes совпадают. Isolated fixture с 6 sessions и ценным attempt answer сохранён полностью.
- `packages/db/prisma/migrations/20260715001000_learning_session_content_steps/migration.sql` создаёт только additive progress table/indexes/FK; существующие session/items/attempts/evaluations/evidence не переписывает. Isolated migration fixture и restart flow прошли.
- `packages/db/prisma/migrations/20260715002000_ai_platform/migration.sql` добавляет AI enums/tables/constraints/indexes/FK и immutable prompt trigger. Disposable migration fixture подтвердил неизменность Attempt, Evaluation, Evidence, TaskVersion, ImportBatch и snapshots; public/personal schema агентом не мигрировалась.

## Команды и результаты проверок

| Команда/проверка                           | Результат                                                                                                  |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Чтение обязательных файлов                 | PASS — 2936 строк прочитаны полностью                                                                      |
| `git status --short`                       | Не завершился в течение 30 секунд; будет повторён безопасными адресными командами без изменения checkout   |
| Local Markdown link scan                   | PASS — все относительные ссылки под `docs/` разрешаются                                                    |
| Targeted Prettier check                    | PASS — все файлы Phase 0                                                                                   |
| `git diff --check`                         | PASS                                                                                                       |
| Frozen offline reinstall                   | PASS — 721 packages, Prisma Client generated, lockfile unchanged                                           |
| Contracts lint/type/test/build/schema      | PASS — 30/30 tests, v1 import/export regression green                                                      |
| Content schema lint/type/test/build/schema | PASS — 23/23 tests, generated artifacts green                                                              |
| `pnpm content:validate`                    | PASS — legacy checksum `a04237a...c1d2`; prebaseline checksum `d28d4d0...cd26`, zero errors/warnings       |
| API lint/type/test                         | PASS — 15 files, 50 tests                                                                                  |
| Web lint/type/test                         | PASS — 17 files, 42 tests                                                                                  |
| Phase 1 targeted Prettier                  | PASS                                                                                                       |
| DB integration                             | PASS — 5/5 tests на PostgreSQL                                                                             |
| API integration                            | PASS — 1/1 test на PostgreSQL                                                                              |
| API/Web production build                   | PASS — Nest compile и Next production build                                                                |
| OpenAPI generation                         | PASS — API JSON и Web generated types обновлены                                                            |
| Phase 1/2 Playwright                       | PASS — 4 passed, 1 Compose-restart test ожидаемо skipped до финального Docker gate                         |
| Learning engine Phase 2                    | PASS — 67/67 tests, lint, typecheck, build                                                                 |
| Learning engine Phase 3                    | PASS — 96/96 tests; zero-penalty regression, lint/typecheck/build/Prettier                                 |
| Phase 2 docs Prettier                      | PASS                                                                                                       |
| DB Phase 3 unit                            | PASS — 11/11 tests                                                                                         |
| DB Phase 3 integration                     | PASS — 10/10 PostgreSQL tests, включая 6-mode backfill/data preservation                                   |
| Prisma migration deploy/status             | PASS — `20260715000000_learning_sequences_and_phases` applied, schema up to date                           |
| Global Phase 3 typecheck                   | PASS — 13/13 Turbo tasks                                                                                   |
| Prebaseline content inventory              | PASS — 18 items/29m, family/kind/source/rubric/no-hint/«Не знаю» gates                                     |
| Prebaseline deterministic reference run    | PASS — 6 PREDICT outputs; 2 CODE visible+hidden tests; starter code fails as expected                      |
| Prebaseline source URLs                    | PASS — 19 unique MDN/React/TC39 URLs returned HTTP 200                                                     |
| Training pack validation/reference checks  | PASS — checksum `fc50a037...b5b9`; 3 sequences, zero errors/warnings                                       |
| Session CONTENT API/Web/DB gates           | PASS — API 75, Web 52, DB unit 13; API restart integration 3, migration preservation 6                     |
| Adaptive pre-baseline gates                | PASS — API 75, Web 52, PostgreSQL 3; lint/type/build green                                                 |
| Pre-baseline external import suppression   | PASS — 4 unit + 1 PostgreSQL + 1 UI; full API 84/Web 53, lint/type/build; Evaluation 1, knowledge writes 0 |
| AI provider lint/type/test/build           | PASS — 24/24 tests; strict contracts/fake/manual/OpenAI/calibration/content-review/wire redaction          |
| `pnpm content:ai-review -- --pack ...`     | PASS — 17 items, PASS 0 / HUMAN 17 / BLOCK 0; JSON+Markdown written                                        |
| `pnpm ai:calibrate`                        | PASS — 50/50; technical gates PASS, human review FAIL by design, eligible=false                            |
| Full DB integration after test isolation   | PASS — 3 files / 17 tests; no dependency on shared `public` pack count                                     |
| AI DB Prisma/lint/type/unit/build          | PASS — Prisma format/validate/generate; 4 files / 17 unit tests; build green                               |
| AI API unit/type/build                     | PASS — API 22 files / 92 tests; TypeScript strict и Nest build green                                       |
| AI API disposable PostgreSQL               | PASS — 6/6: preview/apply/cache/race/reject/rollback/prebaseline/nudge/usage                               |
| Phase 5 API unit                           | PASS — 20 files / 87 tests; DRAFT/source-ref gates и numeric output regression                             |
| Phase 5 disposable API/PostgreSQL          | PASS — 4 files / 5 tests; acquisition complete, capability/review observed, schema dropped                 |
| Phase 5 Playwright lint/type preparation   | PENDING — spec/guarded fixture добавлены; запуск требует отдельный Phase 8 Compose volume                  |
| Phase 6/7 Web AI component suite           | PASS — 20 files / 67 tests; lifecycle, manual fallback, usage, one nudge и failure isolation               |
| Phase 6/7 Web lint                         | PASS — `eslint src --max-warnings=0`                                                                       |
| Phase 6/7 Web typecheck/build              | PASS — OpenAPI regenerated; strict TS и Next production build зелёные                                      |

## Известные ограничения и дефекты

- Phase 4 pack технически готов, но намеренно не активирован без human review; external import suppression закрыт, финальный Playwright остаётся.
- Phase 5 pack технически готов как DRAFT; isolated API/PostgreSQL flow пройден, но human solve/UI dry run и explicit approval обязательны до обычной активации.
- Consolidation/transfer остаются DRAFT и не участвовали в pre-release activation; их completion rules и timing требуют отдельного human dry run.
- Локальная `public` schema обнаружена уже содержащей ACTIVE DB-row `js-core-training-v1`, несмотря на canonical DRAFT. Автоматическое исправление не выполнялось, чтобы не менять пользовательские данные без явного решения; финальный runtime audit обязан проверить pack и ref statuses.
- Реальный OpenAI API key отсутствует по плану и не является блокером; live paid smoke будет отделён от fake-provider проверок.

## Точка безопасного продолжения

Текущая точка: Phase 0–3 COMPLETE. Phase 4 adaptive runtime/API/Web/PostgreSQL и внешний import suppression зелёные; остаются final Playwright/human activation gates. Phase 5 DRAFT hiding, exact acquisition runtime и disposable PostgreSQL flow зелёные; следующий безопасный шаг — на отдельном Phase 8 volume запустить prepared `training-sequence.spec.ts`, затем провести реальный human dry run и только после него принимать release status. Phase 6/7 API fake-provider lifecycle и Web lifecycle/usage/nudge lint/type/test/build зелёные после OpenAPI regeneration; основной поток может включать их в общий fake-provider/Docker E2E. Перед общим Docker gate проверить обнаруженный drift статусов training pack в local `public`, ничего не удаляя автоматически.

## Незавершённое перед release

По команде владельца 2026-07-15 кодинг и проверки остановлены, а текущий diff зафиксирован как незавершённый. Перед release нужно:

- закончить nudge leak guards и `GET /api/v1/recommendations/next-v2`;
- изолировать все API integration tests от `public` schema;
- обновить training review reports под checksum `fc50a03734a3bc33bab42ef762f589f57d0c8d5938004ea233146f13a881b5b9`;
- добавить `CHATGPT_CONTENT_GENERATION_PROMPT.md` и `OPENAI_API_SETUP_AFTER_REFACTOR.md`, затем обновить `SHA256SUMS.txt`;
- разделить выросшие services/repository, превышающие принятые file-size boundaries;
- запустить весь обязательный pnpm cycle, format/OpenAPI drift, Playwright fake-AI flow и accessibility audit;
- на отдельном Compose project/volume проверить cold start, health, restart persistence, backup/restore и manual mode без key;
- пройти human dry run pre-baseline/training; до этого оба pack остаются DRAFT/`NEEDS_HUMAN_REVIEW`.

Точка продолжения: сначала сверить current diff, закрыть список выше и затем выполнить полный Phase 8 без destructive reset и без реального API key.
