# Session Builder v2

## LearningPhase и SessionMode

`SessionMode` описывает пользовательский режим, а `LearningPhase` — педагогическую цель:

| SessionMode           | Default LearningPhase |
| --------------------- | --------------------- |
| `ASSESSMENT`          | `CALIBRATION`         |
| `TRAINING`            | `ACQUISITION`         |
| `REVIEW`, `RETURN`    | `CONSOLIDATION`       |
| `INTERVIEW`, `BATTLE` | `TRANSFER`            |

Mapping используется только для безопасного backfill; новые sessions получают phase из explicit recommendation/sequence.

## Versioned blueprint

`LearningSequenceBlueprint` хранится в content pack и содержит stable key, integer version, topic, phase, estimated minutes, ordered content/task steps и completion rule. Import проверяет ссылки и checksum. При создании session API сохраняет immutable snapshot, поэтому будущая версия blueprint не меняет активное прохождение.

Blueprint, импортированный для технического review, не становится пользовательским маршрутом автоматически. Recommendation и direct `sequenceKey` считают version доступной только когда:

- exact `ContentPack.key/version` имеет статус `ACTIVE`;
- каждый exact TASK/CONTENT ref имеет статус `ACTIVE`;
- ref принадлежит той же паре `sourcePack/sourceVersion`, что и blueprint.

Так DRAFT pack можно импортировать и проверять в disposable schema, не создавая рекомендацию, которая упадёт лишь при построении session. Частичная активация pack также не открывает consolidation/transfer, пока их собственные refs остаются DRAFT.

## Sequence patterns

Acquisition:

```text
canonical explanation → worked example → predict before reveal
→ contrast → guided completion/debug → short independent task → reflection
```

Consolidation:

```text
retrieval without hint → trace → short production → feedback → delayed review
```

Transfer:

```text
work-like problem → user plan → independent implementation/review
→ edge cases/trade-offs → transfer evidence
```

## Composition rules

Builder учитывает primary capability gap, prerequisites, available sequence, recent items, review due и load feedback. Он не подменяет отсутствующий content произвольными hardcoded tasks. Completion rule требует несколько steps и минимум одно no-help success там, где это предусмотрено. Для completion `success` означает только final evaluation с `passed=true`: partial local result с `passed=null` остаётся evidence, но не подменяет завершённый success.

Attempts, pause/resume и current position сохраняются в PostgreSQL. Просмотр worked example/solution фиксируется через HelpLevel и не выдаёт сильное самостоятельное evidence.
