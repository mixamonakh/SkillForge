# AGENTS.md — SkillForge

## 1. Product mission

SkillForge is a personal evidence-based engineering learning system. The product must help the user understand what they can actually do, preserve attempts, and recommend a next useful step. It is not a habit tracker, generic LMS, or AI chat.

## 2. Non-negotiable product rules

- Never add streaks, daily goals, guilt messages, or loss-of-series mechanics.
- Never display fabricated readiness or mastery values.
- Before sufficient evidence, show `unknown` / `not calibrated`.
- AI output is advisory evidence, never direct truth.
- External analysis must be schema-validated, previewed, and applied transactionally.
- A single successful answer cannot produce `mastered`.
- User answers are valuable data. Never run destructive migrations or resets silently.
- The app must work with `AI_MODE=manual` and no API key.
- Do not add an embedded AI chat without an explicit new product decision and ADR.

## 3. Architecture boundaries

- `apps/web` renders UI and orchestrates user interaction. It does not calculate mastery.
- `apps/api` owns use cases and transactions.
- `packages/learning-engine` contains pure deterministic learning algorithms.
- `packages/db` contains persistence, not product policy.
- `packages/contracts` owns versioned import/export schemas.
- `packages/ai-provider` owns provider-neutral strict AI contracts, prompt versions, adapters and cost calculation; it does not write learning state.
- `content/packs` is the source of truth for curated learning content.
- Controllers must not call Prisma directly.
- Web components must not import Prisma or backend internals.
- Do not import source files across package boundaries; use public package exports.

## 4. Stable IDs and versioning

- Never generate IDs from Russian display titles.
- Topics and tasks use stable English machine keys.
- Used TaskVersion records are immutable.
- Learning algorithms, schemas, content packs, assessments, and target tracks are versioned.
- Changes to mastery/readiness formulas require an ADR, version bump, and tests.

## 5. Required workflow for every task

1. Read this file and relevant docs.
2. Inspect existing code and tests before editing.
3. State a short implementation plan in the task log.
4. Implement the smallest coherent change.
5. Add/update tests.
6. Run relevant checks.
7. Update docs/ADR when behavior or architecture changes.
8. Report changed files, commands run, and remaining limitations.

## 6. Commands

- `pnpm install --frozen-lockfile`
- `pnpm dev`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:integration`
- `pnpm test:e2e`
- `pnpm build`
- `pnpm content:validate`
- `docker compose up --build`

## 7. Definition of done

A change is done only when:

- TypeScript passes in strict mode.
- Lint passes.
- Unit/integration tests pass.
- Critical UI flow has an e2e test when applicable.
- Runtime validation exists at external boundaries.
- Empty/loading/error/insufficient-data states are handled.
- No button is decorative or non-functional.
- Documentation is updated.
- No secrets or personal answer bodies are logged.

## 8. UI rules

- Use SkillForge tokens and components from `packages/ui`.
- Use Lucide icons only.
- Do not add MUI.
- Light theme is the reference default.
- Maintain WCAG 2.2 AA.
- Status is never represented by color alone.
- Dashboard shows one primary recommendation, not a wall of metrics.
- Use Russian UI copy; English is allowed for established technical terms.

## 9. Data and migrations

- Use Prisma Migrate. Never use `db push` in production.
- Migrations must preserve existing answers and evidence.
- Seeds/content imports must be idempotent.
- Destructive operations require explicit confirmation and documented backup.
- Import application is atomic and deduplicated by checksum.
- API-assisted AI writes a preview draft first; only explicit Apply may create ordinary `Evaluation`/`Evidence`, and rollback is compensating rather than destructive.

## 10. Testing focus

Prioritize tests for:

- evidence normalization;
- status gates;
- no fake score before sufficient data;
- import idempotency and validation;
- autosave conflict handling;
- pause/resume persistence;
- code runner timeout;
- prerequisite graph validation;
- container restart persistence.
- AI budget concurrency, cache identity, preview/apply/reject/rollback and nudge leakage guards.

## 11. Prohibited shortcuts

- Hardcoded mock scores in production paths.
- `any` to bypass type design.
- Empty catch blocks.
- Direct status updates from imported AI JSON.
- One giant React context for all server data.
- One giant service/controller/module.
- Duplicate UI frameworks.
- TODO placeholders for required MVP behavior.
- Passing build while skipping typecheck.
