# Capability Profile v1

## Роль

Capability Profile отвечает на вопрос «какой компонент навыка подтверждён или ещё не проверен». Он не заменяет `TopicState` и не является новой таблицей истины.

Algorithm version: `capability-profile-v1.0`.

## Families

| Family            | Смысл                                                |
| ----------------- | ---------------------------------------------------- |
| `TERM`            | узнавание и корректное использование терминов        |
| `MECHANISM`       | причинная модель поведения                           |
| `TRACE`           | чтение и пошаговое предсказание выполнения           |
| `DEBUG`           | локализация причины и исправление                    |
| `CODE_PRODUCTION` | самостоятельное написание логики                     |
| `TRANSFER`        | применение в новом рабочем/интервью-контексте        |
| `CALIBRATION`     | соответствие self-confidence фактическому результату |

## Coverage

Каждая family имеет одно из состояний:

- `NOT_TESTED`: нет достоверного mapping и релевантных signals;
- `INSUFFICIENT`: signal или pending review есть, но данных мало;
- `SUFFICIENT`: данных достаточно для ограниченного вывода.

`estimate` nullable. Нулевое значение не используется вместо «не проверено». `confidence` показывает достаточность/разнообразие evidence, а не уверенность пользователя.

## Вход и расчёт

Pure function получает нормализованные данные из `Evidence`, `Evaluation`, `Attempt`, TaskVersion pedagogy metadata, `HelpLevel`, provenance и времени. Для каждой family она считает:

- estimate и confidence консервативно;
- evidence count и независимые дни;
- no-help successes;
- pending review count;
- last evidence time;
- объяснения, пригодные для API/UI.

Pending dimension не превращается в отрицательное evidence. Подсказки снижают силу сигнала. `CODE_PRODUCTION` не выводится из чтения готового кода, а `TRANSFER` — из canonical example.

## Backward compatibility

V1 task без доказуемого metadata mapping не получает выдуманные families. Допускается только узкий conservative mapping по evaluator/evidence kind; неоднозначность остаётся `NOT_TESTED` или `INSUFFICIENT`.

Текущий conservative mapping ограничен следующими связями:

| V1 evidence kind     | Capability family |
| -------------------- | ----------------- |
| `PREDICT_OUTPUT`     | `TRACE`           |
| `DEBUGGING`          | `DEBUG`           |
| `CODE_CORRECTNESS`   | `CODE_PRODUCTION` |
| `TRANSFER`           | `TRANSFER`        |
| `BATTLE`             | `TRANSFER`        |
| `INTERVIEW_RESPONSE` | `TRANSFER`        |

`RECALL`, `EXPLANATION`, `EDGE_CASES`, `COMPLEXITY_REASONING`, `AI_REVIEW` и `SELF_REPORT` без явного v2 metadata linkage не назначаются capability family. Для mixed v2 task evidence без связи конкретной проверенной dimension с family остаётся pending.

`SUFFICIENT` требует минимум два scored evidence и суммарный надёжный вес не меньше `1.5`. До прохождения обоих gates `estimate` остаётся `null`.

## Persistence и API

В первой версии capability рассчитывается на чтении в `packages/learning-engine`; materialized table не создаётся. API публикует read-only endpoints:

```text
GET /api/v1/topics/:topicKey/capability-profile
GET /api/v1/users/me/capability-summary
```

Оба endpoint читают только user-scoped evidence/attempt/evaluation и не записывают `TopicState` или mastery. Web отображает русскую capability matrix с текстовыми status labels, не только цветом.

Материализация рассматривается отдельно только при измеренной проблеме производительности или необходимости исторических snapshots.
