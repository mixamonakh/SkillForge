# Потоки данных

## Assessment и autosave

```text
Start baseline
→ API создаёт AssessmentRun и immutable snapshot blueprint/task versions
→ API создаёт/связывает LearningSession и SessionItems
→ Web показывает текущий item
→ ввод сразу попадает в emergency local draft
→ debounce PUT attempt(revision)
→ API проверяет lifecycle, user scope и revision
→ PostgreSQL обновляет Attempt и увеличивает revision
→ Web помечает draft synced
```

При stale revision API возвращает `409 ATTEMPT_REVISION_CONFLICT` и server copy. Refresh/restart восстанавливает позицию и ответы из PostgreSQL; local draft используется только для ещё не подтверждённого изменения.

Pause и resume меняют lifecycle атомарно и сохраняют `currentBlock`, `currentPosition`, `pausedAt`/`lastStepLabel`. Complete невозможен из недопустимого состояния.

## Детерминированная оценка

```text
Attempt source + public harness
→ отдельный browser Web Worker
→ timeout/network/output guards
→ RunnerResponse
→ submit/run result в API
→ immutable Evaluation(EXACT_MATCH | TEST_RUNNER) с EvaluationCoverage
→ Evidence только для явно проверенной dimension, с provenance
→ learning-engine recompute affected topics
→ upsert TopicState + ReviewSchedule в transaction
```

API не выполняет пользовательский код в собственном процессе. Hidden browser tests не считаются секретными.
Если rubric содержит непроверенные criteria, evaluation хранит `score: null`, `passed: null` и
отдельный `dimensionScores`; UI показывает «проверено частично», а не итоговый ноль. Свободное
объяснение остаётся pending до внешней или AI-assisted проверки.

## Export

```text
User selects scope/format
→ API читает только user-scoped data
→ validates ExportBundleV1
→ canonical serialization + SHA-256
→ immutable ExportBundle в DB
→ JSON либо Markdown wrapper с fenced JSON
```

Markdown не заменяет machine contract. Pending free-text явно отделён от deterministic results.

## Import

```text
Paste/upload (≤5 MiB)
→ parse/de-fence + limits + strict SkillForgeAnalysisV1 validation
→ checksum duplicate check
→ ImportBatch VALIDATED
→ match bundle/attempt/topic, собрать warnings
→ dry-run learning engine
→ preview current → projected
→ explicit Apply
→ one DB transaction:
   lock batch → evaluations → misconceptions → evidence
   → recompute topic states/reviews → metric snapshot → APPLIED
```

Unknown attempt/topic не создаёт mastery молча. Повтор checksum не создаёт evidence. Исходные Attempt и ExportBundle не изменяются. Отмена реализуется compensating action/snapshot, а не удалением provenance.

## Mastery recompute

`Evaluation` описывает результат evaluator; `Evidence` нормализует влияние на topic/dimension; `TopicState` является cache. Для каждой затронутой темы:

1. выбираются актуальные evidence пользователя;
2. учитываются reliability, evidence weight, help/autonomy и recency;
3. рассчитываются estimate и confidence;
4. применяются status gates и conflict rules;
5. отдельно рассчитываются `needsReview`/next review;
6. сохраняется algorithm version и explanation.

Удаление cache не теряет знание: TopicState можно воспроизвести из evidence.

## Capability projection

```text
user-scoped Evidence + Evaluation + latest submitted Attempt
→ TaskVersion pedagogy metadata и pending rubric dimensions
→ conservative family mapping
→ pure computeTopicCapabilityProfile (capability-profile-v1.0)
→ read-only topic profile / user summary
→ доступная capability matrix в Web
```

Projection не создаёт materialized row, не вызывает mastery recompute и не записывает `TopicState`. Pending dimension имеет nullable score и нулевой вес. До достаточных независимых signals estimate не публикуется.

## Dashboard/read models

Dashboard получает агрегаты через API: data sufficiency, одна recommendation, resume state, coverage и review candidates. Web не пересчитывает эти значения и не заполняет пропуски нулями. TanStack Query инвалидируется после write-use-case.

## External/Battle evidence

Пользователь создаёт artifact с source, acceptance criteria и links. Evidence `TRANSFER`/`BATTLE` появляется только после явного подтверждения или импортированной evaluation; один artifact сам по себе не является proof mastery.
