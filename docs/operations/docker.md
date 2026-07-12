# Docker Compose

## Запуск

```bash
docker compose up --build
```

Ожидаемый порядок: healthy PostgreSQL → `prisma migrate deploy` → default user → idempotent content import → API ready → web. Первый build может занимать дольше из-за image/dependencies.

Проверка:

```bash
docker compose ps
curl --fail http://localhost:3000
curl --fail http://localhost:4000/api/v1/health/live
curl --fail http://localhost:4000/api/v1/health/ready
```

Наличие healthcheck в manifest не подтверждает его прохождение; ориентируйтесь на фактический `compose ps` и curl.

## Сервисы и сеть

- `db`: PostgreSQL 18 Alpine, named volume, без host port в основном compose;
- `api`: production NestJS/Fastify image, internal DB hostname `db`;
- `web`: production Next.js image, internal API hostname `api`, public `localhost:3000`.

Процессы работают non-root. Images multi-stage и устанавливают exact lockfile. `latest` в production Dockerfile запрещён.

## Управление

```bash
docker compose logs -f api web db
docker compose restart
docker compose down
docker compose build --no-cache
```

`docker compose down` сохраняет named volume. `docker compose down -v` удаляет БД и допустим только после backup и явного решения владельца.

Для disposable clean verification не переиспользуйте основной volume. Задайте отдельные `COMPOSE_PROJECT_NAME` и `POSTGRES_VOLUME_NAME`; значения по умолчанию остаются `skillforge` и `skillforge_postgres_data`.

## Проверка persistence

1. Создайте/измените assessment attempt через UI.
2. Дождитесь индикатора `Сохранено`.
3. Зафиксируйте run ID/позицию без копирования ответа в лог.
4. Выполните `docker compose restart`.
5. Дождитесь healthy services.
6. Откройте run и проверьте позицию/ответ.

Это обязательная release verification, но не автоматическое обещание любого checkout.

## Миграции

API startup применяет только `prisma migrate deploy`. Новая migration создаётся в development и коммитится. Startup не запускает reset/db push. Ошибка migration оставляет API not ready и требует диагностики/backup, а не автоматического удаления volume.

## Configuration

Compose читает `.env`/environment. Не помещайте API keys и реальные дампы в image/build args. Для dev port PostgreSQL используйте `docker-compose.dev.yml`, если он предусмотрен.

## Очистка build cache

`docker compose build --no-cache` помогает при повреждённом cache, но не лечит migration/content errors. Перед удалением volume смотрите [troubleshooting](troubleshooting.md) и создавайте [backup](backup-restore.md).
