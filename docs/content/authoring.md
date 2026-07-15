# Авторинг контента

## Source of truth

Курируемый контент хранится в `content/packs/<pack-key>` и проходит code review как обычный код. База данных — импортированное представление, а не единственная копия. Dynamic generation при запуске приложения запрещена.

## Stable identity

- Track/topic/task keys — английские machine keys (`js.runtime.event-loop`).
- Русский title можно менять без изменения key.
- `TaskVersion` immutable после первого Attempt.
- Изменение prompt, rubric, tests или acceptance criteria выпускает новую integer version и checksum.
- Pack и assessment используют semantic/integer version по схеме.

## Workflow

1. Изучить [schema](schema.md), существующие темы и prerequisites.
2. Добавить/изменить JSON в pack; не редактировать imported DB вручную.
3. Для новой задачи дать конкретный prompt, topic, kind, difficulty, rubric, acceptance criteria, provenance/source.
   Новые v2-задачи дополнительно получают явную pedagogy metadata по
   [content schema v2](content-schema-v2.md); capability families нельзя выводить из русского
   title или difficulty.
4. Для code task добавить deterministic tests; обозначить visible/hidden.
5. Для учебного маршрута добавить versioned file в `sequences/` и проверить exact
   topic/content/task references, phase и completion rule.
6. Запустить validation и diff.
7. Проверить содержательный diff человеком.
8. Идемпотентно импортировать pack.
9. Если прежняя версия использовалась, оставить её доступной для истории.

```bash
pnpm content:validate
pnpm content:diff -- --pack js-baseline-v1
pnpm content:import -- --pack js-baseline-v1
```

## Качество задания

Каждая задача проверяет конкретную способность, а не узнавание формулировки. Prompt должен быть самодостаточным, rubric — разделять dimensions, acceptance criteria — проверяемы. Сложность не делает задачу автоматически хорошей.

Baseline:

- не содержит hints;
- не раскрывает solution до завершения;
- `Не знаю` считается валидным ответом;
- свободный текст остаётся pending external review;
- predict output может локально оценить output, но explanation — отдельно;
- exact-match выставляет score только для явно поддерживаемой rubric dimension; частичный
  результат не является итоговым pass/fail;
- code tests детерминированы, не используют сеть/дату/random без фиксации;
- AI-review содержит реальную проблему, а не вкусовое несогласие.

Training content может использовать worked example и hints; каждый hint учитывается как HelpLevel.
Training-only pack может не иметь `assessments/`, если manifest честно задаёт нулевые assessment
counts и thresholds. Не добавляйте фиктивную диагностику только для удовлетворения структуры.

Sequence blueprint задаёт порядок CONTENT/TASK steps, а не копирует payload заданий. Active session
получает immutable snapshot выбранной version, поэтому использованный blueprint нельзя менять задним
числом: создайте новую integer version. Минимальный completion rule не может превышать число steps;
`minimumNoHelpSuccesses` требует реальных TASK steps, на которых возможен самостоятельный успех.

## Источники и безопасность

- Указывайте canonical/authoritative source links и source pack version.
- Не копируйте большие защищённые тексты; пишите собственные объяснения.
- Markdown/HTML не содержит scripts, event handlers, iframe и unsafe URL.
- Code harness не выполняет network, filesystem или dynamic imports.
- Local references должны существовать.

## Review checklist

- stable keys уникальны и не зависят от title;
- topic существует, graph остаётся acyclic;
- assessment positions уникальны и 4×9 для baseline;
- rubric dimensions соответствуют evidence kinds;
- `metadata.schemaVersion: "2.0"` содержит явные `evidenceFamilies`, cognitive/production/
  transfer/support levels, stable `familyKey`, learning outcomes и misconception tags;
- v1 metadata не дополняется выдуманными capability labels при нормализации;
- expected answer/tests согласованы с prompt;
- edge cases и mutation contract явны;
- test names не раскрывают hidden answer;
- estimated time реалистичен и не создаёт pressure timer;
- checksum/source/version присутствуют;
- старая использованная версия не изменена.
- shared Track/Topic другого `sourcePack` совпадает дословно по семантике и prerequisites либо import
  намеренно отклоняется;
- sequence references существуют, относятся к тому же topic и не подменяются hardcoded runtime
  заданиями.
