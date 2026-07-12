# ADR 0001: pnpm/Turborepo monorepo

- Статус: принято
- Дата: 2026-07-11

## Контекст

SkillForge имеет отдельные web/API deployment units и несколько shared domains: contracts, learning engine, persistence, content schema и UI. Версии контрактов должны меняться согласованно, а clean-clone verification — запускаться одной системой команд.

Раздельные репозитории увеличили бы coordination/contract drift для одного локального продукта. Один frontend-only package нарушает требования PostgreSQL, транзакций и backend boundaries.

## Решение

Использовать pnpm 10 workspaces и Turborepo. Структура: `apps/web`, `apps/api`, `packages/{db,contracts,learning-engine,content-schema,ui,eslint-config,tsconfig}`, root `content`, `e2e`, `docs` и scripts.

Package boundaries являются API: imports идут через public exports, Turborepo задаёт dependency task graph, один frozen lockfile фиксирует совместимые версии. Web/API остаются отдельными Docker images.

## Последствия

Положительные:

- атомарное изменение HTTP/domain contract и consumer;
- единые lint/typecheck/test/build/CI;
- переиспользование pure types без копирования enum;
- один lockfile и reproducible container build;
- проще проверить clean clone.

Стоимость:

- нужно следить за boundaries/cycles и Turbo cache;
- root install больше, чем в одном приложении;
- некорректный deep import может создать скрытую связанность.

Меры: public `index.ts`, lint boundary rules, generated OpenAPI client и docs ownership map.

## Рассмотренные варианты

- **Два репозитория:** отклонено из-за contract drift и лишнего release coordination.
- **Один Next.js full-stack проект:** отклонено; смешивает UI/application/persistence и ухудшает OpenAPI/transaction ownership.
- **Nx:** возможно, но Turborepo + pnpm достаточно для небольшого числа packages и соответствует implementation contract.
