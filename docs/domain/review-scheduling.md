# Планирование повторений

## Отделение от mastery

Время не является доказательством потери навыка. Истечение интервала ставит `needsReview=true` и label «Готово к повторению», но не меняет `SOLID`/`MASTERED` на `WEAK`.

После новой попытки создаётся evidence, затем engine обычным образом пересчитывает status и следующий interval.

## Базовые интервалы v1

| Состояние  |   Интервал |
| ---------- | ---------: |
| `WEAK`     |    1–3 дня |
| `UNSTABLE` |   4–7 дней |
| `SOLID`    | 14–30 дней |
| `MASTERED` | 45–90 дней |

Выбор внутри диапазона детерминированно учитывает estimate/confidence и history. Корректировки:

- успех без подсказки: ×1.5;
- частичный успех: ×1.0;
- провал: ×0.5;
- overload не сокращает интервал агрессивно, а влияет на рекомендуемый load mode;
- отсутствие активности не создаёт punishment/status loss.

Значения clamped в допустимые границы, timestamp рассчитывается в UTC, algorithm version сохраняется в `ReviewSchedule`.

## Delayed retrieval

Evidence считается delayed для mastery gate, если оно получено не раньше чем через 7 суток после независимого предыдущего evidence по теме. Несколько задач в одной session не превращаются в независимые дни.

## Return after pause

Если с последней session прошло не менее `resumeThresholdDays` (default 7):

- Dashboard показывает ResumeBanner и последнюю точку;
- primary recommendation — `RETURN`, 15–20 минут;
- состав: одно лёгкое retrieval и одно короткое применение;
- результат создаёт обычное evidence;
- UI не показывает число «пропущенных» дней и не скрывает остальные действия.

## Due selection

Recommendation engine учитывает due score вместе с target weight, weakness, prerequisite unlock и misconceptions. Он не выдаёт стену повторений: Dashboard показывает до трёх review candidates и одну primary recommendation.

## Edge cases

- отсутствует evidence → `UNKNOWN`, а не scheduled weak review;
- clock passage без attempt → только due;
- future-dated/invalid occurredAt отклоняется boundary validation;
- повторная Evaluation не должна создавать duplicate schedule/evidence;
- change timezone не меняет сохранённый UTC dueAt;
- отменённая session без submitted attempt не влияет на mastery/review.
