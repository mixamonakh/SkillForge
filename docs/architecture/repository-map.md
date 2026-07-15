# Карта репозитория

```text
skillforge/
├── apps/
│   ├── web/                  Next.js UI, browser worker, web tests
│   └── api/                  NestJS/Fastify modules и API tests
├── packages/
│   ├── db/                   Prisma schema/client/migrations/repositories
│   ├── contracts/            versioned public runtime contracts
│   ├── learning-engine/      pure mastery/review/recommendation functions
│   ├── content-schema/       JSON content validation
│   ├── ai-provider/          bounded provider adapters/contracts (Phase 6 target)
│   ├── ui/                   shared design tokens/components
│   ├── eslint-config/        shared lint policy
│   └── tsconfig/             shared strict TypeScript configs
├── content/
│   ├── packs/
│   │   ├── js-baseline-v1/   immutable extended diagnostic
│   │   ├── js-prebaseline-v1/ short calibration router (Phase 4 target)
│   │   └── js-core-training-v1/ first acquisition sequence (Phase 5 target)
│   └── evaluator-gold/       evaluator calibration fixtures (Phase 6 target)
├── docs/                     product, architecture, domain, operations, ADR
├── scripts/                  backup/restore и проверочные utilities
├── e2e/                      Playwright critical flows
├── reference/                visual reference, не production logic
├── .github/workflows/        CI
├── docker-compose.yml        local production-like startup
├── docker-compose.dev.yml    optional development overrides
├── package.json              root task entry points
├── pnpm-workspace.yaml       workspace declaration
└── turbo.json                build/test task graph
```

## Backend module layout

Предпочтительное направление зависимости:

```text
presentation/controller
  → application/use case
    → domain policy + repository port
      ← infrastructure/Prisma adapter
```

Не требуется создавать пустой слой ради формы. Однако controller не содержит Prisma calls, mastery formula, ручной parsing AI JSON или multi-record transaction logic.

## Frontend layout

```text
src/app/       routing, layouts, loading/error boundaries, providers
src/features/  start-assessment, answer-task, import-analysis, export-bundle
src/entities/  topic, session, attempt, evidence presentation
src/widgets/   dashboard-focus, roadmap-track, resume-banner
src/shared/    API client, UI adapters, config, small utilities
```

Feature публикует понятный `index.ts`; исходники другого package напрямую не импортируются. Next page/layout могут использовать default export как framework convention, остальные модули — named exports.

## Ownership

| Область                           | Owner/source of truth             |
| --------------------------------- | --------------------------------- |
| HTTP contract/OpenAPI             | `apps/api` + `packages/contracts` |
| import/export schema version      | `packages/contracts`              |
| persistence schema/migrations     | `packages/db`                     |
| mastery/capability/routing/review | `packages/learning-engine`        |
| curated prompts/tasks/theory      | `content/packs`                   |
| provider contracts/adapters       | `packages/ai-provider`            |
| design system                     | `packages/ui`                     |
| user/server state                 | API + PostgreSQL                  |
| emergency unsynced draft          | browser storage, не canonical     |

## Размер и связанность

Целевой предел — до 500 строк на файл и до 300 строк на service без обоснования. Общие enum не копируются вручную между слоями. Generated API files не редактируются вручную. Изменение карты репозитория требует обновить этот документ.
