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
2. Добавить/изменить YAML в pack; не редактировать imported DB вручную.
3. Для новой задачи дать конкретный prompt, topic, kind, difficulty, rubric, acceptance criteria, provenance/source.
4. Для code task добавить deterministic tests; обозначить visible/hidden.
5. Запустить validation и diff.
6. Проверить содержательный diff человеком.
7. Идемпотентно импортировать pack.
8. Если прежняя версия использовалась, оставить её доступной для истории.

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
- code tests детерминированы, не используют сеть/дату/random без фиксации;
- AI-review содержит реальную проблему, а не вкусовое несогласие.

Training content может использовать worked example и hints; каждый hint учитывается как HelpLevel.

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
- expected answer/tests согласованы с prompt;
- edge cases и mutation contract явны;
- test names не раскрывают hidden answer;
- estimated time реалистичен и не создаёт pressure timer;
- checksum/source/version присутствуют;
- старая использованная версия не изменена.
