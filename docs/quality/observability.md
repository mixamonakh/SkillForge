# Observability

## Цель

Наблюдаемость помогает диагностировать local deployment, не собирая личные ответы и не создавая обязательную внешнюю телеметрию.

## Structured logs

API пишет JSON records:

- timestamp UTC;
- level;
- service/app version;
- requestId;
- route template и method;
- status/durationMs;
- stable errorCode;
- userId в сокращённом/хешированном виде;
- migration/content/algorithm/schema version для релевантной операции.

По умолчанию запрещены answerText/answerCode, prompt bundle, raw import/export payload, headers/cookies/API keys и raw SQL parameters. Exception serializer удаляет sensitive fields и stack в production response; server stack допустим в защищённом local log без payload.

## Request correlation

API принимает безопасный incoming request ID либо генерирует `req_…`, возвращает его в response/error envelope и прокидывает в child logs. Web показывает ID в деталях ошибки. Background/recompute transaction получает тот же correlation context.

## Health

- `/api/v1/health/live`: процесс event loop обслуживает запросы;
- `/api/v1/health/ready`: DB connection/latency, migrations current, required content pack/version и app version;
- Docker healthcheck использует эти endpoints с разумным timeout/retries.

Readiness не запускает destructive repair/import при каждом probe. Sensitive DB details не возвращаются наружу.

## Product metrics

Coverage, evidence freshness, calibration, pending reviews, misconceptions и load feedback хранятся локально в PostgreSQL/MetricSnapshot. Они не отправляются третьим лицам. Algorithm version позволяет воспроизвести historical values.

Streak/daily pressure metrics не собираются и не выводятся.

## Optional integrations

Prometheus `/metrics` и Sentry adapter могут появиться behind config, но не обязательны MVP и отключены по умолчанию. App startup/readiness не зависит от них. Перед включением требуется privacy review и фильтрация PII/answer content.

## Диагностика

```bash
docker compose logs --tail=200 api web db
docker compose ps
curl -i http://localhost:4000/api/v1/health/ready
```

При incident сохраняйте time range, requestId, errorCode и version metadata. Не копируйте весь DB/import payload в issue.
