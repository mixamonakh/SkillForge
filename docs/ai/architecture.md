# Bounded AI architecture

Статус: целевой контракт Phases 6–7. Manual mode остаётся рабочим независимо от реализации/доступности внешнего provider.

## Разрешённые features

- rubric grading свободного ответа;
- content review без автоматического изменения JSON;
- одна минимальная подсказка (`NUDGE`) на попытку;
- misconception synthesis только после отдельного решения и достаточного evidence.

Общий AI-чат, генерация готового решения в learning loop, direct mastery/status updates и autonomous agent framework запрещены.

## Modes

- `manual`: export → внешний инструмент → strict import preview/apply; API key не нужен.
- `api-assisted`: feature-specific server endpoints при явных feature flags и наличии key.
- отсутствие key, timeout или provider error не блокирует assessment/session и не отключает manual workflow.

## Boundaries

Provider abstraction живёт в отдельном workspace package и не знает о Prisma/Nest/UI. API module владеет attempt lookup, authorization, prompt selection, atomic budget, cache/audit, domain validation и apply transaction. OpenAI adapter использует Responses API и Structured Outputs, но любой ответ повторно проверяется локальной strict runtime schema.

```text
Attempt + immutable TaskVersion/rubric
→ deterministic partial evaluation
→ reserve budget/cache lookup
→ provider structured candidate
→ local schema + domain validation
→ persisted draft/preview
→ explicit apply or reject
→ ordinary Evaluation/Evidence
→ learning-engine recompute
```

AI никогда не записывает `TopicState`. Candidate reliability ограничена контрактом и не может одной записью создать mastery.

## Versioning

Prompt имеет stable key, integer version, feature, schema version и checksum. Cache key включает task checksum, answer hash, rubric hash, prompt version, model и evaluator contract version. Model IDs настраиваются server-side env.

## Provider implementations

- fake provider: deterministic fixtures для unit/integration/e2e без сети и оплаты;
- OpenAI provider: opt-in adapter для `api-assisted`; live smoke отделён от обязательного test suite;
- disabled/manual provider: безопасная ошибка с продолжением manual workflow.

Fake provider поддерживает immutable fixtures и test-only validated resolvers. Он существует для unit/integration/e2e и отчётов pipeline: его результат всегда маркируется provider/model metadata и не является основанием публикации content или педагогическим утверждением.

## Operations

CLI/API smoke не печатает key или answer body. Usage endpoint показывает budget aggregates, cache hits, failures, prompt/model versions и applied/rejected ratio без персонального текста.

## Web lifecycle

- Pending free-text attempts показывают review surface в итогах assessment и в reflection/summary learning session.
- UI валидирует `evaluation`, `usage` и `nudge` responses собственными strict runtime schemas. Draft ID сохраняется локально только как указатель для повторного `GET`; candidate и preview всегда перечитываются из API.
- `Apply` и `Reject` доступны только для `PENDING`, `Rollback` — только для `APPLIED`. Ошибка AI mutation имеет отдельный `aria-live` status и не блокирует autosave, submit, pause или complete.
- В manual/feature-disabled режиме остаётся ссылка на scoped export: `assessmentRunId` для диагностики и `sessionId` для learning session.
- One nudge показывается как сохранённый статический текст только для активного unsubmitted Attempt. Повторного chat input или цепочки сообщений нет.
- Settings загружает usage отдельным query, поэтому недоступность usage endpoint не мешает изменению остальных настроек.

Связанные документы: [evaluator](evaluator.md), [budget/privacy](budget-and-privacy.md), [ADR](../adr/0011-ai-assisted-evaluation.md).
