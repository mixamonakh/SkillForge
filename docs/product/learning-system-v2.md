# Learning System v2

Статус: утверждённый целевой контракт рефакторинга. Фактическую готовность фаз и проверок фиксирует корневой `SFV2_EXECUTION_LOG.md`; наличие этого документа само по себе не означает, что весь runtime уже реализован.

## Задача

SkillForge v1 надёжно сохраняет попытки и evidence, но агрегированный `TopicState` недостаточно объясняет, какой компонент навыка требует работы. Learning System v2 добавляет многомерный Capability Profile и замыкает цикл:

```text
короткая калибровка
→ локализация типа пробела
→ подходящая учебная последовательность
→ самостоятельная практика
→ отложенное повторение
→ перенос в рабочую задачу
→ новое evidence
```

Система различает незнание термина, непонимание механизма, ошибки чтения кода, debugging, самостоятельное написание и transfer. Она не сводит эти сигналы к одному «уровню разработчика».

## Неизменяемые границы

- `TopicState` и mastery v1 сохраняются; capability — отдельная explainable projection.
- `apps/web` отображает серверные read models, но не рассчитывает mastery, capability или readiness.
- `apps/api` владеет use cases, транзакциями, preview/apply и budget reservation.
- `packages/learning-engine` содержит pure deterministic algorithms.
- `content/packs` остаётся canonical source; использованные `TaskVersion` неизменяемы.
- AI создаёт candidate/evaluation/evidence только после runtime/domain validation и explicit apply.
- Manual export/import работает без API key.
- Один успешный ответ не создаёт `MASTERED`.
- Streak, daily goal, guilt copy, embedded AI chat, IRT/BKT и vector DB не входят в v2.

## Новые понятия

- [Capability Profile](../domain/capability-profile.md): `TERM`, `MECHANISM`, `TRACE`, `DEBUG`, `CODE_PRODUCTION`, `TRANSFER`, `CALIBRATION`.
- `LearningPhase`: `CALIBRATION`, `ACQUISITION`, `CONSOLIDATION`, `TRANSFER`; пользовательский `SessionMode` остаётся отдельным.
- [Adaptive selection](../domain/adaptive-selection.md): rule-based выбор по информационной ценности и explainable stop rules.
- [Session Builder](../domain/session-builder.md): versioned sequence blueprint и phase-specific composition.
- [Content schema v2](../content/content-schema-v2.md): pedagogy metadata вместо вывода по одной сложности `EASY/MEDIUM/HARD`.
- [Evaluation coverage](../ai/evaluator.md): evaluated, pending и unsupported dimensions без ложного окончательного нуля.

## Путь пользователя

1. Новый пользователь начинает с [короткого JavaScript pre-baseline](pre-baseline.md).
2. API возвращает `RoutingProfile`, а не pass/fail или mastery verdict.
3. Recommendation v2 объясняет тему, primary capability gap, phase, нагрузку и необходимое evidence.
4. Session Builder создаёт immutable snapshot подходящей последовательности.
5. Deterministic evaluator оценивает только поддерживаемые dimensions; свободный текст остаётся pending.
6. Опциональный bounded AI evaluator создаёт preview. Пользователь применяет или отклоняет его.
7. Обычные `Evaluation`/`Evidence` пересчитывают `TopicState`, Capability Profile и review schedule.

## Совместимость и миграции

- `js-baseline-v1` сохраняет machine key и версии; в UI он называется расширенной диагностикой JavaScript Core.
- Content schema v1 продолжает импортироваться и нормализуется консервативно без выдуманных capability labels.
- Старые AssessmentRun/Session snapshots читаются после обновления.
- `LearningSession.learningPhase` добавляется additive migration с backfill по существующему `SessionMode`.
- AI tables добавляются отдельно и не меняют existing answers/evidence.
- Исторические evaluation не переписываются необратимо; новые алгоритмы получают отдельные версии.

## Фазы поставки

1. Schema v2 и partial evaluation.
2. Capability Profile.
3. Recommendation v2, adaptive routing и Session Builder.
4. `js-prebaseline-v1`.
5. Acquisition sequence по values/references/mutability/shallow copy/state update.
6. Bounded AI grading, budget, cache, preview/apply/reject и gold calibration.
7. Content AI review и one nudge.
8. Stabilization, Docker, persistence и ручное пользовательское прохождение.

Педагогический успех нельзя объявлять до реального user trial, даже если технические проверки зелёные.
