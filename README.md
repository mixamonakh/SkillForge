# SkillForge

SkillForge — локальная система калибровки и усиления инженерных компетенций на основе проверяемых доказательств. Она сохраняет реальные ответы и код, отделяет самооценку от оценки навыка и предлагает один следующий полезный шаг. Это не LMS, не трекер привычек и не AI-чат.

Рабочий контур JavaScript включает legacy baseline, короткую adaptive pre-baseline, capability profile, объяснимую recommendation v2 и versioned learning sequences. Ответы переживают autosave/pause/resume; локальная проверка отделена от manual и bounded API-assisted review. AI создаёт только preview-candidate; Apply идёт через обычные `Evaluation`/`Evidence`, а не пишет mastery или `TopicStatus` напрямую.

Визуальный placeholder до фиксации первого эталонного снимка: [`docs/assets/dashboard-placeholder.svg`](docs/assets/dashboard-placeholder.svg).

## Требования

- Docker Desktop с Docker Compose v2;
- для разработки без контейнеров: Node.js 24 LTS и pnpm 10 через Corepack.

API-ключ OpenAI не нужен. Режим по умолчанию — `AI_MODE=manual`.

## Быстрый запуск

```bash
docker compose up --build
```

После успешного запуска:

- приложение: <http://localhost:3000>;
- API: <http://localhost:4000/api/v1>;
- Swagger UI: <http://localhost:4000/api/docs>;
- OpenAPI JSON: <http://localhost:4000/api/openapi.json>;
- readiness probe: <http://localhost:4000/api/v1/health/ready>.

Первый запуск ожидает PostgreSQL, применяет сохранённые миграции, создаёт одного локального пользователя и идемпотентно импортирует `js-baseline-v1` и `js-prebaseline-v1`. Старый baseline остаётся расширенной диагностикой; pre-baseline честно помечен DRAFT до human review. Новый пользователь видит «Профиль не откалиброван»: SkillForge не показывает придуманный mastery до достаточных evidence. Bundled JS-only content не создаёт `TargetTrack`, поэтому readiness честно остаётся «не настроен» с `value: null`.

Остановить сервисы без удаления данных:

```bash
docker compose down
```

Не добавляйте `-v`, если не намерены удалить PostgreSQL volume.

## Локальная разработка

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Основные команды:

| Команда                                              | Назначение                                       |
| ---------------------------------------------------- | ------------------------------------------------ |
| `pnpm lint`                                          | ESLint для workspace                             |
| `pnpm typecheck`                                     | строгая проверка TypeScript                      |
| `pnpm test`                                          | unit-тесты                                       |
| `pnpm test:integration`                              | интеграционные тесты с PostgreSQL                |
| `pnpm test:e2e`                                      | критические пользовательские сценарии Playwright |
| `pnpm build`                                         | production build всех пакетов и приложений       |
| `pnpm check`                                         | lint, форматирование, typecheck, unit и build    |
| `pnpm content:validate`                              | проверка схем и связности content packs          |
| `pnpm content:import -- --pack js-baseline-v1`       | идемпотентный импорт baseline-контента           |
| `pnpm content:diff -- --pack js-baseline-v1`         | diff content pack и БД                           |
| `pnpm content:export -- --out ./backup/content.json` | экспорт контента                                 |
| `pnpm content:ai-review -- --pack <key>`              | bounded AI-review report без auto-edit          |
| `pnpm ai:calibrate`                                   | технический evaluator gold report                 |
| `pnpm ai:usage`                                       | сводка AI budget за текущий месяц          |

Точная подготовка окружения описана в [локальной разработке](docs/operations/local-development.md), контейнерный запуск — в [Docker-инструкции](docs/operations/docker.md).

## Архитектура

Репозиторий — pnpm/Turborepo monorepo:

- `apps/web` — Next.js App Router, UI и browser Web Worker;
- `apps/api` — NestJS/Fastify модульный монолит, use cases и транзакции;
- `packages/db` — Prisma, миграции и persistence adapters;
- `packages/contracts` — версионированные runtime-схемы и публичные типы;
- `packages/learning-engine` — чистые детерминированные расчёты mastery, review и рекомендаций;
- `packages/content-schema` — валидация content packs;
- `packages/ai-provider` — strict AI contracts, prompts, provider adapters, cost routing и calibration CLI;
- `packages/ui` — дизайн-токены и общие компоненты;
- `content/packs` — Git source of truth для учебного контента.

Web не обращается к PostgreSQL и не рассчитывает mastery. Импортированный AI-анализ создаёт `Evaluation` и `Evidence`, после чего API пересчитывает `TopicState`; статус из JSON напрямую не записывается. Подробнее: [обзор архитектуры](docs/architecture/overview.md) и [потоки данных](docs/architecture/data-flow.md).

## Контент

Курируемый контент версионируется в `content/packs` и импортируется в PostgreSQL по stable key, version и checksum. Повторный импорт того же checksum восстанавливает canonical release-status, но не переписывает задействованные `TaskVersion`, answers, evaluations, evidence и snapshots.

`js-baseline-v1` — совместимый v1 source. `js-prebaseline-v1` и `js-core-training-v1` используют v2 metadata; оба остаются DRAFT/`NEEDS_HUMAN_REVIEW` до реального user trial. Задействованная в попытке `TaskVersion` неизменяема. Перед импортом запускайте:

```bash
pnpm content:validate
pnpm content:diff -- --pack js-baseline-v1
pnpm content:import -- --pack js-baseline-v1
```

Правила: [авторинг](docs/content/authoring.md), [схемы](docs/content/schema.md), [JavaScript Baseline v1](docs/content/js-baseline-v1.md).

## Резервное копирование

Пользовательские ответы и evidence считаются ценными данными. Перед destructive-операциями создайте backup:

```bash
./scripts/backup.sh
./scripts/restore.sh ./backups/<backup-directory>
```

Restore требует явный путь и подтверждение. См. [backup/restore](docs/operations/backup-restore.md).

## Проверки

Минимальная полная локальная проверка:

```bash
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
```

Наличие команды в README не является подтверждением её успешного результата в конкретном checkout. Фактические результаты фиксируются в CI и в отчёте запуска. Тестовая стратегия: [docs/quality/testing.md](docs/quality/testing.md).

## Режимы AI

- `manual` — штатный режим по умолчанию: JSON/Markdown export и strict preview/apply импорта полностью работают без API key;
- `api-assisted` — отдельные feature flags для attempt review и one-nudge, strict Structured Outputs, preview/Apply/Reject/compensating Rollback, cache и atomic monthly budget. OpenAI provider требует серверный key и явные тарифы; fake provider разрешён только явно для тестов;
- встроенного AI-чата нет;
- пустой `OPENAI_API_KEY` является штатной конфигурацией.

## Известные ограничения MVP

- один локальный пользователь, без login при bind на localhost;
- JavaScript baseline активен; pre-baseline и первый training pack технически проверены, но не объявлены педагогически успешными до human trial;
- browser Web Worker — граница отказа и UX для локального доверенного пользователя, а не security sandbox для multi-user запуска;
- hidden tests в браузере нельзя считать секретными;
- свободный текст не получает выдуманную локальную оценку и остаётся pending до ручного/внешнего анализа;
- bundled MVP не импортирует Yandex `TargetTrack`: readiness endpoint возвращает `not-configured` и `value: null`; расчёт выполняется только при наличии активного версионированного target profile в БД и не является вероятностью оффера;
- внешняя телеметрия и Sentry по умолчанию отключены.

Будущие направления перечислены в [future roadmap](docs/product/future-roadmap.md). Они не должны отображаться как готовые функции.

## Документация

- [видение и принципы](docs/product/vision.md);
- [границы MVP](docs/product/scope-mvp.md);
- [карта репозитория](docs/architecture/repository-map.md);
- [доменная модель](docs/domain/data-model.md);
- [learning engine](docs/domain/learning-engine.md);
- [API](docs/api/overview.md);
- [import/export](docs/api/import-export.md);
- [эксплуатационный runbook](docs/operations/runbook.md);
- [security](SECURITY.md);
- [ADR](docs/adr/0001-monorepo.md).
- [ADR capability model](docs/adr/0010-capability-model.md) и [AI-assisted evaluation](docs/adr/0011-ai-assisted-evaluation.md).

## Диагностика проблем

Начните с:

```bash
docker compose ps
docker compose logs api web db
curl --fail http://localhost:4000/api/v1/health/ready
```

Типовые причины и безопасные действия описаны в [troubleshooting](docs/operations/troubleshooting.md). Не используйте `prisma db push`, автоматический reset БД или удаление volume как «универсальное исправление».

## Лицензия

Проект закрытый и не лицензирован для копирования или распространения. См. [LICENSE](LICENSE).
