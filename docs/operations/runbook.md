# Эксплуатационный runbook

## Start

```bash
docker compose up -d --build
docker compose ps
curl --fail http://localhost:4000/api/v1/health/ready
curl --fail http://localhost:3000
```

Оператор проверяет фактический health, migration/content version и отсутствие restart loop. Manual AI mode и пустой API key — нормальны.

## Stop/restart

```bash
docker compose down
docker compose restart
```

Обе операции сохраняют named DB volume. После restart проверьте ready и восстановление незавершённого run.

## Daily/local checks

Для personal MVP постоянный on-call не требуется. При использовании проверяйте:

- autosave до закрытия страницы;
- pending external review count;
- свободное место для DB/backups;
- health при появлении ошибок.

Нет cron, streak или push, которые требуют ежедневного входа.

## Release verification

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm content:validate
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm test:e2e
docker compose build
docker compose up -d
docker compose ps
curl --fail http://localhost:3000
curl --fail http://localhost:4000/api/v1/health/ready
```

Затем создайте безопасный test attempt, дождитесь autosave, `docker compose restart` и проверьте сохранность. Фиксируйте команды/exit codes в release report; runbook не является доказательством выполнения.

## Migration procedure

1. Проверить migration SQL и destructive warnings.
2. Запустить unit/integration на PostgreSQL 18.
3. Создать backup текущей БД.
4. Применить `prisma migrate deploy` через штатный startup/команду.
5. Проверить ready, critical reads, autosave и recompute.
6. При проблеме остановить writes и выполнить forward fix либо документированный restore; не использовать db push/reset.

## Content release

1. `content:validate`.
2. Diff stable key/version/checksum и counts.
3. Review prompts/rubrics/tests/sources.
4. Import идемпотентно.
5. Повтор import не меняет counts/checksums.
6. Sample assessment snapshot и code runner.

## Import incident

Если apply дал неожиданный projected/result state:

1. прекратить новые apply;
2. сохранить requestId/importId/checksum без raw answer content;
3. сравнить stored preview, Evaluations и Evidence provenance;
4. проверить algorithm/schema versions;
5. использовать compensating action/restore snapshot по документированному пути;
6. добавить regression integration test.

Не редактировать TopicState вручную: cache пересчитывается из evidence.

## Data loss/corruption

1. Остановить API writes.
2. Сохранить текущий volume/read-only dump, даже если он повреждён.
3. Выбрать проверенный backup и выполнить [restore](backup-restore.md).
4. Проверить migrations, content, run/attempt/evidence и checksum deduplication.
5. Документировать root cause без публикации личных ответов.

## Security incident

- убрать внешний bind;
- отозвать потенциально раскрытый API key;
- проверить access/error logs по requestId;
- не загружать DB third party;
- следовать [SECURITY.md](../../SECURITY.md).

## Upgrade/rollback

Application image можно вернуть только если прежний код совместим с текущей schema. DB rollback по удалению migration не выполняется автоматически. Предпочтителен forward fix; restore используется с backup и осознанной потерей изменений после его времени.
