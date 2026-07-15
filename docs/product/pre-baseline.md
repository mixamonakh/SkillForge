# JavaScript Pre-Baseline v1

Статус: целевой контракт Phase 4. Pack `js-prebaseline-v1` становится входным маршрутизатором после реализации и импорта; `js-baseline-v1` продолжает работать как расширенная диагностика.

## Назначение

Pre-baseline за 20–35 минут локализует наиболее полезный следующий шаг. Он не присваивает mastery и не использует проходной балл.

Результат — `RoutingProfile` с достаточностью данных, наблюдаемыми capability families, primary gap, рекомендуемой phase и человекочитаемыми причинами.

## Состав

Pack содержит 16–20 заданий:

- не менее четырёх TRACE;
- не менее трёх DEBUG/completion;
- не менее двух CODE_PRODUCTION;
- не менее двух WORK_LIKE/TRANSFER;
- не менее двух TERM;
- остальные items проверяют базовые values, arrays/objects, functions и control flow.

Каждый item использует schema v2 metadata, stable English key, authoritative sources и отдельные rubric dimensions. CODE items имеют deterministic visible/hidden tests.

## Язык и fairness

Сначала проверяется механизм простыми русскими словами, затем терминология отдельным dimension/item. Unknown term не должен автоматически обнулять понимание механизма. Edge-case trivia не используется как основа маршрута. Ответ `Не знаю` валиден и даёт полезный routing signal без guilt copy.

## Adaptive flow

`next` выбирает item по missing family, severity, prerequisites, diversity и ожидаемой информационной ценности. Диагностика останавливается, когда дальнейший вопрос не изменит маршрут, получены согласованные независимые сигналы или повторные ошибки уже локализовали misconception.

Stop response содержит:

- решение `STOP_AND_ROUTE` или `ASSESSMENT_COMPLETE`;
- primary gap и recommended phase;
- data sufficiency;
- причины и score breakdown;
- следующий полезный шаг.

## UX и сохранность

Assessment поддерживает autosave, pause/resume, refresh и container restart через PostgreSQL snapshot. UI показывает кластер, прогресс без давления, `Не знаю`, partial evaluation и объяснимый stop. Старый baseline можно начать и продолжить независимо от pre-baseline.

## External evaluation и import

Pre-baseline Evaluation — допустимый audit/routing artifact, но не learning evidence. Это правило
действует одинаково для локального deterministic submit и для внешнего
`skillforge-analysis-v1` import.

Preview явно показывает для каждого такого attempt:

- `evaluationAction: CREATE_AUDIT_RECORD`;
- `evidenceAction: SUPPRESSED`;
- `topicStateAction: NO_MUTATION`;
- `masteryAction: NO_MUTATION`;
- reason `PREBASELINE_ROUTING_ONLY`.

Apply повторно определяет assessment policy из immutable snapshot v2 внутри PostgreSQL
transaction. Evaluation и её feedback сохраняются для audit, но Evidence, topic-level
misconception links, `TopicState`, `ReviewSchedule` и mastery snapshot не создаются. Mixed import
может изменить только темы, связанные с обычными attempts.
