# Участие в разработке SkillForge

SkillForge пока является частным локальным проектом. Внешние pull request не подразумеваются автоматически, но эти правила обязательны для любых изменений в репозитории.

## Перед изменением

1. Прочитайте [AGENTS.md](AGENTS.md) и документацию затрагиваемого домена.
2. Проверьте существующий код и тесты.
3. Сформулируйте минимальный связный объём изменения.
4. Для спорного продуктового решения сначала создайте ADR; не вводите новые сущности и статусы без требования.

Нельзя добавлять streak, ежедневное давление, fake readiness, прямое присваивание mastery из AI JSON или встроенный AI-чат.

## Настройка

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
docker compose up -d db
pnpm db:migrate:deploy
pnpm content:validate
pnpm content:import -- --pack js-baseline-v1
pnpm dev
```

Используйте Node.js 24 LTS и версию pnpm из поля `packageManager`. Lockfile меняется только осознанной установкой зависимостей.

## Границы кода

- UI и browser orchestration — `apps/web`.
- Use cases, authorization boundary и транзакции — `apps/api`.
- Persistence — `packages/db`, без продуктовых формул.
- Алгоритмы обучения — pure TypeScript в `packages/learning-engine`.
- Публичные runtime-контракты — `packages/contracts`.
- Курируемый контент — `content/packs`.
- Межпакетные импорты идут только через public exports.
- Controller не вызывает Prisma напрямую.

Stable ID — английский machine key. Русский title не участвует в идентичности. Использованная `TaskVersion` не изменяется: выпускается новая версия.

## Код и формат

- TypeScript strict, `noUncheckedIndexedAccess` и `exactOptionalPropertyTypes` там, где это поддержано.
- `any` допустим только в документированном boundary adapter.
- Exhaustive switch для доменных enum.
- Runtime validation на HTTP, файлах, env и импортируемом JSON.
- Не логируйте ответы пользователя, токены или полные import payload.
- Используйте принятый formatter; не форматируйте несвязанные файлы.
- UI — русский, Lucide, SkillForge tokens, WCAG 2.2 AA; MUI не добавлять.

## Миграции и контент

- Production workflow использует только Prisma Migrate; `db push` запрещён.
- Миграция обязана сохранять attempts/evidence или явно требовать backup и подтверждение.
- Seed и content import идемпотентны.
- Изменение mastery/readiness требует версии алгоритма, ADR, recompute-плана и тестов.
- До импорта контента запускайте validate и diff.

## Проверки перед передачей

```bash
pnpm content:validate
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm test:e2e
```

Для изменений Docker дополнительно:

```bash
docker compose build
docker compose up -d
docker compose ps
curl --fail http://localhost:3000
curl --fail http://localhost:4000/api/v1/health/ready
```

Критические сценарии должны проверять реальный PostgreSQL и сохранение после restart. Тест нельзя заменять моковым mastery/import/autosave.

## Документация и история

- Изменили поведение — обновите соответствующий doc.
- Изменили архитектурное решение — добавьте или supersede ADR.
- Пользовательское изменение добавьте в `CHANGELOG.md` в раздел `Unreleased`.
- В отчёте перечислите файлы, выполненные команды и ограничения; не заявляйте проверки, которые не запускались.
