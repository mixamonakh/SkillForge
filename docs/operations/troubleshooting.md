# Troubleshooting

## Первичная диагностика

```bash
docker compose ps
docker compose logs --tail=200 api web db
curl -i http://localhost:4000/api/v1/health/live
curl -i http://localhost:4000/api/v1/health/ready
```

Сохраните requestId/errorCode. Не публикуйте `.env`, dump, full import payload или ответы пользователя.

## API не ready

Проверьте последовательно:

1. `db` healthy;
2. hostname/credentials/database из container environment;
3. migration status/error;
4. content validation/import status;
5. disk space/volume permissions.

Не используйте `prisma db push`, reset или удаление volume для обхода migration error. При несовместимой migration сначала backup и план forward fix.

## Web открывается, API requests падают

- проверьте `/api/v1` proxy и `API_INTERNAL_URL` внутри web container;
- hostname `api` работает внутри Compose, `localhost` внутри container указывает на него самого;
- сравните direct API readiness и same-origin browser request;
- проверьте requestId в API logs.

## Content отсутствует

```bash
pnpm content:validate
pnpm content:diff -- --pack js-baseline-v1
```

Проверьте `SEED_CONTENT_PACK`, schema compatibility и checksum conflict. Used TaskVersion с изменённым checksum нельзя перезаписывать — выпустите новую version.

## Autosave conflict/error

- дождитесь retry и не закрывайте вкладку с unsynced draft;
- при `ATTEMPT_REVISION_CONFLICT` сравните server copy с local draft;
- убедитесь, что run/session ACTIVE и item принадлежит snapshot;
- refresh должен восстановить server state, а аварийный draft — только несинхронизированное изменение;
- не исправляйте attempt напрямую в БД.

## Import отклонён

- `IMPORT_JSON_MALFORMED`: передайте pure JSON или один поддерживаемый fenced block;
- `IMPORT_SCHEMA_UNSUPPORTED`: попросите evaluator вернуть schema 1.0, не переименовывайте поля вручную вслепую;
- unknown attempt/topic: экспортируйте актуальный source bundle или выполните явное mapping/rejection;
- duplicate checksum: не применяйте повторно;
- stale preview: перестройте preview и снова проверьте diff.

AI JSON никогда не должен напрямую менять status.

## Runner timeout/runtime error

- infinite loop завершается timeout worker;
- source > configured limit отклоняется;
- network/DOM/import недоступны намеренно;
- проверьте JS/TS language и transpile error;
- console output обрезается намеренно;
- перезапуск main page не должен оставлять старый worker живым.

## Tests падают локально

- проверьте Node/pnpm versions и frozen lockfile;
- integration DB должна быть test-scoped;
- Playwright browsers устанавливаются принятой setup command проекта;
- не обновляйте snapshots/lockfile автоматически без понимания diff;
- при flaky e2e сохраните trace/screenshot и установите реальную причину.

## Порт занят

Найдите владеющий процесс/другой Compose project. Не меняйте публичные URL контракта без необходимости; остановите конфликтующий процесс или используйте документированный dev override.

## Последняя мера

Перед любым удалением volume создайте [backup](backup-restore.md). Новый чистый volume подходит только для изолированной диагностики; он не восстанавливает личные ответы.
