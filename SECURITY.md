# Политика безопасности SkillForge

## Поддерживаемая модель

MVP рассчитан на одного доверенного пользователя и запуск на `localhost`. Отсутствие login допустимо только при локальном bind. Публикация web/API во внешнюю сеть без аутентификации не поддерживается.

Это локальный инструмент обучения, а не hardened multi-tenant сервис. Подробная threat model находится в [docs/quality/security.md](docs/quality/security.md).

## Сообщение об уязвимости

Не публикуйте уязвимость и пользовательские данные в открытом issue. Передайте владельцу проекта приватно:

- версию/commit;
- затронутый компонент;
- воспроизводимые шаги без реальных ответов и секретов;
- возможное влияние;
- безопасный proof of concept.

Поскольку публичный security contact для частного проекта не задан, используйте приватный канал владельца репозитория. Не создавайте внешние аккаунты и не загружайте дамп БД для отчёта.

## Границы доверия

- Внешний AI JSON, Markdown, content packs и upload-файлы недоверенны и проходят runtime validation.
- AI import не может менять настройки, удалять evidence, создавать пользователя или напрямую устанавливать mastery.
- Пользовательский JS выполняется только в browser Web Worker с timeout, ограничением source/output и выключенными network APIs.
- Worker не является полноценным sandbox: он допустим только для локального доверенного пользователя. Multi-user режим требует отдельного изолированного runner service/container.
- Hidden browser tests — UX-механика, не секрет и не security boundary.
- `OPENAI_API_KEY`, если когда-либо включён API-assisted режим, остаётся только на сервере и не попадает в browser bundle/logs.

## Обязательные меры

- bind приложения на localhost в режиме без auth;
- CSP и security headers;
- per-request CSP nonce и request-time rendering Next.js bootstrap-скриптов;
- sanitize Markdown/HTML; запрет небезопасного `dangerouslySetInnerHTML`;
- лимит импорта 5 MiB, ограничения JSON depth/arrays и строгие schema/version checks;
- параметризованные запросы через Prisma;
- Docker processes без root, PostgreSQL без host port в основном compose;
- request IDs и структурированные логи без answer body, import payload и секретов;
- atomic import, checksum deduplication и сохранение provenance;
- dependency audit в CI;
- backup перед destructive-миграцией и явное подтверждение reset/restore.

## Данные

Attempts, evaluations и evidence считаются ценными пользовательскими данными. Не отправляйте их третьим лицам неявно. Export — только явное действие пользователя. Сторонняя аналитика и Sentry отключены по умолчанию.

При подозрении на компрометацию API key отзовите ключ у провайдера, остановите внешний bind и проверьте логи на metadata утечки; полные ответы в логах отсутствовать должны.
