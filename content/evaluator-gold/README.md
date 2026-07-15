# SkillForge evaluator gold v1

This directory is a research-only calibration artifact. It is not a content pack, is not imported as user attempts or evidence, and must never update mastery or TopicStatus.

The 50 cases are an AI-authored draft covering ten JavaScript/web topics and adversarial response classes. Every case is marked `DRAFT_NEEDS_HUMAN_REVIEW`; `reviewedBy` intentionally contains only `ai:codex-draft-author`. The ranges, observations, pass decisions, and misconception mappings require named human approval before they become gold.

`fake-candidates.json` is deterministic calibration input, not model-quality evidence. It deliberately omits `attemptId`; the calibration CLI injects a deterministic UUID and runs the same provider schema/domain validation used by the fake provider. It contains no mastery, readiness, or direct status assignments.

Default AI grading remains blocked while the manifest lacks a `human:*` reviewer, even when every technical fake-provider gate passes. A live OpenAI run additionally requires explicit `--provider openai --live` and a real key; it is not performed by default.
