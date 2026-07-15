import {
  EvaluationCoverageSchema,
  EvidenceKindSchema,
  HelpLevelSchema,
  JsonValueSchema,
} from '@skillforge/contracts';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

export const AI_ATTEMPT_EVALUATION_CONTRACT = 'skillforge-ai-attempt-evaluation-v1';
export const AI_NUDGE_CONTRACT = 'skillforge-ai-nudge-v1';
export const CONTENT_REVIEW_CONTRACT = 'skillforge-content-review-v1';

export const StableMachineKeySchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/);

export const RubricDimensionKeySchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[A-Z][A-Z0-9_]*$/);

const BoundedTextSchema = z.string().min(1).max(2_000);
const BoundedTextListSchema = z.array(BoundedTextSchema).max(50);

export const AiMisconceptionCandidateSchema = z
  .object({
    key: StableMachineKeySchema,
    description: BoundedTextSchema,
    confidence: z.number().min(0).max(1),
  })
  .strict();

export const AiEvidenceCandidateSchema = z
  .object({
    topicKey: StableMachineKeySchema,
    kind: EvidenceKindSchema,
    strength: z.number().min(0).max(1),
    explanation: BoundedTextSchema,
  })
  .strict();

export const AiAttemptEvaluationCandidateSchema = z
  .object({
    contract: z.literal(AI_ATTEMPT_EVALUATION_CONTRACT),
    attemptId: z.string().uuid(),
    taskStableKey: StableMachineKeySchema,
    taskVersion: z.number().int().positive(),
    score: z.number().min(0).max(100),
    passed: z.boolean().nullable(),
    reliability: z.number().min(0).max(0.7),
    dimensionScores: z.record(RubricDimensionKeySchema, z.number().min(0).max(100)),
    correctObservations: BoundedTextListSchema,
    errors: BoundedTextListSchema,
    misconceptions: z.array(AiMisconceptionCandidateSchema).max(30),
    evidenceCandidates: z.array(AiEvidenceCandidateSchema).max(30),
    coverage: EvaluationCoverageSchema,
    feedbackMarkdown: z.string().max(10_000),
    warnings: BoundedTextListSchema,
  })
  .strict();

export const AiNudgeCandidateSchema = z
  .object({
    contract: z.literal(AI_NUDGE_CONTRACT),
    attemptId: z.string().uuid(),
    hintType: z.literal('NUDGE'),
    hint: z.string().min(1).max(500),
    revealsSolution: z.literal(false),
    containsCodeSolution: z.literal(false),
    warnings: BoundedTextListSchema,
  })
  .strict();

export const ContentReviewFindingSchema = z
  .object({
    code: z
      .string()
      .min(1)
      .max(120)
      .regex(/^[A-Z][A-Z0-9_]*$/),
    severity: z.enum(['INFO', 'WARNING', 'BLOCKING']),
    fieldPath: z.string().max(500).nullable(),
    message: BoundedTextSchema,
    suggestedAction: BoundedTextSchema,
  })
  .strict();

export const ContentReviewResultSchema = z
  .object({
    contract: z.literal(CONTENT_REVIEW_CONTRACT),
    stableKey: StableMachineKeySchema,
    version: z.number().int().positive(),
    verdict: z.enum(['PASS', 'NEEDS_HUMAN_REVIEW', 'BLOCK_IMPORT']),
    findings: z.array(ContentReviewFindingSchema).max(100),
    checks: z
      .object({
        correctness: BoundedTextSchema,
        ambiguity: BoundedTextSchema,
        rubricAlignment: BoundedTextSchema,
        stageFit: BoundedTextSchema,
        sourceQuality: BoundedTextSchema,
        duplicateRisk: BoundedTextSchema,
        triviaRisk: BoundedTextSchema,
        solutionLeakage: BoundedTextSchema,
      })
      .strict(),
  })
  .strict();

export const EvaluateAttemptInputSchema = z
  .object({
    attemptId: z.string().uuid(),
    task: z
      .object({
        stableKey: StableMachineKeySchema,
        version: z.number().int().positive(),
        checksum: z.string().min(32).max(128),
        topicKey: StableMachineKeySchema,
        promptMarkdown: z.string().min(1).max(100_000),
        rubric: JsonValueSchema,
        expectedAnswer: JsonValueSchema.nullable(),
        acceptanceCriteria: z.array(z.string().max(2_000)).max(100),
        allowedDimensions: z.array(RubricDimensionKeySchema).min(1).max(50),
        allowedMisconceptionKeys: z.array(StableMachineKeySchema).max(100),
        allowedEvidenceKinds: z.array(EvidenceKindSchema).min(1).max(20),
      })
      .strict(),
    answer: z
      .object({
        text: z.string().max(100_000).nullable(),
        code: z.string().max(100_000).nullable(),
        selectedOptionIds: z.array(z.string().max(160)).max(100),
        helpLevel: HelpLevelSchema,
      })
      .strict(),
  })
  .strict();

export const GenerateNudgeInputSchema = z
  .object({
    attemptId: z.string().uuid(),
    taskStableKey: StableMachineKeySchema,
    taskVersion: z.number().int().positive(),
    promptMarkdown: z.string().min(1).max(100_000),
    answerText: z.string().max(100_000).nullable(),
    answerCode: z.string().max(100_000).nullable(),
    forbiddenFragments: z.array(z.string().min(1).max(2_000)).max(100),
  })
  .strict();

export const ReviewContentInputSchema = z
  .object({
    stableKey: StableMachineKeySchema,
    version: z.number().int().positive(),
    content: JsonValueSchema,
    siblingSummaries: z.array(JsonValueSchema).max(100),
  })
  .strict();

export type AiAttemptEvaluationCandidate = z.infer<typeof AiAttemptEvaluationCandidateSchema>;
export type AiNudgeCandidate = z.infer<typeof AiNudgeCandidateSchema>;
export type ContentReviewFinding = z.infer<typeof ContentReviewFindingSchema>;
export type ContentReviewResult = z.infer<typeof ContentReviewResultSchema>;
export type EvaluateAttemptInput = z.infer<typeof EvaluateAttemptInputSchema>;
export type GenerateNudgeInput = z.infer<typeof GenerateNudgeInputSchema>;
export type ReviewContentInput = z.infer<typeof ReviewContentInputSchema>;

function withoutSchemaMeta(generated: Record<string, unknown>): Record<string, unknown> {
  const usable: Record<string, unknown> = { ...generated };
  delete usable.$schema;
  return usable;
}

const OPENAI_WIRE_ONLY_KEYWORDS = new Set([
  'allOf',
  'not',
  'dependentRequired',
  'dependentSchemas',
  'if',
  'then',
  'else',
  // These validation keywords are not accepted by every Structured Outputs model.
  // The Zod schemas above remain the authoritative local validation boundary.
  'minLength',
  'maxLength',
  'pattern',
  'format',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'patternProperties',
  'propertyNames',
  'minItems',
  'maxItems',
  'minProperties',
  'maxProperties',
]);

function openAiWireSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => openAiWireSchema(item));
  if (value === null || typeof value !== 'object') return value;

  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(source)) {
    if (key === '$schema' || OPENAI_WIRE_ONLY_KEYWORDS.has(key)) continue;
    result[key] = openAiWireSchema(nested);
  }
  return result;
}

function generatedOpenAiWireSchema(
  schema: Parameters<typeof zodToJsonSchema>[0],
  name: string,
): Record<string, unknown> {
  return openAiWireSchema(
    withoutSchemaMeta(
      zodToJsonSchema(schema, {
        name,
        target: 'jsonSchema7',
        $refStrategy: 'root',
      }),
    ),
  ) as Record<string, unknown>;
}

function attemptEvaluationDefinition(schema: Record<string, unknown>): Record<string, unknown> {
  const definitions = schema.definitions;
  if (definitions === null || typeof definitions !== 'object' || Array.isArray(definitions)) {
    throw new TypeError('Attempt evaluation JSON Schema definitions are missing');
  }
  const definition = (definitions as Record<string, unknown>).AiAttemptEvaluationCandidate;
  if (definition === null || typeof definition !== 'object' || Array.isArray(definition)) {
    throw new TypeError('Attempt evaluation JSON Schema definition is missing');
  }
  return definition as Record<string, unknown>;
}

export function createAiAttemptEvaluationJsonSchema(
  rawAllowedDimensions: readonly string[],
): Record<string, unknown> {
  const allowedDimensions = z
    .array(RubricDimensionKeySchema)
    .min(1)
    .max(50)
    .parse(rawAllowedDimensions);
  if (new Set(allowedDimensions).size !== allowedDimensions.length) {
    throw new TypeError('Allowed rubric dimensions must be unique');
  }

  const schema = generatedOpenAiWireSchema(
    AiAttemptEvaluationCandidateSchema,
    'AiAttemptEvaluationCandidate',
  );
  const definition = attemptEvaluationDefinition(schema);
  const properties = definition.properties;
  if (properties === null || typeof properties !== 'object' || Array.isArray(properties)) {
    throw new TypeError('Attempt evaluation JSON Schema properties are missing');
  }
  (properties as Record<string, unknown>).dimensionScores = {
    type: 'object',
    properties: Object.fromEntries(
      allowedDimensions.map((dimension) => [
        dimension,
        {
          type: ['number', 'null'],
          description:
            'Numeric score for an evaluated dimension; null for pending or unsupported.',
        },
      ]),
    ),
    required: allowedDimensions,
    additionalProperties: false,
  };
  return schema;
}

export const aiNudgeJsonSchema = generatedOpenAiWireSchema(
  AiNudgeCandidateSchema,
  'AiNudgeCandidate',
);
export const contentReviewJsonSchema = generatedOpenAiWireSchema(
  ContentReviewResultSchema,
  'ContentReviewResult',
);
