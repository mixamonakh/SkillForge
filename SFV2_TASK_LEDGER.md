# SkillForge Learning System v2 — единый журнал задач для Codex Goal

**Назначение:** этот файл не является набором отдельных пользовательских промптов. Это полный последовательный backlog, который один запуск Codex в режиме Goal обязан выполнить автономно от Phase 0 до Phase 8.

## Правила исполнения

- Выполнять фазы строго по порядку.
- Не останавливаться после промежуточного отчёта и не запрашивать подтверждение между фазами.
- Перед каждой фазой перечитывать актуальный `AGENTS.md`, затрагиваемый код, тесты и документацию.
- После каждой фазы обновлять `SFV2_EXECUTION_LOG.md`, запускать релевантные проверки и исправлять найденные ошибки.
- Следующую фазу начинать только после прохождения acceptance criteria текущей либо после документированного безопасного обхода объективного блокера.
- Не пропускать задачи ради сокращения объёма. Допустима адаптация путей и названий под актуальный репозиторий, но не удаление поведения, тестов, миграций или документации из scope.
- Старые пользовательские ответы, evidence, assessment snapshots и использованные `TaskVersion` должны сохраняться.
- Не создавать commit, branch, issue или PR, если пользователь отдельно не дал такую команду.

## Статусы

Codex должен поддерживать таблицу в `SFV2_EXECUTION_LOG.md`:

| Phase | Status | Started | Finished | Checks | Notes |
|---|---|---|---|---|---|
| 0 | PENDING | | | | |
| 1 | PENDING | | | | |
| 2 | PENDING | | | | |
| 3 | PENDING | | | | |
| 4 | PENDING | | | | |
| 5 | PENDING | | | | |
| 6 | PENDING | | | | |
| 7 | PENDING | | | | |
| 8 | PENDING | | | | |

---

# Phase 0 — документы и ADR

Выполни только документальную фазу Learning System v2.

Изучи актуальный репозиторий и добавь/обнови документы, описывающие:
1. проблему текущего baseline: смешение terminology/mechanism/production и partial evaluation;
2. CapabilityFamily: TERM, MECHANISM, TRACE, DEBUG, CODE_PRODUCTION, TRANSFER, CALIBRATION;
3. LearningPhase: CALIBRATION, ACQUISITION, CONSOLIDATION, TRANSFER;
4. rule-based adaptive selection и stop rules;
5. content schema v2 metadata;
6. новый js-prebaseline-v1;
7. session sequence blueprints;
8. AI-assisted grading с preview, hard budget и manual fallback;
9. решение не внедрять IRT, AI-chat и vector DB сейчас;
10. migration/backward compatibility.

Создай ADR по capability model и ADR по AI-assisted evaluation. Обнови repository map/future roadmap при необходимости.

Не меняй runtime-код, Prisma schema и content packs.

Проверка:
- ссылки между docs не битые;
- термины и версии согласованы;
- документы не противоречат AGENTS.md.

---

# Phase 1 — content schema v2 и partial evaluation

Реализуй Phase 1 Learning System v2.

Scope:
1. Расширь packages/content-schema новой pedagogy metadata v2:
   - evidenceFamilies;
   - cognitiveLevel;
   - productionLoad;
   - transferLevel;
   - supportLevel;
   - familyKey;
   - learningOutcomeKeys;
   - misconceptionTags;
   - estimatedMinutes;
   - documentationUrls;
   - mixedEvidence.
2. Сохрани чтение существующего js-baseline-v1 без изменений и без переписывания старых JSON.
3. Добавь runtime contracts/types и JSON Schema artifacts.
4. Добавь EvaluationCoverage:
   - evaluatedDimensions;
   - pendingDimensions;
   - unsupportedDimensions;
   - isFinal.
5. Измени API projection и UI так, чтобы частично проверенный ответ не показывался как окончательный ноль.
6. Exact-match должен оценивать только явно поддерживаемые dimensions.
7. Свободное объяснение остаётся pending до внешнего/AI review.

Не меняй mastery formula и TopicStatus gates.
Не добавляй AI API.
Не создавай новый content pack.

Тесты:
- v1 content compatibility;
- v2 metadata validation;
- strict unknown fields;
- partial exact-match evaluation;
- UI state pending review;
- old export/import contract compatibility.

Обнови authoring/schema/API/testing docs.
Запусти content validation, lint, typecheck, unit, integration, build и релевантный e2e.

---

# Phase 2 — capability profile

Реализуй Capability Profile v1 как чистую projection, не создавая отдельную materialized DB table.

Scope:
1. Добавь pure functions в packages/learning-engine:
   - map task metadata/evidence to CapabilityFamily;
   - calculate capability coverage;
   - calculate estimate/confidence conservatively;
   - preserve NOT_TESTED vs INSUFFICIENT;
   - count no-help, pending review, independent days.
2. Добавь algorithmVersion `capability-profile-v1.0`.
3. Добавь API endpoints topic profile и user summary.
4. Topic page должен показывать capability matrix.
5. Dashboard может использовать primary gap, но не менять recommendation engine пока.
6. Старые v1 tasks без уверенного metadata mapping должны давать UNKNOWN/INSUFFICIENT, а не выдуманные families.

Не меняй TopicState formula.
Не добавляй Prisma materialization.

Тесты:
- no evidence;
- one weak signal;
- partial and pending dimensions;
- hints reduce strength;
- transfer separate from code production;
- v1 conservative fallback;
- API insufficient-data states;
- accessible UI.

---

# Phase 3 — recommendation v2 и session builder

Реализуй rule-based Recommendation Engine v2 и LearningSequenceBlueprint.

Scope:
1. Recommendation выбирает:
   - topicKey;
   - primaryGap CapabilityFamily;
   - LearningPhase;
   - recommended task/content family;
   - reason;
   - stop/completion target.
2. Selection учитывает:
   - gap severity;
   - missing family;
   - prerequisite unlock;
   - target relevance;
   - review due;
   - diversity;
   - recent exposure;
   - load feedback.
3. Добавь explainable score breakdown.
4. Добавь content schema и importer для versioned LearningSequenceBlueprint.
5. Session builder собирает ACQUISITION/CONSOLIDATION/TRANSFER sequences.
6. Добавь LearningPhase в LearningSession через безопасную Prisma migration и backfill существующих sessions.
7. Сохрани старые session snapshots.

Не добавляй IRT/BKT.
Не добавляй AI.

Тесты:
- same gap not bombarded by redundant tasks;
- prerequisite unlock;
- overload penalty;
- deterministic same-input result;
- old sessions readable;
- migration preserves rows;
- sequence snapshots immutable.

---

# Phase 4 — JavaScript Pre-Baseline

Создай и импортируй новый content pack `js-prebaseline-v1`.

Перед генерацией прочитай docs/content/quality-gates.md и content schema v2.

Требования:
- 16–20 items;
- 20–35 минут;
- простой русский язык;
- terminology проверяется отдельно от mechanism;
- минимум 4 TRACE;
- минимум 3 DEBUG/COMPLETION;
- минимум 2 CODE_PRODUCTION;
- минимум 2 WORK_LIKE/TRANSFER;
- минимум 2 TERM;
- `Не знаю` валиден;
- без edge-case trivia как основы маршрута;
- authoritative sources;
- code tasks имеют deterministic tests;
- все items размечены v2 metadata;
- assessment использует adaptive next/stop, а не фиксированный pass/fail.

Результат — RoutingProfile, не mastery verdict.
Старый js-baseline-v1 переименуй только на уровне UI display в расширенную диагностику, machine keys не меняй.

Добавь content validation, content tests, integration и полный Playwright e2e.

---

# Phase 5 — первый полный learning sequence

Создай первый production-quality acquisition module для связки:
- значения и ссылки;
- мутабельность;
- shallow copy;
- перенос в state update.

Pack может быть отдельным `js-core-training-v1` или versioned extension согласно текущим content rules.

Sequence:
1. canonical explanation;
2. worked example;
3. predict-before-reveal;
4. primitive/object contrast;
5. mutation debugging;
6. guided completion;
7. short no-help code task;
8. delayed review item;
9. work-like transfer case.

Не добавляй длинную лекцию и не раскрывай решение до попытки.
Добавь misconception tags и contrast siblings.

Проверь весь пользовательский flow: recommendation → session → attempts → evidence → capability update → review scheduling.

---

# Phase 6 — AI platform и rubric grading

Реализуй ограниченный API-assisted режим SkillForge.

Перед реализацией прочитай AGENTS.md, import/export contracts, SECURITY.md и AI ADR.

Scope:
1. Создай provider abstraction в отдельном package.
2. Реализуй один OpenAI provider adapter с structured output.
3. Добавь versioned prompt registry.
4. Добавь Prisma models:
   - AiPromptVersion;
   - AiInvocation;
   - AiEvaluationDraft;
   - AiBudgetPeriod.
5. Реализуй atomic budget reservation/reconciliation.
6. Hard monthly limit по умолчанию 10 USD.
7. Добавь cache по task checksum + answer hash + rubric hash + prompt version + model.
8. Реализуй attempt evaluation candidate:
   - correct observations;
   - dimension scores;
   - misconceptions;
   - feedback;
   - reliability;
   - warnings;
   - evidence candidates.
9. Локально валидируй structured result.
10. Показывай preview и projected changes.
11. Apply создаёт обычные Evaluation/Evidence и вызывает learning-engine.
12. Reject сохраняет audit, но не меняет knowledge state.
13. Manual export/import продолжает работать без API key.
14. Добавь feature flags и AI usage UI.

Запрещено:
- direct TopicStatus update;
- embedded chat;
- решение задачи вместо оценки;
- logging API key или answer body;
- обход budget при concurrent requests.

До включения feature по умолчанию прогони gold dataset и сформируй calibration report.

---

# Phase 7 — content AI review и one nudge

Реализуй две ограниченные AI-функции.

A. Content review CLI
- `pnpm content:ai-review -- --pack <key>`;
- bounded batch;
- structured results;
- PASS / NEEDS_HUMAN_REVIEW / BLOCK_IMPORT;
- отчёты JSON и Markdown;
- проверка ambiguity, rubric, expected answer, tests, sources, duplicates, trivia risk, metadata and stage fit;
- никаких автоматических изменений JSON.

B. One nudge
- одна минимальная подсказка на попытку;
- no solution/no final code/no expected output;
- сохраняет HelpLevel;
- отдельный feature flag и quota;
- structured contract и domain checks;
- кэширование;
- недоступность AI не блокирует сессию.

Добавь тесты adversarial hints: модель не должна раскрывать решение даже при prompt injection в answerText.

---

# Phase 8 — verification and user trial

Не добавляй новые технологии или content packs.

Проведи stabilization:
1. полный check;
2. Docker cold start;
3. backup/restore;
4. старый baseline resume;
5. новый pre-baseline e2e;
6. acquisition sequence e2e;
7. AI budget/race/cache tests;
8. gold dataset calibration report;
9. accessibility review;
10. docs consistency.

Подготовь manual user trial checklist для Михаила:
- пройти pre-baseline;
- проверить, совпадает ли routing profile с ощущениями;
- пройти первую acquisition session;
- запросить одну AI-проверку;
- применить/отклонить preview;
- проверить, понятен ли следующий шаг.

Не объявляй систему педагогически успешной до реального прохождения.
