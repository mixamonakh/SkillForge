# SkillForge v2 — примеры контрактов и схем

Все примеры являются proposal. Codex обязан адаптировать их к актуальным package exports и naming conventions.

# 1. Task metadata v2

```ts
export const CapabilityFamilySchema = z.enum([
  'TERM',
  'MECHANISM',
  'TRACE',
  'DEBUG',
  'CODE_PRODUCTION',
  'TRANSFER',
  'CALIBRATION',
]);

export const TaskPedagogyMetadataV2Schema = z
  .object({
    schemaVersion: z.literal('2.0'),
    evidenceFamilies: z.array(CapabilityFamilySchema).min(1),
    cognitiveLevel: z.enum([
      'LEXICON',
      'CANONICAL_MECHANISM',
      'COMPOSITE_MECHANISM',
      'CONSTRAINED_PRODUCTION',
      'TRANSFER_INTERVIEW',
    ]),
    productionLoad: z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH']),
    transferLevel: z.enum(['NONE', 'NEAR', 'WORK_LIKE', 'NOVEL']),
    supportLevel: z.enum([
      'NONE',
      'STARTER_CODE',
      'SCAFFOLDED',
      'WORKED_EXAMPLE',
    ]),
    familyKey: StableMachineKeySchema,
    learningOutcomeKeys: z.array(StableMachineKeySchema).min(1),
    misconceptionTags: z.array(StableMachineKeySchema),
    estimatedMinutes: z.number().int().min(1).max(120),
    documentationUrls: z.array(z.string().url()).min(1),
    mixedEvidence: z.boolean(),
  })
  .strict();
```

# 2. Sample pre-baseline task

```json
{
  "stableKey": "js.references.predict-shared-object-pre-001",
  "version": 1,
  "topicKey": "cs.values-and-references",
  "kind": "PREDICT_OUTPUT",
  "difficulty": "EASY",
  "promptMarkdown": "Что выведет код? Сначала напиши результат, затем коротко объясни, почему изменение видно через обе переменные.\n\n```js\nconst first = { count: 1 };\nconst second = first;\nsecond.count += 1;\nconsole.log(first.count);\n```",
  "rubric": {
    "dimensions": [
      {
        "key": "PREDICT_OUTPUT",
        "weight": 40,
        "criteria": "Указано значение 2"
      },
      {
        "key": "MECHANISM",
        "weight": 60,
        "criteria": "Понимает, что обе переменные обращаются к одному объекту"
      }
    ]
  },
  "acceptanceCriteria": [
    "Не требует слова reference для зачёта механизма",
    "Результат и объяснение оцениваются отдельно"
  ],
  "sources": [
    {
      "title": "MDN JavaScript data structures",
      "url": "https://developer.mozilla.org/"
    }
  ],
  "metadata": {
    "schemaVersion": "2.0",
    "evidenceFamilies": ["TRACE", "MECHANISM"],
    "cognitiveLevel": "CANONICAL_MECHANISM",
    "productionLoad": "NONE",
    "transferLevel": "NONE",
    "supportLevel": "NONE",
    "familyKey": "js.references.shared-object",
    "learningOutcomeKeys": ["js.references.explain-shared-object"],
    "misconceptionTags": ["assignment-copies-object"],
    "estimatedMinutes": 3,
    "documentationUrls": ["https://developer.mozilla.org/"],
    "mixedEvidence": true
  }
}
```

# 3. Evaluation result v2

```ts
export const EvaluationCoverageSchema = z
  .object({
    evaluatedDimensions: z.array(z.string()),
    pendingDimensions: z.array(z.string()),
    unsupportedDimensions: z.array(z.string()),
    isFinal: z.boolean(),
  })
  .strict();

export const EvaluationResultV2Schema = z
  .object({
    evaluatorType: z.string(),
    evaluatorVersion: z.string(),
    score: z.number().min(0).max(100).nullable(),
    passed: z.boolean().nullable(),
    dimensionScores: z.record(z.string(), z.number().min(0).max(100)),
    coverage: EvaluationCoverageSchema,
    feedback: z.array(z.string()),
  })
  .strict();
```

# 4. AI evaluation candidate

```ts
export const AiAttemptEvaluationCandidateSchema = z
  .object({
    contract: z.literal('skillforge-ai-attempt-evaluation-v1'),
    attemptId: z.string().uuid(),
    taskStableKey: StableMachineKeySchema,
    taskVersion: z.number().int().positive(),
    score: z.number().min(0).max(100),
    passed: z.boolean().nullable(),
    reliability: z.number().min(0).max(1).max(0.7),
    dimensionScores: z.record(z.string(), z.number().min(0).max(100)),
    correctObservations: z.array(z.string()),
    errors: z.array(z.string()),
    misconceptions: z.array(
      z
        .object({
          key: StableMachineKeySchema,
          description: z.string().min(1),
          confidence: z.number().min(0).max(1),
        })
        .strict(),
    ),
    evidenceCandidates: z.array(
      z
        .object({
          topicKey: StableMachineKeySchema,
          kind: z.string(),
          strength: z.number().min(0).max(1),
          explanation: z.string(),
        })
        .strict(),
    ),
    coverage: EvaluationCoverageSchema,
    feedbackMarkdown: z.string(),
    warnings: z.array(z.string()),
  })
  .strict();
```

# 5. One nudge contract

```ts
export const AiNudgeCandidateSchema = z
  .object({
    contract: z.literal('skillforge-ai-nudge-v1'),
    attemptId: z.string().uuid(),
    hintType: z.literal('NUDGE'),
    hint: z.string().min(1).max(500),
    revealsSolution: z.literal(false),
    containsCodeSolution: z.literal(false),
    warnings: z.array(z.string()),
  })
  .strict();
```

Domain validation дополнительно проверяет, что hint:

- не содержит expected output;
- не содержит reference solution;
- не повторяет hidden test;
- не содержит слишком большой кодовый блок.

# 6. Routing decision

```ts
export interface AdaptiveRoutingDecision {
  decision:
    | 'NEXT_ITEM'
    | 'STOP_AND_ROUTE'
    | 'PAUSE_RECOMMENDED'
    | 'ASSESSMENT_COMPLETE';
  nextTaskVersionId?: string;
  topicKey?: string;
  primaryGap?: CapabilityFamily;
  recommendedPhase?: LearningPhase;
  reasons: string[];
  scoreBreakdown: Record<string, number>;
  dataSufficiency: 'LOW' | 'ROUTING_SUFFICIENT' | 'DEEP_SUFFICIENT';
}
```

# 7. Recommendation v2

```ts
export interface NextRecommendationV2 {
  topicKey: string;
  capabilityGap: CapabilityFamily;
  learningPhase: LearningPhase;
  loadMode: 'MINIMAL' | 'NORMAL' | 'DEEP' | 'RETURN';
  sequenceKey?: string;
  estimatedMinutes: number;
  title: string;
  reason: string;
  evidenceNeeded: string[];
  scoreBreakdown: {
    gapSeverity: number;
    missingFamily: number;
    prerequisiteUnlock: number;
    targetRelevance: number;
    reviewDue: number;
    diversity: number;
    overloadPenalty: number;
  };
}
```

# 8. Content AI review result

```ts
export const ContentReviewFindingSchema = z
  .object({
    code: z.string(),
    severity: z.enum(['INFO', 'WARNING', 'BLOCKING']),
    fieldPath: z.string().nullable(),
    message: z.string(),
    suggestedAction: z.string(),
  })
  .strict();

export const ContentReviewResultSchema = z
  .object({
    contract: z.literal('skillforge-content-review-v1'),
    stableKey: StableMachineKeySchema,
    version: z.number().int().positive(),
    verdict: z.enum(['PASS', 'NEEDS_HUMAN_REVIEW', 'BLOCK_IMPORT']),
    findings: z.array(ContentReviewFindingSchema),
    checks: z
      .object({
        correctness: z.string(),
        ambiguity: z.string(),
        rubricAlignment: z.string(),
        stageFit: z.string(),
        sourceQuality: z.string(),
        duplicateRisk: z.string(),
        triviaRisk: z.string(),
        solutionLeakage: z.string(),
      })
      .strict(),
  })
  .strict();
```

# 9. Capability calculation sketch

```ts
export function calculateCapabilityState(
  family: CapabilityFamily,
  evidence: NormalizedCapabilityEvidence[],
): CapabilityState {
  const relevant = evidence.filter((item) => item.families.includes(family));

  if (relevant.length === 0) {
    return notTestedCapability(family);
  }

  const pendingReviewCount = relevant.filter((item) => item.pending).length;
  const scored = relevant.filter((item) => !item.pending);

  if (scored.length === 0) {
    return insufficientPendingCapability(family, pendingReviewCount);
  }

  // Existing evidence normalization rules remain authoritative.
  // This projection must not invent stronger evidence than the source contains.
  return aggregateConservatively(family, scored, pendingReviewCount);
}
```

# 10. Adaptive selection sketch

```ts
export function rankCandidateItem(
  candidate: CandidateItem,
  context: AdaptiveContext,
): CandidateScore {
  const gapSeverity = context.gapSeverity[candidate.primaryFamily] ?? 0;
  const missingFamily = context.missingFamilies.has(candidate.primaryFamily)
    ? 20
    : 0;
  const prerequisiteUnlock = calculateUnlock(candidate, context);
  const targetRelevance = candidate.targetRelevance ?? 0;
  const diversity = calculateDiversityBonus(candidate, context.recentItems);
  const redundancy = calculateRedundancyPenalty(candidate, context.evidence);
  const overload = calculateOverloadPenalty(candidate, context.loadHistory);

  return {
    total:
      gapSeverity +
      missingFamily +
      prerequisiteUnlock +
      targetRelevance +
      diversity -
      redundancy -
      overload,
    breakdown: {
      gapSeverity,
      missingFamily,
      prerequisiteUnlock,
      targetRelevance,
      diversity,
      redundancy: -redundancy,
      overload: -overload,
    },
  };
}
```
