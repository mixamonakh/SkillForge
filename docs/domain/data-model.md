# Доменная модель данных

## Агрегаты

### Профиль

`User` — один локальный пользователь MVP; `UserSettings` содержит target track, default load/code mode, manual AI mode, нулевой budget, resume threshold, theme и reduced motion. Даже в single-user режиме все пользовательские записи имеют `userId`.

### Curriculum/content

`Track` содержит `Topic`; `TopicDependency` задаёт prerequisites. `ContentItem`, `Task` и `TaskVersion` версионируют материалы. `TaskTestCase` связан с конкретной версией. `AssessmentBlueprint` и items фиксируют состав baseline.

Курируемый source of truth находится в `content/packs`; БД хранит импортированное состояние и ссылки, необходимые для attempts/provenance.

### Прохождение

`AssessmentRun` сохраняет snapshot blueprint/task versions, текущий блок/позицию и lifecycle. Assessment связан с `LearningSession`; `SessionItem` фиксирует упорядоченную TaskVersion. `Attempt` принадлежит пользователю, session и TaskVersion и обновляется autosave с optimistic revision.

Snapshot позволяет продолжить старую попытку после релиза нового content pack.

### Оценка и знание

`Evaluation` — append-only результат `EXACT_MATCH`, `TEST_RUNNER`, `MANUAL`, `EXTERNAL_AI`, `API_AI` или `SELF_REPORT`. `Evidence` проецирует evaluation на topic/evidence kind со score, weight, occurredAt и provenance.

`TopicState` хранит пересчитанный status/estimate/confidence/counters/review. Это cache, а не первичное доказательство. `ReviewSchedule` задаёт следующий retrieval отдельно от mastery status. `Misconception` и topic links описывают конкретные паттерны ошибок.

### Внешние данные

`ExportBundle` хранит immutable payload и checksum. `ImportBatch` хранит raw/normalized payload, validation errors, preview, status и appliedAt. `ExternalArtifact` хранит работу/PR/задачу; evidence создаётся отдельным подтверждённым действием. `MetricSnapshot` фиксирует агрегаты вместе с algorithm version.

### Target profile

`TargetTrack` версионирует карьерный профиль и sources. `TargetTrackRule` связывает его с track/topic, weights, minimum и gates. Это позволяет объяснить readiness и сохранить историческую интерпретацию.

## Связи в сокращённом виде

```text
User ─┬─ AssessmentRun ─ LearningSession ─ SessionItem ─ TaskVersion
      │                              └──── Attempt ─ Evaluation ─ Evidence ─ Topic
      ├─ TopicState ─ Topic
      ├─ ReviewSchedule ─ Topic
      ├─ ExportBundle / ImportBatch
      └─ ExternalArtifact ─ Evidence

Track ─ Topic ─ Task ─ TaskVersion ─ TaskTestCase
             └─ ContentItem
AssessmentBlueprint ─ AssessmentBlueprintItem ─ TaskVersion
TargetTrack ─ TargetTrackRule ─ Topic/Track
```

## Инварианты БД/домена

1. `Topic.key` и `Task.stableKey` уникальны и не зависят от title.
2. Пара stable key + version уникальна; checksum фиксирует содержимое.
3. Used TaskVersion не меняется и не удаляется.
4. Attempt относится ровно к одному user и TaskVersion; autosave revision монотонна.
5. Evaluation не обновляется задним числом; новая запись может supersede старую.
6. Evidence имеет provenance и относится к user/topic.
7. TopicState можно полностью пересчитать из Evidence.
8. ImportBatch APPLIED и checksum защищают от повторного evidence.
9. Run/session после restart продолжаются из PostgreSQL.
10. Даты хранятся UTC; индексы покрывают user/status/due/occurredAt.

## Миграции

Схема изменяется только через сохранённые Prisma migrations. `prisma db push` не является production workflow. Destructive изменение требует backup, явного плана преобразования и проверки сохранности attempts/evidence.
