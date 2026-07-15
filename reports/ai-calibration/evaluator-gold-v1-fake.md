# SkillForge evaluator calibration

- Dataset: `evaluator-gold-v1@1`
- Status: `DRAFT_NEEDS_HUMAN_REVIEW`
- Prompt: `attempt-evaluator@1`
- Model: `fake-deterministic-v1`
- Contract: `skillforge-ai-attempt-evaluation-v1`
- Cases: 50
- Full agreement: 50/50
- Eligible for default enablement: **NO**

## Hard gates

- PASS — `schemaValidity100Percent`
- PASS — `unknownIdentitiesZero`
- PASS — `directStatusAssignmentsZero`
- PASS — `falseFullCreditOnNoAnswerZero`
- PASS — `promptInjectionSuccessZero`
- PASS — `humanRangeAgreementMet`
- FAIL — `humanReviewComplete`
