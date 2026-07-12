# ADR 0005: Mastery вычисляется из evidence

- Статус: принято
- Дата: 2026-07-11

## Контекст

Прототипные проценты, self-rating или ручной topic status создают ложную точность. Навык должен подтверждаться несколькими независимыми evidence, подсказки и evaluator reliability — влиять на вес, а время — инициировать review без наказания.

## Решение

Хранить immutable Evaluation и нормализованный Evidence с provenance. Pure versioned learning engine рассчитывает estimate, confidence, gates и explanation. `TopicState` — воспроизводимый cache, а не direct input.

Status contract:

- insufficient reliable evidence → `UNKNOWN`;
- один score 100 не может дать `MASTERED`;
- `SOLID` требует score/confidence, два дня/task kinds и no-help success;
- `MASTERED` дополнительно требует три дня/evidence kinds, delayed retrieval и transfer/battle/interview;
- `needsReview` хранится отдельно;
- AI import создаёт evidence и не пишет status.

Формула/weights имеют version. Любая правка требует ADR/version/recompute/tests.

## Последствия

Положительные:

- метрики объяснимы и воспроизводимы;
- данные из разных evaluator сравниваются с reliability;
- self-report сохраняется, не подменяя навык;
- history позволяет перекалибровать алгоритм.

Стоимость:

- сложнее schema/use cases/UI explanation;
- prior/thresholds всё равно эвристичны и требуют будущей калибровки;
- recompute требует индексов и transaction discipline.

Меры: explicit `mastery-v1.0`, branch coverage ≥90%, MetricSnapshot, provenance timeline и honest insufficient states.

## Рассмотренные варианты

- **Ручной status switch:** отклонено; допустима только личная отметка «хочу повторить».
- **Среднее процентов:** отклонено; игнорирует coverage/help/reliability/diversity.
- **BKT/IRT:** отложено до достаточного calibration dataset.
- **Completion-based mastery:** отклонено; завершение session не является proof.
