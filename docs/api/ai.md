# Bounded AI API

Все routes доступны под `/api/v1`. Они относятся только к локальному user scope и не принимают answer body: API читает уже сохранённый `Attempt`. `AI_MODE=manual` оставляет manual export/import рабочим, а paid endpoints отвечают `AI_PROVIDER_DISABLED` с `details.manualFallback=true`.

## Attempt evaluation lifecycle

```text
POST /ai/attempts/:attemptId/evaluate
GET  /ai/evaluations/:draftId
POST /ai/evaluations/:draftId/apply
POST /ai/evaluations/:draftId/reject
POST /ai/evaluations/:draftId/rollback
```

`evaluate` требует submitted Attempt и отправляет provider только ещё не проверенные rubric dimensions. Cache key включает immutable task checksum, answer/rubric hashes, prompt version, model и evaluator contract. Идентичный запрос для того же Attempt возвращает существующий draft; cache hit другого Attempt создаёт отдельные invocation/draft, rebinding-ит `attemptId`, повторно проходит local/domain validation и хранит source invocation provenance.

Evaluation response:

```json
{
  "draft": {
    "id": "uuid",
    "attemptId": "uuid",
    "status": "PENDING",
    "createdAt": "date-time",
    "appliedAt": null,
    "rejectedAt": null,
    "rolledBackAt": null,
    "appliedEvaluationId": null,
    "rollbackEvaluationId": null
  },
  "invocation": {
    "id": "uuid",
    "status": "SUCCEEDED",
    "provider": "fake",
    "model": "fake-deterministic-v1",
    "promptKey": "attempt-evaluator",
    "promptVersion": 1,
    "estimatedCostUsd": 0,
    "actualCostUsd": 0,
    "cacheHit": false,
    "cacheSourceInvocationId": null
  },
  "candidate": {},
  "preview": {
    "deterministicEvaluations": [],
    "candidateEvidence": [],
    "projectedChanges": [],
    "prebaselineSuppressed": false,
    "cost": { "estimatedUsd": 0, "actualUsd": 0, "cacheHit": false }
  },
  "actions": { "canApply": true, "canReject": true, "canRollback": false }
}
```

`candidate` — strict `skillforge-ai-attempt-evaluation-v1`. `projectedChanges` содержит только dry-run current/projected TopicState. Apply повторно проверяет актуальность rubric coverage, затем в одной transaction создаёт `EvaluatorType=API_AI` Evaluation, bounded Evidence и запускает learning-engine. Pre-baseline создаёт только audit Evaluation: `prebaselineSuppressed=true`, `projectedChanges=[]`, Evidence/TopicState не меняются.

Reject идемпотентно фиксирует audit status и не создаёт knowledge writes. Rollback не удаляет Attempt, answer, Evaluation или Evidence: новая compensating Evaluation supersede-ит applied Evaluation, после чего engine пересчитывает affected topic. Повтор apply/reject/rollback не дублирует записи.

## One nudge

```text
POST /ai/attempts/:attemptId/nudge
```

Подсказка разрешена один раз для unsubmitted Attempt активной session. Expected/reference fragments используются только как server-side forbidden list для local domain validation и очищаются из OpenAI wire input; hidden test code provider не получает. Успешный результат сохраняет `Attempt.helpLevel=NUDGE` и текст в `hintsUsed`; последующий autosave не может стереть уже раскрытую помощь. Повторный запрос возвращает ту же сохранённую подсказку без нового invocation/charge.

```json
{
  "attemptId": "uuid",
  "hintType": "NUDGE",
  "hint": "Один следующий маленький шаг.",
  "warnings": [],
  "helpLevel": "NUDGE",
  "cacheHit": false,
  "invocationId": "uuid"
}
```

## Usage

```text
GET /ai/usage/current
```

Read model возвращает UTC period, mode, feature flags, `limitUsd`, `spentUsd`, `reservedUsd`, `remainingUsd`, request/cache/failure counts, average cost, applied/rejected draft counts и aggregates по provider/model/prompt. Ответ не содержит prompt, answer или provider payload.

## Ошибки и fallback

- `AI_PROVIDER_DISABLED` (503) — manual mode или feature flag выключен;
- `AI_BUDGET_EXCEEDED` (429) — hard period limit не позволяет reservation;
- `AI_INVOCATION_IN_PROGRESS` (409) — exact concurrent request уже выполняется;
- `AI_REVIEW_NOT_REQUIRED` (422) — pending rubric dimensions отсутствуют;
- `AI_PREVIEW_STALE` (409) — coverage изменилась между preview и apply;
- `AI_DRAFT_NOT_FOUND` / `ATTEMPT_NOT_FOUND` (404) — resource отсутствует в user scope;
- `AI_DRAFT_TRANSITION_INVALID` (409) — lifecycle action несовместим со status;
- `AI_RESULT_INVALID` / `AI_PROVIDER_FAILED` (502) — local validation/provider failure; manual workflow остаётся доступен.

CLI `pnpm ai:usage` читает usage endpoint. `pnpm ai:smoke` проверяет readiness и usage; optional `AI_SMOKE_ATTEMPT_ID` и `AI_SMOKE_NUDGE_ATTEMPT_ID` запускают соответствующие actions, но CLI печатает только IDs/status/provider metadata и никогда не answer/hint body.
