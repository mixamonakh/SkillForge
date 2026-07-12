# ADR 0009: компенсирующий rollback последнего AI import

- Статус: принято
- Дата: 2026-07-12

## Контекст

Применённый внешний анализ создаёт immutable Evaluation/Evidence и пересчитывает TopicState. Пользователю нужен безопасный способ отменить ошибочно применённый batch без удаления исходных Attempt и без скрытого destructive reset. Схема MVP уже фиксирует audit lifecycle через статусы ImportBatch и не вводит отдельный статус rollback.

## Решение

`POST /api/v1/imports/:importId/rollback` разрешён только для последнего применённого batch пользователя. Одна PostgreSQL transaction:

1. блокирует batch и проверяет latest-only порядок;
2. удаляет только Evaluation/Evidence, созданные этим batch;
3. пересчитывает затронутые TopicState и review state из оставшегося evidence;
4. сохраняет rollback metadata/audit snapshot;
5. переводит компенсированный batch в существующий статус `REJECTED`.

Attempt, ответы, content versions и другие import batches не меняются.

## Причины

- latest-only порядок не позволяет старой компенсации сделать новый evidence state труднообъяснимым;
- повторный deterministic recompute сохраняет evidence-based источник истины;
- существующий `REJECTED` плюс audit metadata избегает новой схемной сущности только ради MVP-компенсации;
- явная кнопка с подтверждением исключает silent destructive действие.

## Последствия

- более старый batch сначала нельзя отменить, пока поверх него есть применённый import;
- rollback не является восстановлением всей БД и не заменяет backup/restore;
- новый lifecycle status можно добавить только отдельной migration и ADR, если audit/reporting потребует различать validation rejection и compensation на уровне enum.
