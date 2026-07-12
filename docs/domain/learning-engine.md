# Learning engine v1

## Контракт

Learning engine — pure deterministic TypeScript в `packages/learning-engine`. Он не знает о Nest, Prisma, React, filesystem или network. Версия алгоритма хранится с `TopicState`/`MetricSnapshot` (контрактное имя `mastery-v1.0`).

Изменение формулы требует ADR, version bump, recompute command/plan и тестов старого/нового поведения.

## Нормализация evidence

Вход одного evidence:

- `rawScore` 0..100;
- reliability evaluator 0..1;
- weight evidence kind 0..2;
- help level;
- age/half-life в днях.

Autonomy factors:

| Help              | Factor |
| ----------------- | -----: |
| `NONE`            |   1.00 |
| `NUDGE`           |   0.90 |
| `HINT`            |   0.80 |
| `MULTIPLE_HINTS`  |   0.65 |
| `SOLUTION_VIEWED` |   0.40 |

```text
normalizedScore = clamp(rawScore × autonomyFactor, 0, 100)
recencyFactor = 0.5 ^ (ageDays / halfLifeDays)
weight = evaluatorReliability × evidenceTypeWeight × recencyFactor
```

Default evaluator reliability:

| Evaluator                   | Reliability |
| --------------------------- | ----------: |
| hidden deterministic tests  |        1.00 |
| normalized exact output     |        0.95 |
| verified manual review      |        0.90 |
| external structured ChatGPT |        0.65 |
| API AI single pass          |        0.55 |
| self-report                 |        0.10 |

Default evidence weights:

| Kind                   | Weight | Kind                 | Weight |
| ---------------------- | -----: | -------------------- | -----: |
| `CODE_CORRECTNESS`     |   1.30 | `DEBUGGING`          |   1.10 |
| `PREDICT_OUTPUT`       |   1.00 | `EXPLANATION`        |   0.90 |
| `RECALL`               |   0.75 | `EDGE_CASES`         |   1.00 |
| `COMPLEXITY_REASONING` |   1.00 | `INTERVIEW_RESPONSE` |   1.10 |
| `TRANSFER`             |   1.25 | `BATTLE`             |   1.30 |
| `AI_REVIEW`            |   1.10 | `SELF_REPORT`        |   0.10 |

## Estimate и confidence

Используется объяснимый weighted prior, без утверждения о строгой Bayesian model:

```text
PRIOR_SCORE = 50
PRIOR_WEIGHT = 1.5
estimate = (PRIOR_WEIGHT × PRIOR_SCORE + Σ(weight × normalizedScore))
           / (PRIOR_WEIGHT + Σweight)
```

Confidence измеряет количество и разнообразие доказательств, а не сам score:

```text
clamp(
  20 × log1p(totalWeight)
  + 8 × min(independentDays, 4)
  + 6 × min(taskKindCount, 4)
  + (hasDelayedEvidence ? 10 : 0),
  0, 100
)
```

## Status gates

`UNKNOWN`: reliable weight < 1.5 либо нет submitted attempt.

`WEAK`: estimate < 40 либо два независимых провала на базовых заданиях.

`UNSTABLE`: estimate 40–69; либо высокий score только одного evidence/task kind; либо все успехи с существенными подсказками.

`SOLID` требует одновременно estimate ≥70, confidence ≥55, два независимых дня, два task kinds, одну успешную no-help попытку и отсутствие двух свежих конфликтующих провалов.

`MASTERED` требует estimate ≥85, confidence ≥75, три независимых дня, три evidence kinds, delayed retrieval не раньше чем через 7 дней, transfer/battle/interview evidence и отсутствие провала последней проверки.

Один score 100 не проходит gates. External AI с reliability 0.65 не может перевесить повторные deterministic failures только высоким текстовым score.

## Recommendation v1

```text
priority = targetWeight × 0.30
         + weaknessScore × 0.25
         + prerequisiteUnlockValue × 0.20
         + reviewDueScore × 0.15
         + repeatedMistakeScore × 0.10
```

Critical prerequisite блокирует рекомендацию. Dashboard получает одну primary recommendation. После overload предлагается smaller load; после паузы — return. Пользователь сохраняет возможность выбрать другую тему.

`repeatedMistakeScore` равен нулю, пока одно и то же misconception не подтверждено минимум двумя evaluation. Затем максимальная частота повторения по теме нормализуется как `min(100, count × 25)`. Одиночные или разные разовые findings не считаются повторяющейся ошибкой. Feedback `тяжело` (`HARD`) и `перегруз` (`OVERLOAD`) переводит следующую рекомендацию в `MINIMAL` load.

## Recompute transaction

После Evaluation/Evidence API в одной транзакции создаёт evidence, выбирает affected topics, вызывает engine, upsert TopicState, обновляет ReviewSchedule/MetricSnapshot и commit. Engine возвращает explanation, достаточную для UI и диагностики.

## Обязательные тесты

Zero evidence → unknown; один 100 → не mastered; solution viewed penalty; delayed varied transfer → mastered; passage of time → needsReview, не weak; AI не перевешивает deterministic failures; значения clamped; input order не меняет результат.
