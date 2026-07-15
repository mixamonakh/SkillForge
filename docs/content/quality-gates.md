# Content quality gates

Schema validation подтверждает форму, но не фактическую и педагогическую ценность. Production content проходит bounded pipeline:

```text
DRAFT → SCHEMA_VALID → TECHNICALLY_REVIEWED
→ PEDAGOGICALLY_REVIEWED → APPROVED → ACTIVE → ARCHIVED
```

Пока DB не моделирует authoring workflow, review state хранится в versioned report/manifest; импортируются только approved/active artifacts.

## Gates

1. Design: audience, purpose, outcomes, prerequisites, families, task taxonomy, sources и human reviewer определены до генерации.
2. Schema/graph: strict JSON, stable IDs, versions, counts, references, acyclic prerequisites, sequence links и checksum. Ошибка блокирует import.
3. Technical correctness: prompt/answer/tests согласованы, CODE tests реально выполняются, timeout и platform assumptions заданы.
4. Rubric: dimensions разделены, partial credit возможен, terminology не смешана с mechanism, help и transfer трактуются честно.
5. Pedagogy: phase/load/prerequisites подходят, нет trivia и скрытой лишней работы, есть contrast/misconception signal.
6. Language/UX: понятный русский текст, самодостаточное условие, `Не знаю` в calibration, реалистичное время без pressure.
7. Sources: спецификация/официальная документация/MDN имеют приоритет; URL и утверждение проверяются.
8. Fairness: capability соответствует item, один signal не создаёт сильный route/mastery вывод.
9. AI review: ищет ambiguity, mismatch, duplicates, leakage и metadata problems, но не меняет JSON и не заменяет human/tests.
10. Dry run: human solve, rendering, autosave, evaluator, time estimate и export/import проверены.
11. Release: validation/diff/review report/snapshot tests/docs/idempotent import зелёные; `BLOCK_IMPORT` отсутствует.

## Review report

Report фиксирует pack/version/date/reviewers, counts `PASS`/`NEEDS_HUMAN_REVIEW`/`BLOCK_IMPORT`, findings и их resolution для каждого stable key/version. Количество созданных tasks не является показателем качества.

Оригинальный полный acceptance checklist сохранён в корневом `SFV2_CONTENT_QUALITY_GATES.md` до окончания миграции документов.
