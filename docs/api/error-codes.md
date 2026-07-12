# Коды ошибок API

Эта таблица задаёт стабильную семантику. Реализованные DTO/examples должны быть синхронизированы с OpenAPI. Неизвестная внутренняя ошибка возвращает `INTERNAL_ERROR` без stack/SQL.

| HTTP | Code                                 | Значение / действие клиента                                    |
| ---: | ------------------------------------ | -------------------------------------------------------------- |
|  400 | `VALIDATION_ERROR`                   | Некорректный DTO; показать field details.                      |
|  400 | `INVALID_CURSOR`                     | Cursor повреждён/устарел; сбросить pagination.                 |
|  400 | `INVALID_STATE_TRANSITION`           | Недопустимый lifecycle transition.                             |
|  400 | `CONTENT_REFERENCE_INVALID`          | Content ссылается на неизвестный stable key/version.           |
|  400 | `PROFILE_RESET_CONFIRMATION_INVALID` | Typed confirmation не совпала; ничего не удалено.              |
|  400 | `EXPORT_SCOPE_INVALID`               | Scope не соответствует выбранному bundle type.                 |
|  400 | `EXPORT_SCOPE_EMPTY`                 | В concrete/pending scope нет attempts для export.              |
|  404 | `RESOURCE_NOT_FOUND`                 | User-scoped resource отсутствует.                              |
|  404 | `TOPIC_NOT_FOUND`                    | Точный topic key неизвестен.                                   |
|  404 | `ASSESSMENT_NOT_FOUND`               | Blueprint key/version не найден.                               |
|  404 | `ASSESSMENT_RUN_NOT_FOUND`           | Run отсутствует или не принадлежит пользователю.               |
|  404 | `SESSION_NOT_FOUND`                  | Session отсутствует или не принадлежит пользователю.           |
|  404 | `ATTEMPT_NOT_FOUND`                  | Attempt отсутствует или не принадлежит пользователю.           |
|  404 | `EXPORT_ASSESSMENT_RUN_NOT_FOUND`    | Assessment scope отсутствует или не принадлежит пользователю.  |
|  404 | `EXPORT_SESSION_NOT_FOUND`           | Session scope отсутствует или не принадлежит пользователю.     |
|  404 | `EXPORT_TOPIC_NOT_FOUND`             | Topic scope не соответствует активному stable key.             |
|  409 | `ASSESSMENT_RUN_NOT_ACTIVE`          | Действие требует ACTIVE run.                                   |
|  409 | `ASSESSMENT_RUN_ALREADY_COMPLETED`   | Completed run нельзя менять/возобновлять.                      |
|  409 | `SESSION_NOT_ACTIVE`                 | Attempt/complete вызван для неверного состояния.               |
|  409 | `ATTEMPT_REVISION_CONFLICT`          | Autosave revision stale; вернуть server copy для merge/retry.  |
|  409 | `TASK_VERSION_IMMUTABLE`             | Использованную версию нельзя изменить.                         |
|  409 | `IMPORT_ALREADY_APPLIED`             | Batch уже применён; не повторять mutations.                    |
|  409 | `IMPORT_DUPLICATE_CHECKSUM`          | Этот analysis payload уже известен/применён.                   |
|  409 | `IMPORT_PREVIEW_STALE`               | Данные изменились после preview; построить новый preview.      |
|  413 | `PAYLOAD_TOO_LARGE`                  | Payload превышает configured limit (import default 5 MiB).     |
|  415 | `UNSUPPORTED_MEDIA_TYPE`             | Допускается заявленный JSON/file contract.                     |
|  422 | `IMPORT_JSON_MALFORMED`              | JSON не парсится, возможно с line/column.                      |
|  422 | `IMPORT_SCHEMA_UNSUPPORTED`          | Schema/contract version не поддерживается.                     |
|  422 | `IMPORT_SCHEMA_INVALID`              | JSON не соответствует strict schema.                           |
|  422 | `IMPORT_SOURCE_BUNDLE_UNKNOWN`       | sourceBundleId не найден.                                      |
|  422 | `IMPORT_UNKNOWN_ATTEMPT`             | Нельзя безопасно применить evaluation к attempt.               |
|  422 | `IMPORT_UNKNOWN_TOPIC`               | topicKey неизвестен; требуется mapping/rejection.              |
|  422 | `CONTENT_PREREQUISITE_CYCLE`         | Graph content pack содержит цикл.                              |
|  422 | `CODE_RUNNER_REQUEST_INVALID`        | Source/language/timeout не соответствует protocol.             |
|  429 | `AI_BUDGET_EXCEEDED`                 | Future API-assisted budget hard limit; manual mode доступен.   |
|  500 | `INTERNAL_ERROR`                     | Непредвиденная ошибка; показать requestId и retry.             |
|  503 | `DATABASE_NOT_READY`                 | Readiness: БД/миграции недоступны.                             |
|  503 | `CONTENT_NOT_READY`                  | Требуемый content pack не импортирован/невалиден.              |
|  503 | `AI_PROVIDER_DISABLED`               | API-assisted действие выключено; не влияет на manual workflow. |

## Validation details

Для field errors `details` может содержать безопасный список `{ path, rule, message }`. Для conflict autosave дополнительно возвращается `serverCopy` с revision и полями attempt. Import error показывает JSON path и ожидаемый тип, но не повторяет весь payload в логах.

## Request ID

Любая ошибка содержит `requestId`; тот же ID присутствует в structured log. Web показывает ID в разворачиваемых деталях, не как основной текст. Клиент не должен показывать raw `details` без безопасного mapping.
