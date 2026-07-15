# Схема content pack

Runtime source of truth схем находится в `packages/content-schema`. Этот документ объясняет контракт; расхождение исправляется вместе с schema version и миграцией.

## Manifest

```json
{
  "key": "js-baseline",
  "version": "1.0.0",
  "locale": "ru",
  "createdAt": "2026-07-11",
  "status": "active",
  "requiresAppSchema": ">=1.0.0 <2.0.0",
  "tracks": ["cs-foundation", "javascript-core"],
  "counts": { "topics": 18, "tasks": 72, "assessments": 1 },
  "sources": [
    {
      "title": "MDN JavaScript Guide",
      "url": "https://developer.mozilla.org/docs/Web/JavaScript/Guide"
    }
  ]
}
```

`counts` сверяется с фактическими files. `requiresAppSchema` проверяется до import. Content status: `draft`, `active`, `archived`.

## Topic

Обязательные поля: `key`, `trackKey`, `title`, `shortDescription`, `whyImportant`, `atWork`, `atInterview`, `position`, `sourceVersion`, `status`. `prerequisiteKeys` использует существующие stable keys. Optional metadata может содержать target relevance, но не mastery пользователя.

## Task

```json
{
  "stableKey": "js.runtime.event-loop.predict-001",
  "version": 1,
  "topicKey": "js.runtime.event-loop",
  "kind": "PREDICT_OUTPUT",
  "difficulty": "MEDIUM",
  "promptMarkdown": "Что будет выведено и почему?",
  "expectedAnswer": { "output": ["A", "D", "C", "B"] },
  "rubric": { "dimensions": { "PREDICT_OUTPUT": 70, "EXPLANATION": 30 } },
  "hints": [],
  "acceptanceCriteria": ["Указан правильный порядок"],
  "metadata": { "yandexRelevance": 5, "estimatedMinutes": 4 }
}
```

Task kinds: `SINGLE_CHOICE`, `MULTIPLE_CHOICE`, `EXPLAIN`, `PREDICT_OUTPUT`, `FIND_BUG`, `CODE`, `COMPARE_SOLUTIONS`, `AI_REVIEW`, `FLASHCARD`. Difficulty: `EASY`, `MEDIUM`, `HARD`.

### Pedagogy metadata v2

Существующая metadata v1 остаётся валидной и не переписывается. Для новых packs используется
strict v2 block:

```json
{
  "schemaVersion": "2.0",
  "evidenceFamilies": ["TRACE", "MECHANISM"],
  "cognitiveLevel": "CANONICAL_MECHANISM",
  "productionLoad": "NONE",
  "transferLevel": "NONE",
  "supportLevel": "NONE",
  "familyKey": "js.references.shared-object",
  "learningOutcomeKeys": ["js.references.explain-shared-object"],
  "misconceptionTags": ["assignment-copies-object"],
  "estimatedMinutes": 3,
  "documentationUrls": ["https://developer.mozilla.org/"],
  "mixedEvidence": true
}
```

`evidenceFamilies`: `TERM`, `MECHANISM`, `TRACE`, `DEBUG`, `CODE_PRODUCTION`, `TRANSFER`,
`CALIBRATION`. Runtime schema и generated JSON Schema находятся в
`packages/content-schema`; нормализованный v1 read model оставляет неизвестные v2-поля пустыми или
`null`, не меняя canonical JSON и checksum старого `js-baseline-v1`.

Code task дополнительно содержит `starterCode`, `language`, test cases с `name`, `input`/`expected` или controlled `testCode`, `hidden`, `position`. Code task без tests отклоняется.

## Assessment blueprint

Blueprint содержит stable `key`, integer `version`, title/description, `totalBlocks`, `estimatedMin`, selection rules/status и упорядоченные items:

```json
{
  "taskKey": "js.runtime.event-loop.predict-001",
  "taskVersion": 1,
  "blockIndex": 2,
  "position": 3,
  "required": true,
  "dimensionWeights": { "PREDICT_OUTPUT": 0.7, "EXPLANATION": 0.3 }
}
```

Run создаёт snapshot, поэтому subsequent content release не меняет активное прохождение.

Assessment layer optional. Training pack без диагностики указывает `counts.assessments: 0`,
нулевые assessment thresholds и не обязан создавать декоративный assessment file. Если assessment
files отсутствуют, ненулевые `baselineItems`, `blocks` или `itemsPerBlock` считаются semantic error.

## Learning sequence blueprint

Optional каталог `sequences/` содержит версионированные учебные маршруты:

```json
{
  "schemaVersion": "1.0",
  "key": "js.references.acquisition",
  "version": 1,
  "topicKey": "cs.values-and-references",
  "phase": "ACQUISITION",
  "estimatedMinutes": 24,
  "steps": [
    { "kind": "CONTENT", "contentItemKey": "js.references.canonical", "version": 1 },
    {
      "kind": "TASK",
      "taskKey": "js.references.trace-001",
      "version": 1,
      "purpose": "Проверить понимание общей ссылки"
    }
  ],
  "completionRule": { "requiredSteps": 2, "minimumNoHelpSuccesses": 1 }
}
```

`phase` входит в `CALIBRATION | ACQUISITION | CONSOLIDATION | TRANSFER`, но Session Builder
принимает учебные sequence только трёх последних типов; calibration управляется assessment runtime.
Validator требует существующие topic/content/task versions, соответствие topic, уникальный
key/version, положительные minutes/versions, непустые steps и выполнимый completion rule. Checksum
sequence участвует в canonical checksum нового pack; pack без sequences и legacy
`js-baseline-v1` сохраняют прежний checksum.

## Validation rules

Validator проверяет:

- JSON schema и enum;
- strict v1/v2 task metadata и отсутствие неизвестных полей;
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

При импорте нескольких packs общие Track/Topic можно reuse только при полном совпадении семантики и
dependency set. Pack не получает право менять `sourcePack`, status, metadata или prerequisites
curriculum, которым владеет другой pack; конфликт обнаруживается до transaction и повторно
проверяется внутри неё.

Import выполняется upsert по stable key/version/checksum. Если key+version существует с другим checksum и версия уже использована, import завершается ошибкой; новая версия обязательна.
