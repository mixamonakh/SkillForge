# ADR 0004: Manual AI workflow по умолчанию

- Статус: принято
- Дата: 2026-07-11

## Контекст

Свободные объяснения полезно оценивать семантически, но обязательный внешний API создаёт secret/cost/network/vendor dependency. Single-pass AI не является источником истины. Пользователь уже может использовать внешний ChatGPT и должен контролировать export.

## Решение

MVP работает с `AI_MODE=manual`, бюджетом 0 и без API key. Приложение экспортирует versioned JSON и Markdown prompt bundle; пользователь получает strict JSON во внешнем ChatGPT; SkillForge валидирует, показывает preview и транзакционно создаёт Evaluation/Evidence.

AI reliability default 0.65. Import не может напрямую менять mastery/status/settings/content. Встроенный AI chat отсутствует. Optional provider abstraction и API-assisted bounded uses остаются будущим решением; manual mode не деградирует.

## Последствия

Положительные:

- clean clone не требует secret/оплаты/сети;
- пользователь явно контролирует передачу ответов;
- AI result audit-able через source bundle/schema/checksum;
- продукт остаётся learning system, а не chat shell.

Стоимость:

- ручной copy/paste/file шаг;
- evaluator может вернуть malformed JSON;
- модель/контекст внешнего анализа не контролируются приложением полностью.

Меры: строгий wrapper/schema, readable validation, preview, provenance, reliability cap и deterministic evidence priority.

## Рассмотренные варианты

- **Обязательный OpenAI API:** отклонено из-за secret/cost/network prerequisite.
- **Встроенный chat:** отклонено как другой продукт и риск подмены практики диалогом.
- **Keyword grading free text:** отклонено как fake evaluation.
- **Не оценивать free text вообще:** сохраняет честность, но не закрывает полный evidence loop; manual import даёт контролируемый путь.
