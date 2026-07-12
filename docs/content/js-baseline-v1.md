# JavaScript Baseline v1

## Цель

Baseline измеряет, что пользователь может объяснить, предсказать, отладить и написать руками; насколько он зависит от подсказок и насколько калибрована уверенность. Это не викторина на узнавание синтаксиса.

## Объём контракта

- 18 тем;
- не менее 72 versioned tasks;
- 36 required assessment items;
- 4 блока по 9;
- не менее 12 deterministic code/output;
- не менее 8 explanation;
- не менее 6 debugging;
- не менее 4 compare/AI-review;
- не менее 6 mixed;
- минимум два независимых задания на ключевую тему.

Фактическое соответствие counts подтверждает `pnpm content:validate`; этот документ не заменяет validator.

## Темы

| Key                        | Тема                                  |
| -------------------------- | ------------------------------------- |
| `cs.values-and-references` | значения и ссылки                     |
| `cs.mutability`            | мутабельность и копирование           |
| `js.values.types`          | примитивы и типы                      |
| `js.coercion.equality`     | приведение и сравнение                |
| `js.variables.scope`       | let/const/var, scope, TDZ             |
| `js.functions.basics`      | функции, callbacks, HOF               |
| `js.functions.closures`    | замыкания                             |
| `js.functions.this`        | this, bind/call/apply, arrow          |
| `js.objects.prototypes`    | объекты, прототипы, классы            |
| `js.collections.arrays`    | массивы и методы                      |
| `js.collections.map-set`   | Map/Set                               |
| `js.errors`                | Error, throw, try/catch/finally       |
| `js.async.promises`        | Promise chaining                      |
| `js.async.await`           | async/await и ошибки                  |
| `js.runtime.event-loop`    | call stack, tasks, microtasks         |
| `js.modules`               | ESM, import/export                    |
| `js.browser.events`        | DOM events/delegation basics          |
| `js.network.fetch`         | fetch, response и network/HTTP errors |

## Блоки

1. **Values and execution basics:** types, coercion, references, mutation, scope.
2. **Functions and object model:** functions, closures, `this`, objects/prototypes, arrays.
3. **Async and errors:** Error, Promise, async/await, event loop, fetch.
4. **Engineering application:** debugging, small code, comparison, AI review, complexity/edge cases, modules/events.

## Поведение run

- каталог показывает 36 items, четыре блока, 90–150 минут и возможность проходить частями;
- run snapshot фиксируется при создании;
- progress — блок и позиция, без pressure countdown;
- autosave сохраняет answer/revision, `Не знаю` валидно;
- baseline не выдаёт hints/solution;
- pause/resume и refresh/restart восстанавливают позицию из PostgreSQL;
- после блока локальные results отделяются от pending external review;
- full completion показывает coverage и export CTA, но не final readiness без достаточного evidence.

## Оценивание

- choice/output/code оцениваются детерминированно;
- `PREDICT_OUTPUT`: output локальный, explanation pending;
- `FIND_BUG`: локальное совпадение может быть диагностическим сигналом, не итоговой оценкой объяснения;
- `EXPLAIN` и аргументация compare/AI-review — manual/external;
- code выполняется в browser worker с timeout, tests и capped console;
- self-rating/confidence хранятся отдельно от objective score.

## Результат

После полного external analysis формируются coverage по темам, evidence-based statuses только где данных достаточно, misconceptions, calibration, blocking gaps и первые sessions. Ни один imported recommendation/status не применяется напрямую: import создаёт evaluations/evidence, затем работает learning engine.
