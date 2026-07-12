# Backup и restore

## Что защищаем

PostgreSQL содержит attempts, assessment/session snapshots, evaluations, evidence, imports/exports и settings. Эти данные нельзя восстановить из content pack. Git хранит курируемый контент, но не пользовательские ответы.

## Backup

Штатная команда:

```bash
./scripts/backup.sh
```

Backup создаёт timestamped directory/archive в `./backups` с:

- PostgreSQL dump;
- metadata: app/schema/content pack versions, timestamp UTC;
- content manifest/checksum.

Если script поддерживает параметры, используйте его `--help`; не передавайте пароль в command line. Directory `backups/` исключён из Git.

Проверьте, что команда завершилась с exit code 0 и dump не пустой. Для ценных данных храните вторую копию в защищённом владельцем месте.

## Когда backup обязателен

- перед destructive/сложной migration;
- перед profile/database reset;
- перед restore другого dump;
- перед удалением Docker volume;
- перед major schema/content compatibility change.

## Restore

Restore заменяет текущее состояние и поэтому требует явный путь и interactive/typed confirmation:

```bash
./scripts/restore.sh ./backups/<timestamp>
```

Безопасный порядок:

1. Остановить write traffic (`web`/`api`).
2. Создать backup текущего состояния.
3. Проверить metadata/schema compatibility выбранного dump.
4. Запустить restore с точным path; arbitrary path traversal script отклоняет.
5. Применить только необходимые forward migrations.
6. Запустить API/web, проверить readiness.
7. Проверить профиль, один известный run/attempt и evidence provenance.

Не импортируйте SQL через web upload и не выполняйте shell text из недоверенного архива.

## Docker fallback (для диагностики)

Если wrapper script не может работать, сначала прочитайте его реализацию и Compose service names. Прямой `pg_dump`/`pg_restore` допустим только опытному оператору с явными credentials из локального env; команды не документируются как copy-paste с паролем, чтобы не утекали в shell history.

## Проверка восстановления

- migrations current;
- JS content pack version совпадает/совместима;
- AssessmentRun открывается на сохранённой позиции;
- Attempt body существует;
- TopicState можно recompute из evidence;
- applied import checksum не дублируется;
- health ready и logs не содержат answer body.

Restore считается подтверждённым только после этих проверок.
