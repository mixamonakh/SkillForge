# Документация SkillForge

- Product: [видение](product/vision.md), [MVP](product/scope-mvp.md), [Learning System v2](product/learning-system-v2.md), [pre-baseline](product/pre-baseline.md), [UX](product/ux-principles.md), [future roadmap](product/future-roadmap.md).
- Brand: [брендбук](brand/brandbook.md), [design tokens](brand/design-tokens.md).
- Architecture: [обзор](architecture/overview.md), [карта репозитория](architecture/repository-map.md), [data flow](architecture/data-flow.md), [deployment](architecture/deployment.md), [boundaries](architecture/boundaries.md).
- Domain: [глоссарий](domain/glossary.md), [data model](domain/data-model.md), [learning engine](domain/learning-engine.md), [capability profile](domain/capability-profile.md), [adaptive selection](domain/adaptive-selection.md), [session builder](domain/session-builder.md), [readiness](domain/readiness.md), [review](domain/review-scheduling.md), [provenance](domain/evidence-provenance.md).
- AI: [архитектура](ai/architecture.md), [evaluator](ai/evaluator.md), [budget/privacy](ai/budget-and-privacy.md).
- Content: [authoring](content/authoring.md), [schema v1](content/schema.md), [schema v2](content/content-schema-v2.md), [quality gates](content/quality-gates.md), [generation](content/generation-workflow.md), [JS baseline](content/js-baseline-v1.md).
- API: [overview](api/overview.md), [bounded AI](api/ai.md), [import/export](api/import-export.md), [error codes](api/error-codes.md).
- Operations: [development](operations/local-development.md), [Docker](operations/docker.md), [backup/restore](operations/backup-restore.md), [troubleshooting](operations/troubleshooting.md), [runbook](operations/runbook.md).
- Quality: [testing](quality/testing.md), [manual user trial](quality/manual-user-trial.md), [security](quality/security.md), [observability](quality/observability.md).
- Decisions: [ADR 0001–0007](adr/0001-monorepo.md), [ADR 0008](adr/0008-json-content-packs.md), [ADR 0009](adr/0009-import-compensation.md), [ADR 0010](adr/0010-capability-model.md), [ADR 0011](adr/0011-ai-assisted-evaluation.md).

Архитектурное или поведенческое изменение обновляет соответствующий документ/ADR в том же change. Документ описывает контракт; фактическую готовность конкретного checkout подтверждают только выполненные проверки и release report.
