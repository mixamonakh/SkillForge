# Архитектурные границы

## Dependency rules

| Источник           | Может зависеть от                         | Не может зависеть от                              |
| ------------------ | ----------------------------------------- | ------------------------------------------------- |
| `apps/web`         | contracts, UI, HTTP client                | Prisma, API internals, DB, mastery implementation |
| API presentation   | application DTO/use cases, contracts      | Prisma напрямую, UI                               |
| API application    | domain, repository ports, learning engine | Next/React, transport-specific response logic     |
| API infrastructure | repository ports, Prisma/db               | web components                                    |
| learning engine    | собственные types/config                  | Nest, Prisma, React, filesystem, network          |
| db                 | Prisma, persistence helpers               | product policy/mastery decisions                  |
| contracts          | Zod/JSON schema/public types              | application implementations                       |
| UI                 | tokens/primitives                         | API, DB, content import                           |

Package использует только public exports другого package. Запрещены относительные импорты в его `src`.

## Domain module rules

- Profile владеет user settings и reset confirmation.
- Curriculum владеет track/topic/content read models.
- Assessment владеет blueprint snapshot и run lifecycle.
- Session владеет plan, items, pause/resume и attempts orchestration.
- Evaluation создаёт immutable evaluator results.
- Mastery/review используют learning engine и владеют recompute transaction orchestration.
- Import-export владеет schema validation, checksum, preview/apply и audit trail.
- Metrics читает объяснимые агрегаты, не создаёт evidence.
- Battle Evidence владеет external artifacts; evidence появляется через evaluation/confirmation use case.

Модуль не читает таблицу другого модуля в обход публичного application service/repository contract только ради удобства. Для согласованной транзакции используется явный orchestration use case.

## Invariants across boundaries

1. Machine key не вычисляется из русского title.
2. Used TaskVersion immutable.
3. Evaluation append-only; переоценка создаёт новую запись и ссылку supersedes.
4. Evidence хранит provenance.
5. TopicState воспроизводим из Evidence.
6. Import не записывает TopicState/status напрямую.
7. Все user data queries scoped текущим local user, чтобы не блокировать future multi-user.
8. External payload проходит runtime validation до domain logic.
9. Transaction boundary находится в API application/infrastructure, не в controller/web.

## Browser boundary

Web Worker изолирует execution от main window, но не от владельца браузера. Он не получает DOM, network APIs, arbitrary imports или unlimited output. API не доверяет RunnerResponse как server security proof; в local MVP это deterministic learning evaluator для одного пользователя.

## Documentation rule

Изменение boundary, ownership или зависимости требует обновить этот файл и соответствующий ADR. Временное нарушение не разрешается комментарием `TODO`; нужен явный план и тест, либо изменение не принимается.
