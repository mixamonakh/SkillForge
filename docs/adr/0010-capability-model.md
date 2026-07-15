# ADR 0010: Capability Profile и rule-based adaptivity

- Статус: принято
- Дата: 2026-07-15

## Контекст

`TopicState` v1 корректно агрегирует подтверждение темы, но один status/estimate не различает терминологию, причинную модель, trace, debugging, самостоятельное написание и transfer. Exact-match composite task также может проверить только часть ответа. Проект пока не имеет откалиброванного item bank и данных для IRT/BKT.

## Решение

1. Сохранить `TopicState` и mastery formula v1.
2. Добавить Capability Profile families `TERM`, `MECHANISM`, `TRACE`, `DEBUG`, `CODE_PRODUCTION`, `TRANSFER`, `CALIBRATION`.
3. Рассчитывать profile pure function из existing evidence/evaluation/attempt, v2 task metadata, help и provenance; отдельную materialized table не создавать.
4. Различать `NOT_TESTED`, `INSUFFICIENT` и `SUFFICIENT`; estimate остаётся nullable.
5. Добавить `LearningPhase` отдельно от `SessionMode`.
6. Использовать deterministic rule-based selection и explainable stop rules; Recommendation contract version — `recommendation-v2.0`.
7. Хранить versioned LearningSequenceBlueprint в content packs и immutable snapshot в session.
8. Сохранить `js-baseline-v1`; добавить отдельный pre-baseline, который возвращает routing profile, а не mastery verdict.

## Последствия

- Рекомендация может объяснить конкретный gap и подобрать phase.
- V1 tasks без достоверного mapping остаются unknown/insufficient; система не придумывает capability.
- Authoring требует более точной pedagogy metadata и quality review.
- Materialization, IRT/BKT и embeddings откладываются до измеренной потребности и отдельного ADR.
- Изменение weights/semantics требует version bump и regression tests.

## Отклонённые варианты

- заменить TopicState одним новым overall score;
- хранить capability как новую первичную таблицу уже в первой версии;
- внедрить IRT/BKT без calibration dataset;
- генерировать runtime tasks без versioned content review.
