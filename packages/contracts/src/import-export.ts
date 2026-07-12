import { z } from 'zod';

import {
  EvidenceKindSchema,
  HelpLevelSchema,
  SessionModeSchema,
  TaskKindSchema,
  TopicStatusSchema,
} from './enums.js';
import {
  assertJsonLimits,
  JsonDocumentError,
  JsonValueSchema,
  parseJsonDocument,
  stringifyJsonDocument,
  type JsonValue,
} from './json.js';

export const CONTRACT_LIMITS = Object.freeze({
  shortText: 500,
  mediumText: 10_000,
  longText: 250_000,
  topics: 2_000,
  attempts: 5_000,
  instructions: 100,
  dimensions: 100,
  misconceptionsPerAttempt: 100,
  topicEvidencePerAttempt: 200,
  recommendations: 500,
  warnings: 500,
});

const ShortTextSchema = z.string().trim().min(1).max(CONTRACT_LIMITS.shortText);
const NullableAnswerSchema = z.string().max(CONTRACT_LIMITS.longText).nullable();
const ScoreSchema = z.number().finite().min(0).max(100);

function addJsonLimitIssue(value: unknown, context: z.RefinementCtx): void {
  try {
    assertJsonLimits(value);
    stringifyJsonDocument(value);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'JSON contract limit exceeded';
    context.addIssue({ code: z.ZodIssueCode.custom, message });
  }
}

function addDuplicateIssues(
  values: readonly string[],
  path: (string | number)[],
  label: string,
  context: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (seen.has(value)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path, index],
        message: `Duplicate ${label}: ${value}`,
      });
    }
    seen.add(value);
  });
}

export const ExportTopicV1Schema = z
  .object({
    key: ShortTextSchema,
    status: TopicStatusSchema,
    masteryEstimate: ScoreSchema.nullable(),
    masteryConfidence: ScoreSchema,
    evidenceCount: z.number().int().nonnegative(),
  })
  .strict();

export const ExportAttemptV1Schema = z
  .object({
    attemptId: z.string().uuid(),
    taskKey: ShortTextSchema,
    taskVersion: z.number().int().positive(),
    topicKey: ShortTextSchema,
    taskKind: TaskKindSchema,
    prompt: z.string().min(1).max(CONTRACT_LIMITS.longText),
    answerText: NullableAnswerSchema,
    answerCode: NullableAnswerSchema,
    selfRating: z.number().int().min(1).max(5).nullable(),
    confidence: z.number().int().min(0).max(100).nullable(),
    helpLevel: HelpLevelSchema,
    deterministicEvaluation: z.record(JsonValueSchema).nullable(),
  })
  .strict();

export const ExportBundleV1 = z
  .object({
    schemaVersion: z.literal('1.0'),
    bundleId: z.string().uuid(),
    generatedAt: z.string().datetime(),
    appVersion: ShortTextSchema,
    bundleType: z.enum(['assessment-run', 'session', 'topic', 'profile', 'pending-review']),
    user: z
      .object({
        displayName: z.string().trim().min(1).max(200),
        targetTrack: ShortTextSchema,
        locale: z.string().trim().min(2).max(35),
      })
      .strict(),
    scope: z.record(JsonValueSchema),
    topics: z.array(ExportTopicV1Schema).max(CONTRACT_LIMITS.topics),
    attempts: z.array(ExportAttemptV1Schema).max(CONTRACT_LIMITS.attempts),
    requestedAnalysis: z
      .object({
        contract: z.literal('skillforge-analysis-v1'),
        language: z.literal('ru'),
        instructions: z
          .array(z.string().min(1).max(CONTRACT_LIMITS.mediumText))
          .max(CONTRACT_LIMITS.instructions),
      })
      .strict(),
  })
  .strict()
  .superRefine((bundle, context) => {
    addDuplicateIssues(
      bundle.topics.map((topic) => topic.key),
      ['topics'],
      'topic key',
      context,
    );
    addDuplicateIssues(
      bundle.attempts.map((attempt) => attempt.attemptId),
      ['attempts'],
      'attempt id',
      context,
    );
    addJsonLimitIssue(bundle, context);
  });

const DimensionScoresSchema = z
  .record(ScoreSchema)
  .refine((dimensions) => Object.keys(dimensions).length <= CONTRACT_LIMITS.dimensions, {
    message: `No more than ${CONTRACT_LIMITS.dimensions} dimension scores are allowed`,
  });

export const ImportedMisconceptionV1Schema = z
  .object({
    key: ShortTextSchema,
    title: ShortTextSchema,
    evidence: z.string().trim().min(1).max(CONTRACT_LIMITS.mediumText),
    remediation: z.string().trim().min(1).max(CONTRACT_LIMITS.mediumText),
  })
  .strict();

export const ImportedTopicEvidenceV1Schema = z
  .object({
    topicKey: ShortTextSchema,
    kind: EvidenceKindSchema,
    score: ScoreSchema,
  })
  .strict();

export const ImportedAttemptEvaluationV1Schema = z
  .object({
    attemptId: z.string().uuid(),
    overallScore: ScoreSchema,
    passed: z.boolean().nullable(),
    reliability: z.number().finite().min(0).max(1).default(0.65),
    dimensions: DimensionScoresSchema,
    feedbackMarkdown: z.string().max(CONTRACT_LIMITS.longText),
    misconceptions: z
      .array(ImportedMisconceptionV1Schema)
      .max(CONTRACT_LIMITS.misconceptionsPerAttempt),
    topicEvidence: z
      .array(ImportedTopicEvidenceV1Schema)
      .max(CONTRACT_LIMITS.topicEvidencePerAttempt),
  })
  .strict();

export const ImportedRecommendationV1Schema = z
  .object({
    topicKey: ShortTextSchema,
    priority: z.number().int().min(1).max(5),
    sessionMode: SessionModeSchema,
    reason: z.string().trim().min(1).max(CONTRACT_LIMITS.mediumText),
  })
  .strict();

export const SkillForgeAnalysisV1 = z
  .object({
    schemaVersion: z.literal('1.0'),
    contract: z.literal('skillforge-analysis-v1'),
    sourceBundleId: z.string().uuid(),
    evaluator: z
      .object({
        kind: z.literal('external-ai'),
        model: ShortTextSchema.optional(),
        analyzedAt: z.string().datetime(),
      })
      .strict(),
    attemptEvaluations: z.array(ImportedAttemptEvaluationV1Schema).max(CONTRACT_LIMITS.attempts),
    recommendations: z.array(ImportedRecommendationV1Schema).max(CONTRACT_LIMITS.recommendations),
    summary: z.string().max(CONTRACT_LIMITS.longText),
    warnings: z
      .array(z.string().max(CONTRACT_LIMITS.mediumText))
      .max(CONTRACT_LIMITS.warnings)
      .default([]),
  })
  .strict()
  .superRefine((analysis, context) => {
    addDuplicateIssues(
      analysis.attemptEvaluations.map((evaluation) => evaluation.attemptId),
      ['attemptEvaluations'],
      'attempt evaluation',
      context,
    );
    addJsonLimitIssue(analysis, context);
  });

export type ExportBundleV1 = z.infer<typeof ExportBundleV1>;
export type ExportTopicV1 = z.infer<typeof ExportTopicV1Schema>;
export type ExportAttemptV1 = z.infer<typeof ExportAttemptV1Schema>;
export type SkillForgeAnalysisV1 = z.infer<typeof SkillForgeAnalysisV1>;
export type ImportedAttemptEvaluationV1 = z.infer<typeof ImportedAttemptEvaluationV1Schema>;
export type ImportedRecommendationV1 = z.infer<typeof ImportedRecommendationV1Schema>;

export class ContractValidationError extends Error {
  public readonly issues: z.ZodIssue[];

  public constructor(contract: string, issues: z.ZodIssue[], options?: ErrorOptions) {
    super(`${contract} validation failed`, options);
    this.name = 'ContractValidationError';
    this.issues = issues;
  }
}

function parseContract<TOutput, TInput>(
  input: string,
  schema: z.ZodType<TOutput, z.ZodTypeDef, TInput>,
  contract: string,
): TOutput {
  let json: JsonValue;
  try {
    json = parseJsonDocument(input);
  } catch (error) {
    if (error instanceof JsonDocumentError) throw error;
    throw new ContractValidationError(contract, [], { cause: error });
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ContractValidationError(contract, parsed.error.issues);
  }
  return parsed.data;
}

export function parseExportBundleV1(input: string): ExportBundleV1 {
  return parseContract(input, ExportBundleV1, 'ExportBundleV1');
}

export function parseSkillForgeAnalysisV1(input: string): SkillForgeAnalysisV1 {
  return parseContract(input, SkillForgeAnalysisV1, 'SkillForgeAnalysisV1');
}

export const SKILLFORGE_ANALYSIS_PROMPT = [
  'Ты выступаешь как строгий senior-инженер и evaluator SkillForge.',
  'Оценивай только по evidence. Не повышай статус из вежливости.',
  'Верни только JSON, соответствующий skillforge-analysis-v1.',
  'Для каждого свободного ответа дай dimension scores, misconceptions,',
  'краткое объяснение и confidence оценки. Не переписывай ответ пользователя.',
].join('\n');

export function createExportBundleMarkdown(bundle: ExportBundleV1): string {
  const validated = ExportBundleV1.parse(bundle);
  return `${SKILLFORGE_ANALYSIS_PROMPT}\n\n\`\`\`json\n${stringifyJsonDocument(validated)}\n\`\`\`\n`;
}
