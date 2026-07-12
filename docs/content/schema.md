# Схема content pack

Runtime source of truth схем находится в `packages/content-schema`. Этот документ объясняет контракт; расхождение исправляется вместе с schema version и миграцией.

## Manifest

```yaml
key: js-baseline
version: 1.0.0
locale: ru
createdAt: 2026-07-11
status: active
requiresAppSchema: '>=1.0.0 <2.0.0'
tracks: [cs-foundation, javascript-core]
counts:
  topics: 18
  tasks: 72
  assessments: 1
sources:
  - title: MDN JavaScript Guide
    url: https://developer.mozilla.org/docs/Web/JavaScript/Guide
```

`counts` сверяется с фактическими files. `requiresAppSchema` проверяется до import. Content status: `draft`, `active`, `archived`.

## Topic

Обязательные поля: `key`, `trackKey`, `title`, `shortDescription`, `whyImportant`, `atWork`, `atInterview`, `position`, `sourceVersion`, `status`. `prerequisiteKeys` использует существующие stable keys. Optional metadata может содержать target relevance, но не mastery пользователя.

## Task

```yaml
stableKey: js.runtime.event-loop.predict-001
version: 1
topicKey: js.runtime.event-loop
kind: PREDICT_OUTPUT
difficulty: MEDIUM
promptMarkdown: |
  Что будет выведено и почему?
expectedAnswer:
  output: [A, D, C, B]
rubric:
  dimensions:
    PREDICT_OUTPUT: 70
    EXPLANATION: 30
hints: []
acceptanceCriteria:
  - Указан правильный порядок
metadata:
  yandexRelevance: 5
  estimatedMinutes: 4
```

Task kinds: `SINGLE_CHOICE`, `MULTIPLE_CHOICE`, `EXPLAIN`, `PREDICT_OUTPUT`, `FIND_BUG`, `CODE`, `COMPARE_SOLUTIONS`, `AI_REVIEW`, `FLASHCARD`. Difficulty: `EASY`, `MEDIUM`, `HARD`.

Code task дополнительно содержит `starterCode`, `language`, test cases с `name`, `input`/`expected` или controlled `testCode`, `hidden`, `position`. Code task без tests отклоняется.

## Assessment blueprint

Blueprint содержит stable `key`, integer `version`, title/description, `totalBlocks`, `estimatedMin`, selection rules/status и упорядоченные items:

```yaml
- taskKey: js.runtime.event-loop.predict-001
  taskVersion: 1
  blockIndex: 2
  position: 3
  required: true
  dimensionWeights:
    PREDICT_OUTPUT: 0.7
    EXPLANATION: 0.3
```

Run создаёт snapshot, поэтому subsequent content release не меняет активное прохождение.

## Validation rules

Validator проверяет:

- YAML/JSON schema и enum;
- duplicate stable key + version;
- missing track/topic/task references;
- prerequisite cycles/self-edge;
- duplicate/gap/invalid assessment positions;
- manifest counts и app schema range;
- rubric/acceptance criteria/source/version/checksum;
- code tasks without tests;
- unsafe HTML/URL и overly long prompt;
- broken local reference;
- immutable used TaskVersion при DB diff/import.

Import выполняется upsert по stable key/version/checksum. Если key+version существует с другим checksum и версия уже использована, import завершается ошибкой; новая версия обязательна.
