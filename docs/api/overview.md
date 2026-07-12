# REST API

## Общий контракт

- base path: `/api/v1`;
- JSON request/response, кроме явного download;
- Swagger UI: `/api/docs`;
- OpenAPI JSON: `/api/openapi.json`;
- ISO 8601 UTC timestamps;
- DTO/runtime validation на boundary;
- cursor pagination для списков;
- request ID во входящем/исходящем запросе и error envelope;
- local same-origin proxy через Next.js;
- hidden test source не возвращается обычному client payload, насколько позволяет browser-runner MVP.

API version и import/export schema version независимы. Breaking HTTP change требует нового API version/совместимого transition; старый ExportBundle остаётся воспроизводимым.

## Error envelope

```json
{
  "error": {
    "code": "ASSESSMENT_RUN_NOT_ACTIVE",
    "message": "Диагностика не находится в активном состоянии",
    "requestId": "req_...",
    "details": {}
  }
}
```

`message` безопасен для пользователя. Validation details не содержат stack, SQL или answer body. Клиент строит поведение по stable `code`, не по русскому тексту.

## Health

```text
GET /api/v1/health/live
GET /api/v1/health/ready
```

Readiness проверяет PostgreSQL/migrations и возвращает app/content pack version; liveness подтверждает процесс. Readiness failure корректно делает контейнер unhealthy.

## Profile и curriculum

```text
GET   /api/v1/profile
PATCH /api/v1/profile/settings
POST  /api/v1/profile/reset-preview
POST  /api/v1/profile/reset-confirm

GET /api/v1/tracks
GET /api/v1/tracks/:trackKey
GET /api/v1/topics?track=&status=&reviewDue=&search=
GET /api/v1/topics/:topicKey
GET /api/v1/topics/:topicKey/evidence
GET /api/v1/content?topicKey=&kind=&cursor=
```

Reset требует typed confirmation и не объединяется с preview. Topic keys валидируются как stable machine keys; похожий русский title не используется для поиска identity.

## Assessment

```text
GET  /api/v1/assessments
GET  /api/v1/assessments/:key
POST /api/v1/assessments/:key/runs
GET  /api/v1/assessment-runs/:runId
POST /api/v1/assessment-runs/:runId/start
POST /api/v1/assessment-runs/:runId/pause
POST /api/v1/assessment-runs/:runId/resume
POST /api/v1/assessment-runs/:runId/complete-block
POST /api/v1/assessment-runs/:runId/complete
```

Create run фиксирует snapshot blueprint/TaskVersion. Lifecycle transition идемпотентен там, где это безопасно, либо возвращает stable conflict error. Free-text completion остаётся pending external review.

## Attempts/autosave

```text
PUT  /api/v1/sessions/:sessionId/items/:itemId/attempt
POST /api/v1/attempts/:attemptId/submit
POST /api/v1/attempts/:attemptId/run-code
GET  /api/v1/attempts/:attemptId/evaluations
```

Пример optimistic autosave:

```json
{
  "revision": 4,
  "answerText": "...",
  "answerCode": "...",
  "selectedOptions": [],
  "selfRating": 3,
  "confidence": 55,
  "helpLevel": "NONE",
  "clientUpdatedAt": "2026-07-11T10:30:00Z"
}
```

Повтор того же revision/payload должен быть безопасен. Stale revision возвращает HTTP 409 `ATTEMPT_REVISION_CONFLICT` и current server copy. API не выполняет arbitrary code в серверном процессе.

## Learning sessions

```text
GET  /api/v1/sessions/recommendation
POST /api/v1/sessions/plan
POST /api/v1/sessions
GET  /api/v1/sessions/:sessionId
POST /api/v1/sessions/:sessionId/start
POST /api/v1/sessions/:sessionId/pause
POST /api/v1/sessions/:sessionId/complete
GET  /api/v1/sessions?status=&cursor=
```

Plan — preview, create — persistence. Topic selection проверяет prerequisites; Dashboard recommendation остаётся одной основной.

## Metrics

```text
GET /api/v1/metrics/dashboard
GET /api/v1/metrics/topics
GET /api/v1/metrics/readiness/:targetKey
GET /api/v1/metrics/calibration
GET /api/v1/metrics/misconceptions
```

Каждый metric response содержит `dataSufficiency`; `value` nullable. Readiness без coverage не возвращает fake zero.

## Import/export и external artifacts

```text
POST /api/v1/exports
GET  /api/v1/exports/:bundleId
GET  /api/v1/exports/:bundleId/download?format=json|markdown
POST /api/v1/imports/validate
POST /api/v1/imports/:importId/preview
POST /api/v1/imports/:importId/apply
POST /api/v1/imports/:importId/rollback
GET  /api/v1/imports
GET  /api/v1/imports/:importId

POST   /api/v1/external-artifacts
GET    /api/v1/external-artifacts
GET    /api/v1/external-artifacts/:id
PATCH  /api/v1/external-artifacts/:id
DELETE /api/v1/external-artifacts/:id
POST   /api/v1/external-artifacts/:id/create-evidence
```

Полный import contract: [import-export.md](import-export.md). Content mutation API в MVP отсутствует; content admin выполняется CLI.

## Concurrency, pagination, logging

Write requests применяют optimistic concurrency там, где пользователь может редактировать draft. Cursor непрозрачен; сортировка стабильна и документирована в OpenAPI. API пишет requestId, route, status, duration и errorCode, но не body ответа/attempt/import payload.
