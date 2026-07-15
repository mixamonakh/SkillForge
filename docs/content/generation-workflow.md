# Workflow генерации контента

AI/Codex может ускорять подготовку batch, но не заменяет схему, review и тестирование. Контент не генерируется динамически в пользовательской session.

## Процесс

1. Сформировать bounded brief: темы, task kinds, difficulty, learning objective, количество и версия schema.
2. Передать generator точный contract из `packages/content-schema` и существующие stable keys.
3. Получить только структурированный batch без выдуманных app fields.
4. Проверить педагогическую и техническую корректность человеком.
5. Добавить JSON через обычный repository change.
6. Выполнить `pnpm content:validate`.
7. Запустить deterministic tests/harness для code/output tasks.
8. Просмотреть `pnpm content:diff -- --pack <pack>`.
9. Импортировать в development DB.
10. Пройти sample assessment/session в UI и проверить export provenance.

## Bounded AI review

Технический fake-provider прогоняет полный structured flow без сети, оплаты и права одобрить контент:

```bash
pnpm content:ai-review -- --pack js-core-training-v1
```

Команда читает canonical pack через `@skillforge/content-schema`, обрабатывает не более 50 artifacts пачками максимум по 10 и пишет JSON/Markdown в `reports/content-ai-review/`. Source JSON не изменяется. Fake report всегда оставляет `NEEDS_HUMAN_REVIEW`; он подтверждает contract, batching и report pipeline, а не correctness.

Live review является отдельным платным operator action:

```bash
pnpm content:ai-review -- --pack js-core-training-v1 --provider openai --live
```

Для него нужен server-side `OPENAI_API_KEY`. Даже `PASS` от provider не заменяет human solve, rendered UI dry run, timing check и explicit release decision из [quality gates](quality-gates.md).

## Prompt contract для generator

Generator должен:

- использовать только перечисленные поля/enums;
- сохранять machine keys на английском, UI copy — на русском;
- не менять существующую version;
- не оценивать свободный текст keyword matching;
- давать deterministic expected result там, где он объективен;
- указывать acceptance criteria, evidence dimensions и sources;
- не добавлять внешние package imports/network в code tasks;
- возвращать ошибки/неуверенность, а не заполнять пробел выдумкой.

## Review dimensions

### Correctness

Prompt, starter code, expected answer и tests не противоречат друг другу. ECMAScript поведение сверяется с актуальным authoritative source. Tests проверяют contract, edge cases и non-mutation, но не зависят от реализации.

### Diagnostic value

Задание различает понимание и случайное угадывание. На ключевую тему приходится минимум два независимых задания. Blueprint не показывает topic label, если это создаёт подсказку.

### Diversity

Набор сочетает retrieval, predict, debugging, code, explanation, compare и AI review; не размножает один шаблон заменой переменных.

### Safety/licensing

Нет executable HTML, network calls, secrets, copyrighted long excerpts и arbitrary imports. Sources записаны в manifest/theory metadata.

## Versioning и откат

Ошибку в опубликованной/использованной задаче исправляют новой TaskVersion. Старую не переписывают, чтобы Attempt и Evaluation оставались воспроизводимы. Ошибочный pack может быть archived; rollback не удаляет версии, на которые существуют attempts.
