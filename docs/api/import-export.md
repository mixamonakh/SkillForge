# Import / Export API contract

## Принципы

JSON — machine contract; Markdown — human/ChatGPT wrapper над тем же JSON. Schema version обязательна, canonical payload имеет SHA-256 checksum, export immutable, import недоверен. Любое применение сначала previewed и атомарно.

Точные runtime schemas и JSON Schema artifacts принадлежат `packages/contracts`; изменения этого документа сами по себе контракт не меняют.

## ExportBundle v1

`schemaVersion` строго `"1.0"`. Bundle содержит UUID `bundleId`, `generatedAt`, `appVersion`, `bundleType`, user metadata, scope, topic snapshots, attempts и `requestedAnalysis`.

`bundleType`:

- `assessment-run`;
- `session`;
- `topic`;
- `profile`;
- `pending-review`.

Scope валидируется строго и не допускает лишних полей:

| Bundle type      | Допустимый scope                               |
| ---------------- | ---------------------------------------------- |
| `assessment-run` | `{ "id": "<assessment UUID>" }`                |
| `session`        | `{ "id": "<session UUID>" }`                   |
| `topic`          | `{ "topicKey": "js.runtime.event-loop" }`      |
| `profile`        | `{ "from"?: "<ISO UTC>", "to"?: "<ISO UTC>" }` |
| `pending-review` | `{}`                                           |

Дата `to` не может предшествовать `from`. Неизвестный concrete scope и scope без попыток
возвращают читаемую ошибку и не создают пустой immutable bundle; profile без попыток остаётся
валидным снимком текущей карты тем.

Attempt включает ID, task key/version, topic key/kind, prompt, nullable answer text/code, self-rating, confidence, help level и nullable deterministic evaluation. Export scope обязан реально фильтровать данные; он не включает чужие/несвязанные attempts.

Пример каркаса:

```json
{
  "schemaVersion": "1.0",
  "bundleId": "00000000-0000-4000-8000-000000000001",
  "generatedAt": "2026-07-11T10:30:00.000Z",
  "appVersion": "1.0.0",
  "bundleType": "pending-review",
  "user": {
    "displayName": "Михаил",
    "targetTrack": "yandex-frontend-2026",
    "locale": "ru"
  },
  "scope": {},
  "topics": [],
  "attempts": [],
  "requestedAnalysis": {
    "contract": "skillforge-analysis-v1",
    "language": "ru",
    "instructions": []
  }
}
```

## Markdown wrapper

Wrapper инструктирует внешнего evaluator оценивать только evidence, не повышать статус из вежливости и вернуть только `skillforge-analysis-v1`. Затем содержит fenced JSON полного bundle. Parser допускает contractually supported fence, но не ищет JSON произвольным regex по тексту.

## SkillForgeAnalysisV1

Обязательные верхние поля:

- `schemaVersion: "1.0"`;
- `contract: "skillforge-analysis-v1"`;
- UUID `sourceBundleId`; наличие и точный scope локального export проверяются отдельно и отражаются в preview;
- evaluator `{ kind: "external-ai", model?, analyzedAt }`;
- массив `attemptEvaluations`;
- recommendations, summary, warnings.

Каждая attempt evaluation содержит UUID для последующего exact match, score 0..100, nullable passed, reliability 0..1 (default 0.65), dimension scores 0..100, feedback Markdown, misconceptions и topic evidence. `topicKey` должен точно совпасть со stable key; похожий title не маппится автоматически.

External payload не содержит команды смены mastery/status/settings. Неизвестное поле strict schema отклоняет; молчаливое применение запрещено.

## Validate

`POST /api/v1/imports/validate` принимает JSON paste/file в пределах 5 MiB и:

1. проверяет размер, content type, depth/array limits;
2. безопасно удаляет только поддерживаемый Markdown fence;
3. parse JSON;
4. проверяет schema/contract version и unknown fields policy;
5. canonicalizes и вычисляет checksum;
6. проверяет duplicate checksum и наличие source bundle;
7. сохраняет прошедший schema contract ImportBatch как `VALIDATED`, добавляя warnings о duplicate или отсутствующем source bundle.

Malformed JSON, unsupported version и invalid UUID возвращают readable API error до создания ImportBatch. Текущий endpoint не сохраняет такие payload как `REJECTED`.

Unknown source bundle не является schema error: validation возвращает warning, а preview считает все его attempt/topic references неизвестными. Это позволяет пользователю увидеть безопасный diff; такой batch не создаёт knowledge evidence при apply.

Последний применённый import можно отменить через `POST /api/v1/imports/:importId/rollback`. Компенсирующая транзакция удаляет только созданные этим batch evaluations/evidence, а при наличии affected topics пересчитывает TopicState и сохраняет audit snapshot; исходные ответы не меняются. Более старый import нельзя отменить раньше нового.

## Preview

`POST /api/v1/imports/:importId/preview` не меняет evidence. Он показывает:

- source bundle;
- matched/unknown attempts;
- matched/unknown topics;
- validation warnings;
- число evaluations для matched attempts;
- число Evidence, которое действительно может быть создано;
- `suppressedEvaluationEffects` для pre-baseline attempts: audit Evaluation будет создана, но
  `Evidence=SUPPRESSED`, `TopicState=NO_MUTATION`, `mastery=NO_MUTATION`;
- dry-run current → projected TopicState;
- recommendations и причины;
- предупреждение о duplicate checksum возвращается на validation stage.

Simulation использует ту же версию learning engine, что apply. Preview сохраняется для audit; apply повторно проверяет source scope и пересчитывает темы из актуального evidence state.

### Pre-baseline no-mutation policy

Attempt, связанный с assessment snapshot v2 `kind=ADAPTIVE_PREBASELINE`, является только routing
signal. Внешний evaluator может вернуть для него Evaluation, feedback и misconception findings:
Evaluation сохраняется как immutable audit record. Однако preview и apply независимо, по
актуальному snapshot в PostgreSQL, запрещают создавать связанный Evidence, `TopicMisconception`,
`TopicState`, `ReviewSchedule` или mastery `MetricSnapshot`.

Проверка fail-closed: даже частично повреждённый snapshot с маркерами `schemaVersion=2.0` и
`kind=ADAPTIVE_PREBASELINE` остаётся подавленным. Apply не доверяет сохранённому preview и повторно
вычисляет policy внутри той же транзакции. Mixed import продолжает применять обычные attempts;
recompute выполняется только по их affected topics.

## Apply

`POST /api/v1/imports/:importId/apply` в одной PostgreSQL transaction:

1. lock ImportBatch;
2. вернуть idempotent response, если batch уже `APPLIED`, либо потребовать статус `PREVIEWED`;
3. повторно проверить source bundle и разрешить только attempts/topics из его immutable scope;
4. вставить immutable Evaluations;
5. upsert импортированные Misconceptions для matched evaluations;
6. создать Evidence с provenance только для attempts, не подавленных assessment policy;
7. recompute affected TopicState и ReviewSchedule только при непустом наборе affected topics;
8. создать MetricSnapshot только для реально изменённых тем;
9. отметить batch `APPLIED` и commit.

Ошибка откатывает всю транзакцию. Повторный запрос не дублирует evidence. Unknown references не создают evidence/status и перечисляются в preview. Original Attempt/answer не изменяется.

Если source bundle отсутствует или повреждён, explicit apply является безопасным no-op для knowledge state: batch получает `APPLIED` для audit/idempotency, а Evaluation/Evidence/TopicState/MetricSnapshot не создаются и не изменяются.

## Download и audit

`GET /exports/:id/download?format=json|markdown` возвращает сохранённый immutable bundle, а не заново собранный payload под тем же ID. Список imports показывает status, source, checksum, createdAt и appliedAt без полного sensitive body. Детальный endpoint дополнительно возвращает sourceBundleId, сохранённый preview, validationErrors и normalized JSON.

Кнопка `Отклонить` в preview только отказывается от применения в текущем UI и оставляет audit batch в `PREVIEWED`; отдельного reject endpoint в MVP нет. Для уже применённого import доступна только явная latest-only компенсация через `POST /api/v1/imports/:importId/rollback`: она сохраняет audit trail и не удаляет исходные ответы. Полный DB restore остаётся отдельной операцией из backup.
