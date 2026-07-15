import { z } from 'zod';

const CoverageSchema = z
  .object({
    evaluatedDimensions: z.array(z.string()),
    pendingDimensions: z.array(z.string()),
    unsupportedDimensions: z.array(z.string()),
    isFinal: z.boolean(),
  })
  .strict();

const EvidenceCandidateSchema = z
  .object({
    topicKey: z.string(),
    kind: z.string(),
    strength: z.number().min(0).max(1),
    explanation: z.string(),
  })
  .strict();

export const AiEvaluationCandidateSchema = z
  .object({
    contract: z.literal('skillforge-ai-attempt-evaluation-v1'),
    attemptId: z.uuid(),
    taskStableKey: z.string(),
    taskVersion: z.number().int().positive(),
    score: z.number().min(0).max(100),
    passed: z.boolean().nullable(),
    reliability: z.number().min(0).max(0.7),
    dimensionScores: z.record(z.string(), z.number().min(0).max(100)),
    correctObservations: z.array(z.string()),
    errors: z.array(z.string()),
    misconceptions: z.array(
      z
        .object({
          key: z.string(),
          description: z.string(),
          confidence: z.number().min(0).max(1),
        })
        .strict(),
    ),
    evidenceCandidates: z.array(EvidenceCandidateSchema),
    coverage: CoverageSchema,
    feedbackMarkdown: z.string(),
    warnings: z.array(z.string()),
  })
  .strict();

const AiDraftSchema = z
  .object({
    id: z.uuid(),
    attemptId: z.uuid(),
    status: z.enum(['PENDING', 'APPLIED', 'REJECTED', 'ROLLED_BACK']),
    createdAt: z.iso.datetime(),
    appliedAt: z.iso.datetime().nullable(),
    rejectedAt: z.iso.datetime().nullable(),
    rolledBackAt: z.iso.datetime().nullable(),
    appliedEvaluationId: z.uuid().nullable(),
    rollbackEvaluationId: z.uuid().nullable(),
  })
  .strict();

const AiInvocationSchema = z
  .object({
    id: z.uuid(),
    status: z.enum(['RESERVED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'REJECTED_BUDGET', 'CACHED']),
    provider: z.string(),
    model: z.string(),
    promptKey: z.string(),
    promptVersion: z.number().int().positive(),
    estimatedCostUsd: z.number().nonnegative(),
    actualCostUsd: z.number().nonnegative().nullable(),
    cacheHit: z.boolean(),
    cacheSourceInvocationId: z.uuid().nullable(),
  })
  .strict();

const ProjectedTopicStateSchema = z
  .object({
    status: z.enum(['UNKNOWN', 'WEAK', 'UNSTABLE', 'SOLID', 'MASTERED']),
    masteryEstimate: z.number().min(0).max(100).nullable(),
    masteryConfidence: z.number().min(0).max(100),
    evidenceCount: z.number().int().nonnegative(),
  })
  .strict();

const AiEvaluationPreviewSchema = z
  .object({
    deterministicEvaluations: z.array(
      z
        .object({
          id: z.uuid(),
          evaluatorType: z.string(),
          evaluatorVersion: z.string(),
          rawScore: z.number().nullable(),
          passed: z.boolean().nullable(),
          reliability: z.number().min(0).max(1),
          dimensionScores: z.record(z.string(), z.number()),
          coverage: CoverageSchema,
        })
        .strict(),
    ),
    candidateEvidence: z.array(EvidenceCandidateSchema),
    projectedChanges: z.array(
      z
        .object({
          topicKey: z.string(),
          current: ProjectedTopicStateSchema.nullable(),
          projected: ProjectedTopicStateSchema.nullable(),
        })
        .strict(),
    ),
    prebaselineSuppressed: z.boolean(),
    cost: z
      .object({
        estimatedUsd: z.number().nonnegative(),
        actualUsd: z.number().nonnegative().nullable(),
        cacheHit: z.boolean(),
      })
      .strict(),
  })
  .strict();

export const AiEvaluationResponseSchema = z
  .object({
    draft: AiDraftSchema,
    invocation: AiInvocationSchema,
    candidate: AiEvaluationCandidateSchema,
    preview: AiEvaluationPreviewSchema,
    actions: z
      .object({
        canApply: z.boolean(),
        canReject: z.boolean(),
        canRollback: z.boolean(),
      })
      .strict(),
  })
  .strict();

export const AiUsageResponseSchema = z
  .object({
    period: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/u),
    mode: z.enum(['manual', 'api-assisted']),
    features: z
      .object({
        attemptEvaluation: z.boolean(),
        contentReview: z.boolean(),
        nudge: z.boolean(),
      })
      .strict(),
    limitUsd: z.number().nonnegative(),
    spentUsd: z.number().nonnegative(),
    reservedUsd: z.number().nonnegative(),
    remainingUsd: z.number().nonnegative(),
    requestCount: z.number().int().nonnegative(),
    cacheHits: z.number().int().nonnegative(),
    failures: z.number().int().nonnegative(),
    averageCostUsd: z.number().nonnegative(),
    appliedDrafts: z.number().int().nonnegative(),
    rejectedDrafts: z.number().int().nonnegative(),
    models: z.array(
      z
        .object({
          provider: z.string(),
          model: z.string(),
          promptKey: z.string(),
          promptVersion: z.number().int().positive(),
          requestCount: z.number().int().nonnegative(),
          costUsd: z.number().nonnegative(),
        })
        .strict(),
    ),
  })
  .strict();

export const AiNudgeResponseSchema = z
  .object({
    attemptId: z.uuid(),
    hintType: z.literal('NUDGE'),
    hint: z.string().min(1).max(500),
    warnings: z.array(z.string()),
    helpLevel: z.literal('NUDGE'),
    cacheHit: z.boolean(),
    invocationId: z.uuid().nullable(),
  })
  .strict();

export type AiEvaluationResponse = z.infer<typeof AiEvaluationResponseSchema>;
export type AiUsageResponse = z.infer<typeof AiUsageResponseSchema>;
export type AiNudgeResponse = z.infer<typeof AiNudgeResponseSchema>;
