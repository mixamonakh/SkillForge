import { z } from 'zod';

const stableKeyPattern = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const semverPattern = /^\d+\.\d+\.\d+$/;
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const appSchemaRangePattern = /^>=\d+\.\d+\.\d+ <\d+\.\d+\.\d+$/;

export const StableKeySchema = z
  .string()
  .min(3)
  .max(160)
  .regex(stableKeyPattern, 'Ожидается стабильный English machine key');

export const ContentStatusSchema = z.enum(['draft', 'active', 'archived']);
export const TaskKindSchema = z.enum([
  'SINGLE_CHOICE',
  'MULTIPLE_CHOICE',
  'EXPLAIN',
  'PREDICT_OUTPUT',
  'FIND_BUG',
  'CODE',
  'COMPARE_SOLUTIONS',
  'AI_REVIEW',
  'FLASHCARD',
]);
export const DifficultySchema = z.enum(['EASY', 'MEDIUM', 'HARD']);
export const EvidenceKindSchema = z.enum([
  'RECALL',
  'EXPLANATION',
  'PREDICT_OUTPUT',
  'DEBUGGING',
  'CODE_CORRECTNESS',
  'EDGE_CASES',
  'COMPLEXITY_REASONING',
  'INTERVIEW_RESPONSE',
  'TRANSFER',
  'BATTLE',
  'AI_REVIEW',
  'SELF_REPORT',
]);

const SourceSchema = z
  .object({
    title: z.string().min(1).max(200),
    url: z.url(),
  })
  .strict();

const PackCountsSchema = z
  .object({
    topics: z.number().int().positive(),
    tasks: z.number().int().positive(),
    assessments: z.number().int().positive(),
  })
  .strict();

const PackRequirementsSchema = z
  .object({
    baselineItems: z.number().int().positive(),
    blocks: z.number().int().positive(),
    itemsPerBlock: z.number().int().positive(),
    minimumTaskKinds: z.number().int().positive(),
    minimumDeterministicTasks: z.number().int().nonnegative(),
    minimumExplanationTasks: z.number().int().nonnegative(),
    minimumDebuggingTasks: z.number().int().nonnegative(),
    minimumAiReviewOrCompareTasks: z.number().int().nonnegative(),
    minimumMixedTasks: z.number().int().nonnegative(),
  })
  .strict();

export const ManifestSchema = z
  .object({
    key: StableKeySchema,
    version: z.string().regex(semverPattern, 'Ожидается semver'),
    locale: z.literal('ru'),
    createdAt: z.string().regex(isoDatePattern, 'Ожидается дата YYYY-MM-DD'),
    status: ContentStatusSchema,
    requiresAppSchema: z
      .string()
      .regex(appSchemaRangePattern, 'Ожидается range вида >=1.0.0 <2.0.0'),
    tracks: z.array(StableKeySchema).min(1),
    counts: PackCountsSchema,
    requirements: PackRequirementsSchema,
    sources: z.array(SourceSchema).min(1),
  })
  .strict();

export const TrackSchema = z
  .object({
    key: StableKeySchema,
    title: z.string().min(1).max(160),
    description: z.string().min(1).max(1000),
    position: z.number().int().positive(),
    status: ContentStatusSchema,
  })
  .strict();

const TopicMetadataSchema = z
  .object({
    yandexRelevance: z.number().int().min(1).max(5),
    documentationUrls: z.array(z.url()).min(1),
  })
  .strict();

export const TopicSchema = z
  .object({
    key: StableKeySchema,
    trackKey: StableKeySchema,
    title: z.string().min(1).max(160),
    shortDescription: z.string().min(1).max(500),
    whyImportant: z.string().min(1).max(1500),
    atWork: z.string().min(1).max(1500),
    atInterview: z.string().min(1).max(1500),
    position: z.number().int().positive(),
    defaultHalfLifeDays: z.number().int().min(1).max(365),
    status: ContentStatusSchema,
    prerequisites: z.array(StableKeySchema),
    metadata: TopicMetadataSchema,
  })
  .strict();

export const ContentItemSchema = z
  .object({
    stableKey: StableKeySchema,
    version: z.number().int().positive(),
    topicKey: StableKeySchema,
    kind: z.enum(['THEORY', 'LINK', 'CHECKLIST']),
    title: z.string().min(1).max(200),
    bodyMarkdown: z.string().min(1).max(30_000).optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
    status: ContentStatusSchema,
  })
  .strict();

const TaskOptionSchema = z
  .object({
    id: StableKeySchema,
    text: z.string().min(1).max(1000),
  })
  .strict();

const RubricSchema = z
  .object({
    dimensions: z.partialRecord(EvidenceKindSchema, z.number().min(0).max(100)),
  })
  .strict()
  .superRefine((rubric, context) => {
    const total = Object.values(rubric.dimensions).reduce((sum, weight) => sum + weight, 0);
    if (Math.abs(total - 100) > Number.EPSILON) {
      context.addIssue({
        code: 'custom',
        message: `Сумма весов rubric должна быть 100, получено ${String(total)}`,
      });
    }
  });

const TaskMetadataSchema = z
  .object({
    yandexRelevance: z.number().int().min(1).max(5),
    estimatedMinutes: z.number().int().min(1).max(120),
    mixedEvidence: z.boolean(),
    documentationUrls: z.array(z.url()).min(1),
  })
  .strict();

export const TaskTestCaseSchema = z
  .object({
    name: z.string().min(1).max(200),
    input: z.unknown().optional(),
    expected: z.unknown().optional(),
    testCode: z.string().min(1).max(20_000),
    hidden: z.boolean(),
    position: z.number().int().positive(),
  })
  .strict();

export const TaskSchema = z
  .object({
    stableKey: StableKeySchema,
    version: z.number().int().positive(),
    topicKey: StableKeySchema,
    kind: TaskKindSchema,
    difficulty: DifficultySchema,
    status: ContentStatusSchema,
    promptMarkdown: z.string().min(1).max(20_000),
    starterCode: z.string().max(50_000).optional(),
    language: z.enum(['javascript', 'typescript']).optional(),
    options: z.array(TaskOptionSchema).min(2).max(10).optional(),
    expectedAnswer: z.record(z.string(), z.unknown()).optional(),
    rubric: RubricSchema,
    hints: z.array(z.string().min(1).max(1000)).max(5),
    acceptanceCriteria: z.array(z.string().min(1).max(1000)).min(1).max(12),
    testCases: z.array(TaskTestCaseSchema).max(30),
    metadata: TaskMetadataSchema,
  })
  .strict();

const BlueprintSelectionRulesSchema = z
  .object({
    itemsPerBlock: z.number().int().positive(),
    minimumItemsPerTopic: z.number().int().positive(),
    noHints: z.literal(true),
    snapshotTaskVersions: z.literal(true),
    blockLabels: z.array(z.string().min(1).max(160)).min(1),
  })
  .strict();

export const AssessmentBlueprintItemSchema = z
  .object({
    taskKey: StableKeySchema,
    taskVersion: z.number().int().positive(),
    blockIndex: z.number().int().nonnegative(),
    position: z.number().int().nonnegative(),
    required: z.boolean(),
    dimensionWeights: z.partialRecord(EvidenceKindSchema, z.number().min(0).max(100)).optional(),
  })
  .strict();

export const AssessmentBlueprintSchema = z
  .object({
    key: StableKeySchema,
    version: z.number().int().positive(),
    title: z.string().min(1).max(200),
    description: z.string().min(1).max(2000),
    totalBlocks: z.number().int().positive(),
    estimatedMin: z.number().int().positive(),
    status: ContentStatusSchema,
    selectionRules: BlueprintSelectionRulesSchema,
    items: z.array(AssessmentBlueprintItemSchema).min(1),
  })
  .strict();

export type ContentManifest = z.infer<typeof ManifestSchema>;
export type ContentTrack = z.infer<typeof TrackSchema>;
export type ContentTopic = z.infer<typeof TopicSchema>;
export type ContentItem = z.infer<typeof ContentItemSchema>;
export type ContentTask = z.infer<typeof TaskSchema>;
export type AssessmentBlueprint = z.infer<typeof AssessmentBlueprintSchema>;
export type TaskKind = z.infer<typeof TaskKindSchema>;
