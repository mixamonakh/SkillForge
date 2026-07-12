# Доменный глоссарий

| Термин               | Определение                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Track                | Группа компетенций, например JavaScript Core или Computer Science Foundation.                                       |
| Topic                | Стабильный узел компетенции с английским machine key, например `js.functions.closures`.                             |
| Topic dependency     | Направленное prerequisite-ребро; content import отклоняет циклы.                                                    |
| Content item         | Версионированная теория, ссылка, checklist или другой учебный материал.                                             |
| Task                 | Стабильная задача с machine key.                                                                                    |
| TaskVersion          | Неизменяемая версия prompt, rubric, tests и acceptance criteria. После использования выпускается новая версия.      |
| Assessment blueprint | Версионированный состав/правило диагностики.                                                                        |
| Assessment run       | Конкретное прохождение blueprint со snapshot и lifecycle.                                                           |
| Learning session     | Учебная последовательность вне/внутри assessment с режимом, нагрузкой и items.                                      |
| Session item         | Позиция TaskVersion в snapshot конкретной session.                                                                  |
| Attempt              | Сохраняемый ответ пользователя на TaskVersion; содержит текст/код/choice, help, self-rating, confidence и revision. |
| Evaluation           | Append-only оценка Attempt конкретным evaluator и его версией.                                                      |
| Evidence             | Нормализованное доказательство topic/dimension, полученное из Evaluation или подтверждённого external artifact.     |
| Topic state          | Пересчитываемый cache estimate/status/confidence/coverage/review по evidence пользователя.                          |
| Misconception        | Конкретная повторяющаяся ошибка и remediation, не синоним слабой темы.                                              |
| External artifact    | Результат из проекта, PR, LeetCode или другой внешней практики.                                                     |
| Battle evidence      | Evidence `BATTLE`/`TRANSFER`, созданное после подтверждения external artifact.                                      |
| Mastery estimate     | Взвешенное объяснимое числовое приближение навыка при достаточных evidence.                                         |
| Mastery confidence   | Достаточность/разнообразие доказательств, не уверенность пользователя и не точность estimate.                       |
| Self-rating          | Субъективная оценка качества собственного ответа 1–5.                                                               |
| Confidence           | Уверенность пользователя в правильности 0–100.                                                                      |
| Calibration gap      | Разница между confidence пользователя и evaluated score; агрегируется только от 5 оценённых попыток.                |
| Readiness            | Покрытие версионированного target profile, не вероятность найма.                                                    |
| Review due           | Отдельный сигнал «Готово к повторению»; время само по себе не превращает mastery в weakness.                        |
| Provenance           | Машиночитаемая цепочка от evidence до evaluation, attempt/task version/import/artifact.                             |
| Coverage             | Доля требуемых тем, для которых данных достаточно, с явным denominator.                                             |
| Data sufficiency     | Признак, достаточно ли evidence для вывода, плюс coverage и человекочитаемая причина.                               |
| Import batch         | Audit record внешнего анализа со schema version, checksum, status, preview и результатом apply.                     |
| Export bundle        | Immutable snapshot выбранного scope по версионированной схеме с checksum.                                           |
| Manual AI mode       | Workflow export → внешний ChatGPT → strict JSON import; API key не нужен.                                           |

## Evidence kinds

`RECALL`, `EXPLANATION`, `PREDICT_OUTPUT`, `DEBUGGING`, `CODE_CORRECTNESS`, `EDGE_CASES`, `COMPLEXITY_REASONING`, `INTERVIEW_RESPONSE`, `TRANSFER`, `BATTLE`, `AI_REVIEW`, `SELF_REPORT`.

## Help levels

`NONE`, `NUDGE`, `HINT`, `MULTIPLE_HINTS`, `SOLUTION_VIEWED`. Просмотр решения допустим для обучения, но снижает autonomy factor и не даёт сильного mastery evidence.

## Lifecycle statuses

`DRAFT`, `ACTIVE`, `PAUSED`, `COMPLETED`, `CANCELLED`. Допустимые переходы задаются application use case; произвольное изменение status запрещено.
