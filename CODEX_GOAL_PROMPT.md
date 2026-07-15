# Один Goal-промпт для Codex

Скопируй в Codex только текст между разделителями.

---

Работай автономно в текущем checkout репозитория SkillForge до полного завершения Learning System v2.

Репозиторий-источник:
https://github.com/mixamonakh/skillforge

Ты запущен в режиме Goal. Используй агентов и параллельный анализ там, где это ускоряет независимые проверки, но все решения, изменения и итоговую интеграцию контролируй сам. Не останавливайся после планирования, одной фазы, промежуточного отчёта или первого зелёного build. Не спрашивай подтверждение между фазами. Выполняй работу последовательно до достижения глобальных acceptance criteria.

## Сначала прочитай

В обязательном порядке изучи актуальные:

1. `AGENTS.md`;
2. `README.md`;
3. существующие `docs/`;
4. Prisma schema и миграции;
5. `packages/contracts`;
6. `packages/content-schema`;
7. `packages/learning-engine`;
8. `packages/db`;
9. `apps/api` и `apps/web`;
10. существующие content packs, importer, validators и тесты;
11. CI, Docker и operations docs;
12. корневые документы:
   - `SFV2_IMPLEMENTATION_SPEC.md`;
   - `SFV2_TASK_LEDGER.md`;
   - `SFV2_ADR_CAPABILITY_AND_AI.md`;
   - `SFV2_CONTRACTS_AND_SCHEMAS.md`;
   - `SFV2_CONTENT_QUALITY_GATES.md`;
   - `SFV2_AI_EVALUATOR_GOLD_SPEC.md`.

Актуальный код и `AGENTS.md` важнее предположений в proposal. Если найден реальный конфликт, не игнорируй требование: выбери безопасное решение, зафиксируй конфликт, аргументацию и сохранённый product intent в `SFV2_EXECUTION_LOG.md`.

## Управление длительной работой

Немедленно создай `SFV2_EXECUTION_LOG.md` со статусами Phase 0–8 из task ledger. Для каждой фазы фиксируй:

- plan;
- затронутые границы;
- изменённые файлы;
- миграции;
- проверки и фактический результат;
- ограничения;
- найденные дефекты;
- статус `PENDING / IN_PROGRESS / BLOCKED / COMPLETE`.

После каждой фазы обновляй лог и сразу переходи к следующей. Если сессия будет прервана техническим лимитом, этот файл должен позволить следующему запуску продолжить с первой незавершённой задачи без повторного разрушительного изменения.

Используй специализированных агентов как минимум для:

- анализа доменной модели и миграций;
- проверки learning-engine и алгоритмов;
- content schema/import compatibility;
- AI security, contracts и budget concurrency;
- UI/accessibility/e2e;
- финального независимого review diff и документации.

Не позволяй агентам параллельно изменять одни и те же файлы. Сначала разделяй области, затем интегрируй и перепроверяй общий результат.

## Главная цель

Реализуй весь scope `SFV2_TASK_LEDGER.md` от Phase 0 до Phase 8:

- content schema v2 с обратной совместимостью;
- partial evaluation coverage без ложного окончательного нуля;
- Capability Profile;
- rule-based adaptive routing;
- LearningPhase и versioned LearningSequenceBlueprint;
- Recommendation Engine v2 и Session Builder;
- `js-prebaseline-v1`;
- первый production-quality acquisition sequence по значениям, ссылкам, мутации, shallow copy и переносу в state update;
- bounded OpenAI-assisted architecture;
- rubric grading свободных ответов;
- content AI review;
- one nudge;
- gold evaluator dataset и calibration runner/report;
- AI budget ledger, caching, audit, preview/apply/reject;
- UI, API, migrations, tests, docs, Docker и operation readiness;
- финальный user-trial checklist.

Не сокращай backlog ради скорости. Не оставляй обязательную функцию декоративной кнопкой, TODO или моковым production-path.

## Неприкосновенные инварианты

- Сохрани все существующие ответы, attempts, evaluations, evidence, snapshots и review history.
- Не меняй задним числом использованные `TaskVersion` и machine keys.
- `content/packs/` остаётся canonical source курируемого контента.
- PostgreSQL не становится ручной CMS.
- `apps/web` не вычисляет mastery/capability/readiness.
- `apps/api` владеет use cases и транзакциями.
- `packages/learning-engine` содержит чистые детерминированные алгоритмы.
- Внешний и встроенный AI создаёт только candidate/evaluation/evidence; он не записывает TopicStatus напрямую.
- Одна успешная попытка не создаёт mastery.
- Не добавляй streak, daily goal, guilt-механику и ложную readiness.
- Не добавляй общий встроенный AI-чат.
- Не добавляй IRT/BKT, отдельную vector DB, Pinecone/Qdrant/Weaviate или agent framework ради инфраструктуры.
- Manual mode без API key остаётся полностью рабочим.
- Не логируй API key и полные пользовательские ответы в обычные application logs.
- Не используй `any`, destructive reset, `prisma db push` или обход typecheck.

## Реальный OpenAI API во время разработки

Пользователь подключит ключ после завершения. Поэтому:

- не требуй `OPENAI_API_KEY` для build, tests, Docker start или manual mode;
- реализуй provider abstraction и fake/test provider;
- integration/e2e AI-flow должны проходить без сети и без платного ключа;
- реальный OpenAI adapter включается только при `AI_MODE=api-assisted` и наличии ключа;
- используй Responses API и Structured Outputs через строгую локальную runtime validation;
- model IDs должны быть конфигурируемыми через env, не размазанными по коду;
- создай в `.env.example` следующие переменные и документируй их:
  - `AI_MODE=manual`;
  - `AI_MONTHLY_BUDGET_USD=10`;
  - `OPENAI_API_KEY=`;
  - `OPENAI_PROJECT_ID=`;
  - `OPENAI_ORGANIZATION_ID=`;
  - `OPENAI_MODEL_ATTEMPT_EVALUATION=gpt-5.6-luna`;
  - `OPENAI_MODEL_CONTENT_REVIEW=gpt-5.6-luna`;
  - `OPENAI_MODEL_NUDGE=gpt-5.6-luna`;
  - `OPENAI_MODEL_ESCALATION=gpt-5.6-terra`;
  - feature flags для grading/content review/nudge;
- отсутствие или ошибка API не должны блокировать прохождение сессии и ручной export/import.
- добавь безопасные команды `pnpm ai:smoke`, `pnpm ai:calibrate` и `pnpm ai:usage` либо эквивалентные documented scripts; smoke не должен печатать ключ или полный answer body.

## Контент в рамках этого Goal

Создай только тот production-quality минимум, который обязателен в Phase 4 и Phase 5. Не генерируй сотни задач и не раздувай curriculum.

Контент обязан пройти `SFV2_CONTENT_QUALITY_GATES.md`, содержать authoritative sources, stable keys, versioning, deterministic tests для CODE, v2 pedagogy metadata и human-review report. Существующий `js-baseline-v1` не переписывай; меняй только display positioning, если это требуется спецификацией.

## Миграции и совместимость

- Используй Prisma Migrate.
- Перед любой потенциально destructive миграцией создай/проверь backup path и migration test.
- Добавляй безопасные nullable/default поля, backfill и только затем усиливай constraints, если требуется.
- Старые assessment/session snapshots должны читаться после обновления.
- Старые export/import contracts должны оставаться поддержанными либо иметь явную versioned migration с тестами.
- Изменение алгоритмов требует version bump, ADR и regression tests.

## Проверки

Не считай фазу завершённой без релевантных тестов. В конце выполни полный набор, доступный в актуальном репозитории, включая как минимум:

- `pnpm content:validate`;
- format/lint;
- strict typecheck;
- unit tests;
- integration tests;
- contract/OpenAPI drift checks;
- production build;
- Playwright e2e;
- Docker build и cold start;
- health checks;
- persistence после restart;
- backup/restore smoke test;
- старый baseline pause/resume;
- новый pre-baseline;
- acquisition sequence;
- AI fake-provider flow;
- budget concurrency, cache и idempotency;
- gold evaluator calibration report;
- accessibility checks.

Исправляй ошибки до зелёного результата. Не скрывай failed/skipped checks. Если конкретная проверка объективно невозможна в окружении, зафиксируй точную причину, доказательства и команду, которую должен выполнить пользователь; продолжай всё остальное.

## Условия остановки

Не останавливайся из-за:

- большого объёма;
- необходимости перейти к следующей фазе;
- желания показать промежуточный результат;
- отсутствия реального API key;
- необходимости обновить документацию или тесты.

Остановиться до завершения разрешено только при объективном блокере, который нельзя безопасно решить из checkout: отсутствующий внешний секрет для необязательного live-smoke, недоступный системный ресурс или противоречие, где любое решение угрожает пользовательским данным. Даже тогда сначала заверши все независимые задачи и зафиксируй минимальный unblock request.

## Финальный результат

После выполнения всех фаз:

1. Проведи независимый итоговый review с агентами.
2. Сверь реализацию с каждым пунктом `SFV2_TASK_LEDGER.md` и глобальными acceptance criteria `SFV2_IMPLEMENTATION_SPEC.md`.
3. Убедись, что `SFV2_EXECUTION_LOG.md` не содержит незамеченных пропусков.
4. Обнови README, docs map, operations, API, content authoring, security, testing и ADR.
5. Не создавай branch, commit, issue или PR без отдельной команды пользователя.
6. В финальном отчёте перечисли:
   - реализованное поведение;
   - ключевые архитектурные решения;
   - миграции и сохранность старых данных;
   - созданный контент;
   - AI-функции и manual fallback;
   - фактически выполненные команды и результаты;
   - известные ограничения;
   - точные действия пользователя для подключения OpenAI API;
   - manual user-trial checklist.

Начинай с инспекции репозитория и создания `SFV2_EXECUTION_LOG.md`. Затем непрерывно выполняй Phase 0–8.

---
