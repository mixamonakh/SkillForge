# SkillForge Learning System v2
## Полный план рефакторинга системы обучения, диагностики и AI-assisted функций

**Статус:** proposal / implementation contract после утверждения
**Репозиторий:** https://github.com/mixamonakh/skillforge
**Совместимость:** развитие существующего MVP без переписывания с нуля

---

# 1. Цель рефакторинга

Текущий SkillForge уже правильно решает инфраструктурную часть:

- сохраняет реальные попытки;
- отделяет Attempt, Evaluation, Evidence и TopicState;
- хранит курируемый контент в versioned JSON packs;
- не доверяет AI напрямую;
- поддерживает строгий import/export;
- не показывает readiness без достаточных данных;
- запускается локально через Docker Compose.

Проблема находится выше инфраструктуры. Текущая модель в основном отвечает:

> «Насколько подтверждена тема?»

Но недостаточно отвечает:

> «Какой именно компонент навыка сломан и чему учить дальше?»

Рефакторинг должен превратить систему из надёжного assessment shell в полноценный цикл:

```text
короткая калибровка
→ локализация типа пробела
→ подходящий учебный sequence
→ самостоятельная практика
→ отложенное повторение
→ перенос в рабочую/интервью-задачу
→ новое evidence
```

# 2. Неизменяемые инварианты

Рефакторинг обязан соблюдать текущий `AGENTS.md`.

## MUST

- `apps/web` не рассчитывает mastery.
- `apps/api` владеет use cases и транзакциями.
- `packages/learning-engine` остаётся чистым и детерминированным.
- `packages/contracts` владеет versioned внешними контрактами.
- `content/packs` остаётся canonical source.
- использованные `TaskVersion` неизменяемы;
- старые ответы и evidence сохраняются;
- AI output создаёт candidate/evaluation/evidence, но не присваивает status;
- manual mode работает без API key;
- любое внешнее AI-решение schema-validated и audit-able;
- один ответ не создаёт `MASTERED`;
- нет streak, daily goal и guilt UI.

## MUST NOT

- не внедрять общий встроенный AI-чат;
- не подключать Pinecone/Qdrant/Weaviate;
- не внедрять IRT/BKT до накопления данных;
- не превращать PostgreSQL в место ручного редактирования контента;
- не менять `js-baseline-v1` задним числом;
- не генерировать runtime-задачи без versioning и review;
- не показывать один общий score как «уровень разработчика».

# 3. Основная проблема текущего baseline

Первый реальный проход показал несколько смешанных эффектов:

1. человек не знает термин;
2. человек не понимает механизм;
3. человек понимает часть механизма;
4. exact-match проверяет только итоговый вывод и превращает частичное понимание в `0`;
5. свободное объяснение остаётся pending, но UI воспринимается как окончательный провал;
6. задачи раннего входа используют термины уровня interview depth: `bindings`, `lexical environments`, edge cases `Object.is`;
7. почти не измерено прикладное написание JavaScript;
8. не измерены React, реальная проектная работа и AI-review.

Следовательно, текущий baseline нельзя считать плохим. Его следует переопределить как:

> **JavaScript Core & Interview Diagnostic v1**

Перед ним нужен новый короткий маршрутизатор.

# 4. Новая доменная модель обучения

## 4.1. TopicState сохраняется

Текущий `TopicState` продолжает отвечать за агрегированное подтверждение темы:

- `UNKNOWN`;
- `WEAK`;
- `UNSTABLE`;
- `SOLID`;
- `MASTERED`.

Он остаётся итоговой explainable projection, но перестаёт быть единственным представлением навыка.

## 4.2. Capability Profile

Для каждой темы вводится профиль способностей.

```ts
export const CAPABILITY_FAMILIES = [
  'TERM',
  'MECHANISM',
  'TRACE',
  'DEBUG',
  'CODE_PRODUCTION',
  'TRANSFER',
  'CALIBRATION',
] as const;

export type CapabilityFamily = (typeof CAPABILITY_FAMILIES)[number];

export type CapabilityCoverage =
  | 'NOT_TESTED'
  | 'INSUFFICIENT'
  | 'SUFFICIENT';

export interface CapabilityState {
  family: CapabilityFamily;
  coverage: CapabilityCoverage;
  estimate: number | null;
  confidence: number;
  evidenceCount: number;
  independentDays: number;
  noHelpSuccessCount: number;
  pendingReviewCount: number;
  lastEvidenceAt: string | null;
  explanation: string[];
}

export interface TopicCapabilityProfile {
  topicKey: string;
  algorithmVersion: string;
  capabilities: Record<CapabilityFamily, CapabilityState>;
}
```

### Семантика families

| Family | Что измеряет | Примеры |
|---|---|---|
| `TERM` | узнавание и корректное использование терминов | closure, TDZ, mutation |
| `MECHANISM` | причинная модель | почему объект меняется через две переменные |
| `TRACE` | чтение и предсказание выполнения | predict output, пошаговый trace |
| `DEBUG` | поиск причины и исправление | mutating `sort`, race condition |
| `CODE_PRODUCTION` | написание логики без готового решения | функция, обработчик, преобразование данных |
| `TRANSFER` | применение в новом рабочем контексте | mutation → React state, fetch → UI race |
| `CALIBRATION` | соответствие confidence реальной успешности | уверен и прав / уверен и ошибается |

## 4.3. Почему capability profile — projection, а не новая истина

На первой версии capability profile рассчитывается на лету из:

- Evidence;
- Evaluation;
- Attempt;
- TaskVersion metadata;
- HelpLevel;
- provenance;
- времени и независимых дней.

Не создавать отдельную таблицу capability states в первой миграции. Материализация допускается позже, если:

- расчёт станет дорогим;
- появится несколько пользователей;
- потребуется исторический capability snapshot.

Пока это чистая функция в `packages/learning-engine` и API projection.

# 5. Новая metadata-модель задания

Текущих `TaskKind` и `EASY/MEDIUM/HARD` недостаточно.

Добавить в content schema v2 обязательный или постепенно обязательный metadata block:

```ts
export type CognitiveLevel =
  | 'LEXICON'
  | 'CANONICAL_MECHANISM'
  | 'COMPOSITE_MECHANISM'
  | 'CONSTRAINED_PRODUCTION'
  | 'TRANSFER_INTERVIEW';

export type ProductionLoad = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
export type TransferLevel = 'NONE' | 'NEAR' | 'WORK_LIKE' | 'NOVEL';
export type SupportLevel =
  | 'NONE'
  | 'STARTER_CODE'
  | 'SCAFFOLDED'
  | 'WORKED_EXAMPLE';

export interface TaskPedagogyMetadataV2 {
  schemaVersion: '2.0';
  evidenceFamilies: CapabilityFamily[];
  cognitiveLevel: CognitiveLevel;
  productionLoad: ProductionLoad;
  transferLevel: TransferLevel;
  supportLevel: SupportLevel;
  familyKey: string;
  learningOutcomeKeys: string[];
  misconceptionTags: string[];
  estimatedMinutes: number;
  targetRelevance?: Record<string, number>;
  documentationUrls: string[];
  mixedEvidence: boolean;
}
```

## 5.1. Backward compatibility

- существующие task versions остаются валидными как content schema v1;
- importer нормализует v1 metadata через conservative defaults;
- v1 задача не получает автоматически transfer/mechanism labels, если это нельзя доказать;
- новые packs используют schema v2;
- изменение старой задачи требует `version: 2`.

# 6. Learning phases

Разделить пользовательский `SessionMode` и педагогическую цель.

```ts
export type LearningPhase =
  | 'CALIBRATION'
  | 'ACQUISITION'
  | 'CONSOLIDATION'
  | 'TRANSFER';
```

| SessionMode | Обычно соответствует |
|---|---|
| ASSESSMENT | CALIBRATION |
| TRAINING | ACQUISITION или CONSOLIDATION |
| REVIEW | CONSOLIDATION |
| RETURN | CONSOLIDATION |
| INTERVIEW | TRANSFER |
| BATTLE | TRANSFER |

Добавить `learningPhase` в `LearningSession`. Для существующих записей выполнить безопасный backfill по mapping выше.

# 7. Новый Pre-Baseline

## 7.1. Назначение

Pre-baseline не выставляет mastery. Он определяет наиболее полезный маршрут.

## 7.2. Новый pack

```text
content/packs/js-prebaseline-v1/
  manifest.json
  tracks.json
  topics.json
  content/
  tasks/
  assessments/js-prebaseline-v1.json
```

## 7.3. Состав

Ориентир: 16–20 заданий, 20–35 минут.

| Кластер | Количество |
|---|---:|
| базовое чтение кода | 4 |
| значения, массивы, объекты | 3 |
| функции и управление потоком | 2 |
| debugging/completion | 3 |
| короткий код руками | 2–3 |
| frontend transfer | 2 |
| терминология отдельно | 2 |

## 7.4. Правила формулировок

Начальный вопрос проверяет механизм простыми словами.

Плохо:

> Объясни создание и инициализацию bindings.

Хорошо:

> Что выведет первый `console.log`? Почему переменная уже существует, но значения ещё не получила?

После механизма допустим отдельный вопрос:

> Как называется этот этап работы переменной?

## 7.5. Результат

```ts
export interface RoutingProfile {
  assessmentRunId: string;
  sufficientForRouting: boolean;
  topicRoutes: Array<{
    topicKey: string;
    recommendedPhase:
      | 'ACQUISITION'
      | 'CONSOLIDATION'
      | 'TRANSFER'
      | 'DEEP_DIAGNOSTIC';
    primaryGap: CapabilityFamily;
    observations: Partial<Record<CapabilityFamily, CapabilityCoverage>>;
    reasons: string[];
  }>;
}
```

Не использовать pass/fail «4 из 6».

# 8. Rule-based Adaptive Assessment v2

## 8.1. Почему не IRT сейчас

IRT требует откалиброванных item parameters и достаточного объёма ответов. Сейчас это создало бы ложную научность.

## 8.2. Алгоритм selection

Следующее задание выбирается не только по сложности, а по ожидаемой информационной ценности.

```ts
score(item) =
  gapSeverity
  + missingFamilyBonus
  + prerequisiteUnlockBonus
  + targetRelevance
  + diversityBonus
  - redundancyPenalty
  - overloadPenalty
  - recentExposurePenalty;
```

## 8.3. Stop rules

Остановить диагностику темы, если:

- есть два согласованных независимых сигнала по одной family;
- достигнут достаточный coverage для маршрутизации;
- две последовательные ошибки показывают один и тот же базовый misconception;
- дальнейший вопрос не изменит recommended route;
- пользователь выбрал `Не знаю` в нескольких соседних уровнях сложности.

После stop:

```text
Пробел уже локализован.
Дополнительные вопросы сейчас мало что добавят.
Следующий шаг — короткое обучение механизму.
```

# 9. Session Builder v2

Сессия больше не собирается как произвольный список слабых тем.

## 9.1. Acquisition sequence

```text
canonical explanation
→ worked example
→ predict before reveal
→ contrast example
→ guided completion/debug
→ short independent task
→ reflection
```

## 9.2. Consolidation sequence

```text
retrieval without hint
→ code trace
→ short production
→ feedback
→ schedule delayed review
```

## 9.3. Transfer sequence

```text
work-like problem
→ user plan
→ independent implementation/review
→ edge cases/trade-offs
→ transfer evidence
```

## 9.4. LearningSequenceBlueprint

Добавить новый versioned content artifact:

```json
{
  "schemaVersion": "1.0",
  "key": "js.references.acquisition-v1",
  "version": 1,
  "topicKey": "cs.values-and-references",
  "phase": "ACQUISITION",
  "estimatedMinutes": 25,
  "steps": [
    {
      "kind": "CONTENT",
      "contentItemKey": "js.references.canonical-model",
      "version": 1
    },
    {
      "kind": "TASK",
      "taskKey": "js.references.predict-basic-001",
      "version": 1,
      "purpose": "PREDICT"
    }
  ],
  "completionRule": {
    "requiredSteps": 4,
    "minimumNoHelpSuccesses": 1
  }
}
```

# 10. Theory layer v2

Расширить content item kinds:

- `CONCEPT_NOTE`;
- `WORKED_EXAMPLE`;
- `CONTRAST_PAIR`;
- `SUBGOAL_EXAMPLE`;
- `COMMON_MISTAKE`;
- `CHECKLIST`;
- `REFERENCE_LINK`.

Теория не должна быть длинной лекцией. Один acquisition module обычно содержит:

- 300–700 слов canonical explanation;
- 1 worked example;
- 1 contrast pair;
- 1 common misconception;
- 1 короткое retrieval question;
- authoritative sources.

# 11. Evaluation coverage и частичные ответы

## 11.1. Проблема

Local exact-match может проверить `PREDICT_OUTPUT`, но не проверить объяснение. Показывать итоговый `0` некорректно.

## 11.2. Контракт

```ts
export interface EvaluationCoverage {
  evaluatedDimensions: string[];
  pendingDimensions: string[];
  unsupportedDimensions: string[];
  isFinal: boolean;
}

export interface EvaluationResultV2 {
  score: number | null;
  passed: boolean | null;
  dimensionScores: Record<string, number>;
  coverage: EvaluationCoverage;
  feedback: string[];
}
```

Если существенные dimensions pending:

```text
Локальная проверка завершена частично.
Полный итог появится после проверки объяснения.
```

Не отображать provisional result как окончательный mastery signal.

# 12. AI-assisted architecture

## 12.1. Первая функция: Attempt Rubric Grading

Назначение:

- оценить свободное объяснение;
- выделить правильные части;
- выделить misconception;
- оценить rubric dimensions;
- вернуть reliability и warnings;
- создать candidate, а не direct evidence.

Поток:

```text
Attempt
→ deterministic evaluation
→ AI evaluation request
→ structured candidate
→ local schema/domain validation
→ preview
→ user apply/reject
→ Evaluation/Evidence
→ TopicState and capability recompute
```

## 12.2. Вторая функция: Content AI Review

CLI:

```bash
pnpm content:ai-review -- --pack js-prebaseline-v1
```

Проверяет:

- соответствие learning outcome;
- двусмысленность;
- терминологическую сложность;
- корректность answer/test/rubric;
- edge-case trivia risk;
- дубли;
- качество sources;
- соответствие assessment stage;
- наличие contrast sibling;
- корректность misconception tags.

AI ничего не публикует автоматически.

## 12.3. Третья функция: One Nudge

Одна минимальная подсказка:

- не раскрывает ответ;
- не содержит готовый код;
- сохраняет `HelpLevel`;
- имеет отдельный budget quota;
- может быть отключена.

## 12.4. Позже: Misconception Synthesis

Включать только после накопления достаточного числа связанных попыток.

## 12.5. Не добавлять

- общий чат;
- генерацию готового решения в learning loop;
- autonomous agents;
- автоматическое изменение статусов;
- AI readiness score.

# 13. AI provider abstraction

```ts
export interface AiProvider {
  evaluateAttempt(
    input: EvaluateAttemptInput,
  ): Promise<AiAttemptEvaluationCandidate>;

  generateNudge(input: GenerateNudgeInput): Promise<AiNudgeCandidate>;

  reviewContent(input: ReviewContentInput): Promise<ContentReviewResult>;
}
```

Предлагаемая структура:

```text
packages/ai-provider/
  src/provider.ts
  src/openai-provider.ts
  src/model-router.ts
  src/prompt-registry.ts
  src/cost-calculator.ts
  src/contracts/

apps/api/src/modules/ai/
  ai.module.ts
  ai-evaluation.service.ts
  ai-hint.service.ts
  ai-content-review.service.ts
  ai-budget.service.ts
  ai-audit.service.ts
```

# 14. AI database changes

Добавить через Prisma Migrate:

```prisma
enum AiFeature {
  ATTEMPT_EVALUATION
  NUDGE
  CONTENT_REVIEW
  MISCONCEPTION_SYNTHESIS
}

enum AiInvocationStatus {
  RESERVED
  RUNNING
  SUCCEEDED
  FAILED
  REJECTED_BUDGET
  CACHED
}

model AiPromptVersion {
  id            String   @id @default(uuid()) @db.Uuid
  key           String
  version       Int
  feature       AiFeature
  systemPrompt  String
  schemaVersion String
  checksum      String
  active        Boolean  @default(false)
  createdAt     DateTime @default(now())

  @@unique([key, version])
  @@index([feature, active])
}

model AiInvocation {
  id                   String             @id @default(uuid()) @db.Uuid
  userId               String             @db.Uuid
  feature              AiFeature
  status               AiInvocationStatus
  provider             String
  model                String
  promptKey            String
  promptVersion        Int
  inputHash            String
  cacheKey             String?
  inputTokens          Int?
  cachedInputTokens    Int?
  outputTokens         Int?
  estimatedCostUsd     Decimal            @default(0) @db.Decimal(10, 6)
  actualCostUsd        Decimal?           @db.Decimal(10, 6)
  latencyMs            Int?
  relatedAttemptId     String?            @db.Uuid
  relatedTaskVersionId String?            @db.Uuid
  errorCode            String?
  createdAt            DateTime           @default(now())
  completedAt          DateTime?

  @@index([userId, createdAt])
  @@index([feature, status])
  @@index([cacheKey])
}

model AiEvaluationDraft {
  id             String   @id @default(uuid()) @db.Uuid
  invocationId   String   @unique @db.Uuid
  attemptId      String   @db.Uuid
  normalizedJson Json
  preview        Json?
  appliedAt      DateTime?
  rejectedAt     DateTime?
  createdAt      DateTime @default(now())

  @@index([attemptId, createdAt])
}

model AiBudgetPeriod {
  id          String   @id @default(uuid()) @db.Uuid
  userId      String   @db.Uuid
  period      String
  limitUsd    Decimal  @db.Decimal(8, 2)
  spentUsd    Decimal  @default(0) @db.Decimal(10, 6)
  reservedUsd Decimal  @default(0) @db.Decimal(10, 6)
  updatedAt   DateTime @updatedAt

  @@unique([userId, period])
}
```

Полные input/output bodies не писать в обычные logs. Допустимо хранить normalized result и hash входа. Сырые ответы уже хранятся в Attempt.

# 15. Budget policy

## Default

```env
AI_MODE=manual
AI_MONTHLY_BUDGET_USD=10
AI_ATTEMPT_REVIEW_ENABLED=false
AI_NUDGE_ENABLED=false
AI_CONTENT_REVIEW_ENABLED=false
```

Функции включаются отдельно.

## Алгоритм

```text
estimate max cost
→ begin transaction
→ check remaining budget
→ reserve
→ invoke provider
→ reconcile actual cost
→ release unused reserve
```

При исчерпании:

```text
API-проверка временно недоступна: месячный лимит исчерпан.
Экспорт и ручной импорт продолжают работать.
```

# 16. Кэширование

Ключ:

```text
taskVersion checksum
+ answer hash
+ rubric hash
+ prompt version
+ model
+ evaluator contract version
```

Повторная идентичная проверка не должна тратить деньги.

# 17. API changes

## Capability

```text
GET /api/v1/topics/:topicKey/capability-profile
GET /api/v1/users/me/capability-summary
GET /api/v1/recommendations/next-v2
```

## AI

```text
POST /api/v1/ai/attempts/:attemptId/evaluate
GET  /api/v1/ai/evaluations/:draftId
POST /api/v1/ai/evaluations/:draftId/apply
POST /api/v1/ai/evaluations/:draftId/reject
POST /api/v1/ai/attempts/:attemptId/nudge
GET  /api/v1/ai/usage/current
```

## Assessments

```text
POST /api/v1/assessments/prebaseline/start
POST /api/v1/assessments/:runId/next
GET  /api/v1/assessments/:runId/routing-profile
```

`next` должен возвращать либо item, либо stop decision с explanation.

# 18. UI refactor

## 18.1. Assessment catalog

Показывать:

- Быстрая калибровка JavaScript;
- Расширенная диагностика JavaScript Core;
- Диагностика выбранной темы;
- planned sections отдельно, без фиктивных кнопок.

## 18.2. Active assessment

Добавить:

- понятный кластер;
- `Не знаю`;
- autosave;
- partial evaluation state;
- stop decision;
- без сложного термина до проверки механизма.

## 18.3. Topic page

Основной блок:

```text
Общий статус: слабая опора
Данных достаточно для первичного маршрута

Терминология       неизвестно
Механизм           слабый
Чтение кода        частично
Отладка            не проверено
Код руками         не проверено
Перенос            не проверено
```

Проценты — только в раскрываемом техническом блоке.

## 18.4. Dashboard

Одна рекомендация:

```text
Сейчас полезнее всего
Ссылки и объекты: понять механизм
15–20 минут
worked example → prediction → короткий debug
```

## 18.5. AI review preview

Показывать:

- правильные части;
- ошибки;
- dimension scores;
- reliability;
- evidence, которое будет создано;
- projected state diff;
- стоимость запроса;
- `Применить` / `Отклонить`.

## 18.6. AI usage

Settings или Metrics:

- месячный лимит;
- потрачено;
- число запросов;
- средняя цена;
- cache hits;
- ошибки;
- applied/rejected ratio;
- model/prompt versions.

# 19. Analytics без ложной точности

Полезно:

- capability coverage;
- достаточность данных;
- no-help success;
- delayed retrieval;
- transfer evidence;
- repeat misconception reduction;
- calibration gap;
- pending review count;
- evaluator agreement на gold dataset;
- AI cost per applied evaluation.

Не использовать как главные:

- minutes learned;
- solved count;
- average score;
- daily activity;
- один overall readiness при низком coverage.

# 20. Vector search

## Решение на сейчас

Не внедрять.

## Условие пересмотра

Рассматривать embeddings, когда:

- > 500–1000 задач;
- большое число текстовых misconceptions;
- есть реальная проблема semantic duplicates;
- rule-based task selection не справляется.

Тогда:

- расширить текущий PostgreSQL через `pgvector`;
- сначала exact cosine search;
- использовать embeddings только как candidate retrieval;
- финальный выбор остаётся rule-based и объяснимым.

# 21. Migration strategy

## Existing content

- `js-baseline-v1` остаётся immutable;
- UI title меняется без изменения machine key;
- v1 metadata нормализуется conservatively;
- старые AssessmentRun snapshots продолжают работать.

## Existing sessions

Backfill `learningPhase`:

```text
ASSESSMENT → CALIBRATION
TRAINING   → ACQUISITION
REVIEW     → CONSOLIDATION
RETURN     → CONSOLIDATION
INTERVIEW  → TRANSFER
BATTLE     → TRANSFER
```

## Existing evaluations

- старые deterministic evaluations получают coverage из evaluator type;
- exact match покрывает только explicit dimensions;
- свободный текст остаётся pending;
- не пересчитывать историю необратимо без algorithm version bump.

## Algorithm versions

Новые версии:

```text
capability-profile-v1.0
recommendation-v2.0
mastery-v1.x (если базовая формула не меняется)
```

Если меняется mastery formula — отдельный ADR и version bump.

# 22. Testing strategy

## Unit

- capability projection;
- family coverage;
- stop rules;
- item scoring;
- session sequence composition;
- partial evaluation coverage;
- budget reservation/reconciliation;
- cache key stability;
- AI response normalization;
- old metadata normalization.

## Integration

- pre-baseline start/next/complete;
- concurrent autosave;
- AI draft create/preview/apply/reject;
- budget race condition;
- idempotent apply;
- old run snapshot compatibility;
- content import v1 + v2;
- rollback AI-created evidence.

## Contract

- JSON schemas;
- OpenAPI drift;
- provider structured outputs;
- content pack v2 validation;
- external import v1 compatibility.

## E2E

1. Новый пользователь проходит pre-baseline.
2. Две ошибки вызывают stop и acquisition recommendation.
3. Пользователь проходит learning sequence.
4. Свободный ответ получает partial local state.
5. AI review создаёт preview.
6. Apply меняет evidence и capability profile.
7. Budget limit блокирует новый AI request, manual export работает.
8. Старый baseline run продолжается после обновления.

# 23. Documentation to create/update

Создать:

```text
docs/product/learning-system-v2.md
docs/product/pre-baseline.md
docs/domain/capability-profile.md
docs/domain/adaptive-selection.md
docs/domain/session-builder.md
docs/ai/architecture.md
docs/ai/evaluator.md
docs/ai/budget-and-privacy.md
docs/content/content-schema-v2.md
docs/content/quality-gates.md
docs/adr/0002-capability-model.md
docs/adr/0003-ai-assisted-evaluation.md
```

Обновить:

```text
README.md
AGENTS.md
.env.example
docs/architecture/overview.md
docs/architecture/data-flow.md
docs/domain/data-model.md
docs/domain/learning-engine.md
docs/api/overview.md
docs/product/future-roadmap.md
docs/content/authoring.md
docs/content/schema.md
docs/quality/testing.md
SECURITY.md
```

# 24. Implementation phases

## Phase 0 — Documentation and ADR only

Никакого runtime behavior.

## Phase 1 — Content schema v2 and evaluation coverage

- metadata schema;
- v1 compatibility;
- partial evaluation UX;
- tests.

## Phase 2 — Capability profile

- pure calculation;
- API projection;
- Topic UI matrix;
- no DB materialization.

## Phase 3 — Recommendation and session builder v2

- route by gap family;
- learning phase;
- sequence blueprint;
- stop rules.

## Phase 4 — JS Pre-Baseline

- new content pack;
- routing profile;
- e2e.

## Phase 5 — Acquisition content

- first complete learning sequence for values/references/mutability;
- worked examples;
- delayed review;
- transfer to React state-like case.

## Phase 6 — AI platform and attempt grading

- provider abstraction;
- DB migration;
- budget;
- structured evaluation;
- preview/apply/reject;
- gold dataset calibration.

## Phase 7 — AI content review and one nudge

- CLI reports;
- hint constraints;
- audit UI.

## Phase 8 — User trial and correction

- пройти pre-baseline;
- пройти одну acquisition sequence;
- собрать UX findings;
- не начинать массовый React/TS content до проверки цикла.

# 25. Global acceptance criteria

Рефакторинг считается успешным, если:

- существующие ответы не потеряны;
- старый baseline продолжает работать;
- новый пользователь сначала проходит короткую калибровку;
- система различает минимум mechanism, trace, debug, production и transfer gaps;
- после достаточного сигнала диагностика останавливается;
- рекомендация объясняет не только тему, но и тип пробела;
- есть хотя бы один полный acquisition sequence;
- partial local evaluation не выглядит окончательным нулём;
- AI grading проходит schema validation и preview;
- AI не может назначить status;
- hard budget невозможно обойти конкурентными запросами;
- manual mode остаётся полноценным;
- content v1 и v2 импортируются;
- lint, typecheck, unit, integration, e2e, build и Docker проходят;
- документация соответствует поведению.

# 26. Главные риски

| Риск | Защита |
|---|---|
| слишком сложная доменная модель | capability profile как projection, без ранней материализации |
| AI оценивает убедительно, но неверно | gold dataset, preview, reliability, manual reject |
| массовый плохой контент | bounded batches и quality gates |
| уничтожение истории | immutable versions и migration tests |
| псевдонаучная адаптивность | rule-based v2, IRT deferred |
| продукт становится AI-чатом | feature-specific endpoints only |
| разработка приложения заменяет обучение | Phase 8 обязательна до расширения curriculum |

# 27. Следующее решение

Первое изменение кода должно быть ограничено Phase 1:

> Content schema v2 + evaluation coverage + корректный UX частично проверенного ответа.

Это создаёт правильный контракт для последующего pre-baseline и AI evaluator, не затрагивая пока сложные миграции и не ломая существующий learning loop.
