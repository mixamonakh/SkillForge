# ADR-0002: Capability profile, rule-based adaptivity and bounded AI assistance

**Status:** Proposed
**Date:** 2026-07-15

# Context

SkillForge MVP хранит попытки и evidence, рассчитывает агрегированный TopicState и поддерживает manual AI workflow через export/import.

Первый реальный JavaScript baseline выявил ограничение: один TopicState и общий score недостаточно различают:

- незнание термина;
- непонимание механизма;
- чтение кода;
- debugging;
- самостоятельное написание;
- перенос.

Exact-match также способен корректно проверить только часть composite answer, но пользователь может воспринимать локальный ноль как итоговую оценку.

Исследования рекомендуют короткую диагностику, worked examples, prediction, постепенное уменьшение помощи, delayed retrieval и transfer. При этом у проекта пока нет данных для IRT/BKT.

# Decision

## 1. Preserve current architecture

Сохраняются:

- modular monolith;
- PostgreSQL;
- content packs as source of truth;
- Attempt → Evaluation → Evidence → TopicState;
- manual AI mode;
- strict external contracts.

## 2. Add capability profile projection

Добавляются families:

- TERM;
- MECHANISM;
- TRACE;
- DEBUG;
- CODE_PRODUCTION;
- TRANSFER;
- CALIBRATION.

Profile рассчитывается из существующего evidence и task metadata чистой функцией. В первой версии отдельная materialized table не создаётся.

## 3. Add learning phases

- CALIBRATION;
- ACQUISITION;
- CONSOLIDATION;
- TRANSFER.

SessionMode сохраняется как пользовательский режим.

## 4. Add content schema v2 metadata

Сложность раскладывается на независимые измерения вместо одного `EASY/MEDIUM/HARD`.

## 5. Use rule-based adaptive routing

Selection опирается на missing evidence family, prerequisites, target relevance, review due и overload. IRT/BKT откладываются.

## 6. Add short pre-baseline

Текущий `js-baseline-v1` сохраняется как расширенная диагностика. Новый pre-baseline строит routing profile.

## 7. Add bounded AI features

Разрешены:

- rubric grading;
- content review;
- one nudge;
- позже misconception synthesis.

AI result проходит structured schema, local validation, preview и explicit apply.

## 8. Add hard AI budget

Manual mode остаётся полноценным. API usage ограничен месячным budget ledger.

## 9. Do not add vector DB now

При будущем росте первым вариантом является `pgvector` в существующем PostgreSQL.

# Consequences

## Positive

- система объясняет конкретный пробел;
- диагностика становится короче;
- partial knowledge не схлопывается в ноль;
- учебная сессия соответствует gap type;
- AI даёт реальную пользу без chat-first redesign;
- существующие данные и content packs сохраняются;
- модель остаётся explainable.

## Negative

- content authoring становится сложнее;
- нужны новые metadata и quality gates;
- появляется prompt/version/budget infrastructure;
- capability profile требует дополнительных тестов;
- AI evaluator надо калибровать;
- UI должен показывать многомерный профиль без перегруза.

# Rejected alternatives

## Rewrite from scratch

Отклонено: текущие boundaries и evidence pipeline подходят.

## One overall score

Отклонено: скрывает тип пробела и создаёт ложную точность.

## IRT/BKT now

Отклонено: нет calibrated item bank и достаточного dataset.

## Embedded AI tutor chat

Отклонено: повышает зависимость от готового ответа и нарушает mission.

## Separate vector database

Отклонено: текущий объём и structured keys не требуют semantic infrastructure.

## Google Sheets as canonical content storage

Отклонено: хуже versioning, nested schema, diff, validation и reproducibility.

# Revisit conditions

Решение пересматривается, если:

- capability calculation становится performance bottleneck;
- накоплено достаточно data для calibration;
- item bank превышает сотни/тысячи items;
- semantic duplicate detection становится реальной проблемой;
- AI evaluator проходит несколько версий gold calibration;
- появляется multi-user/cloud mode.
