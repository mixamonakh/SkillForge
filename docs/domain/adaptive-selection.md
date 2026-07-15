# Rule-based adaptive selection v2

## Решение

Adaptive routing остаётся детерминированным и объяснимым. IRT/BKT не применяется без откалиброванного item bank и достаточного dataset.

## Candidate score

```text
total = gapSeverity
      + missingFamilyBonus
      + prerequisiteUnlockBonus
      + targetRelevance
      + reviewDueBonus
      + diversityBonus
      - redundancyPenalty
      - overloadPenalty
      - recentExposurePenalty
```

API возвращает breakdown каждого компонента. Одинаковый нормализованный input и algorithm version дают одинаковое решение; tie-break использует stable key.

## Stop rules

Тему или assessment branch можно остановить, если:

- есть два согласованных независимых сигнала по нужной family;
- coverage достаточно для маршрута;
- две последовательные ошибки локализовали один базовый misconception;
- следующий item не изменит recommended route;
- несколько соседних уровней получили `Не знаю`;
- достигнут безопасный item/time cap.

Stop не означает mastery или провал. Он означает, что дополнительная диагностика сейчас имеет низкую ценность. Response содержит decision, reasons, data sufficiency, primary gap и recommended phase.

## Защита от bombardment

Recent exposure и redundancy снижают score похожих items; overload feedback уменьшает production/cognitive load. Prerequisite gate блокирует transfer item, если базовый механизм ещё не подтверждён. Пользователь сохраняет возможность выбрать другую тему.

## Версионирование

Recommendation contract использует `recommendation-v2.0`. Изменение весов или stop semantics требует version bump, regression tests и ADR, если меняется product meaning.
