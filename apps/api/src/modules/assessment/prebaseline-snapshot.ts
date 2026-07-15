import { z } from 'zod';

export const PREBASELINE_BLUEPRINT_KEY = 'js-prebaseline-v1' as const;
export const PREBASELINE_SNAPSHOT_VERSION = '2.0' as const;
export const PREBASELINE_ALGORITHM_VERSION = 'recommendation-v2.0' as const;
export const PREBASELINE_ITEM_CAP = 18;
export const PREBASELINE_TIME_CAP_MINUTES = 35;

const MachineKeySchema = z
  .string()
  .min(3)
  .max(160)
  .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/u);

export const PrebaselineCapabilityFamilySchema = z.enum([
  'TERM',
  'MECHANISM',
  'TRACE',
  'DEBUG',
  'CODE_PRODUCTION',
  'TRANSFER',
  'CALIBRATION',
]);

const LearningPhaseSchema = z.enum([
  'CALIBRATION',
  'ACQUISITION',
  'CONSOLIDATION',
  'TRANSFER',
]);

const AdaptiveDecisionSchema = z
  .object({
    decision: z.enum([
      'NEXT_ITEM',
      'STOP_AND_ROUTE',
      'PAUSE_RECOMMENDED',
      'ASSESSMENT_COMPLETE',
    ]),
    nextTaskVersionId: z.string().min(1).optional(),
    topicKey: MachineKeySchema.optional(),
    primaryGap: PrebaselineCapabilityFamilySchema.optional(),
    recommendedPhase: LearningPhaseSchema.optional(),
    reasons: z.array(z.string().min(1)),
    scoreBreakdown: z.record(z.string(), z.number()),
    dataSufficiency: z.enum(['LOW', 'ROUTING_SUFFICIENT', 'DEEP_SUFFICIENT']),
  })
  .strict();

export type PrebaselineAdaptiveDecision = z.infer<typeof AdaptiveDecisionSchema>;

const CandidateSchema = z
  .object({
    taskVersionId: z.string().min(1),
    taskKey: MachineKeySchema,
    taskVersion: z.number().int().positive(),
    topicKey: MachineKeySchema,
    topicTitle: z.string().min(1),
    prerequisiteTopicKeys: z.array(MachineKeySchema),
    unlocksTopicKeys: z.array(MachineKeySchema),
    blockIndex: z.number().int().nonnegative(),
    position: z.number().int().nonnegative(),
    required: z.boolean(),
    taskKind: z.string().min(1),
    difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
    primaryFamily: PrebaselineCapabilityFamilySchema,
    evidenceFamilies: z.array(PrebaselineCapabilityFamilySchema).min(1),
    familyKey: MachineKeySchema,
    misconceptionTags: z.array(MachineKeySchema),
    estimatedMinutes: z.number().int().positive(),
    productionLoad: z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH']),
    targetRelevance: z.record(MachineKeySchema, z.number()),
  })
  .strict();

export type PrebaselineCandidate = z.infer<typeof CandidateSchema>;

const SelectedHistorySchema = z
  .object({
    sequence: z.number().int().positive(),
    taskVersionId: z.string().min(1),
    sessionItemId: z.string().min(1),
    selectedAt: z.iso.datetime(),
    decision: AdaptiveDecisionSchema,
  })
  .strict();

const DecisionHistorySchema = z
  .object({
    sequence: z.number().int().positive(),
    decidedAt: z.iso.datetime(),
    decision: AdaptiveDecisionSchema,
  })
  .strict();

const TimingSchema = z
  .object({
    startedAt: z.iso.datetime(),
    activeStartedAt: z.iso.datetime().nullable(),
    accumulatedActiveMs: z.number().int().nonnegative(),
  })
  .strict();

export const PrebaselineSnapshotSchema = z
  .object({
    schemaVersion: z.literal(PREBASELINE_SNAPSHOT_VERSION),
    kind: z.literal('ADAPTIVE_PREBASELINE'),
    algorithmVersion: z.literal(PREBASELINE_ALGORITHM_VERSION),
    blueprint: z
      .object({
        key: z.literal(PREBASELINE_BLUEPRINT_KEY),
        version: z.number().int().positive(),
        checksum: z.string().min(1),
        contentStatus: z.enum(['DRAFT', 'ACTIVE']),
        reviewState: z.enum(['NEEDS_HUMAN_REVIEW', 'APPROVED']),
        estimatedMinutes: z.number().int().positive(),
      })
      .strict(),
    hardCaps: z
      .object({
        items: z.literal(PREBASELINE_ITEM_CAP),
        minutes: z.literal(PREBASELINE_TIME_CAP_MINUTES),
      })
      .strict(),
    candidatePool: z.array(CandidateSchema).min(1).max(PREBASELINE_ITEM_CAP),
    selectedHistory: z.array(SelectedHistorySchema),
    decisionHistory: z.array(DecisionHistorySchema),
    timing: TimingSchema,
  })
  .strict();

export type PrebaselineSnapshot = z.infer<typeof PrebaselineSnapshotSchema>;

export function parsePrebaselineSnapshot(value: unknown): PrebaselineSnapshot | null {
  const parsed = PrebaselineSnapshotSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function isPrebaselineSnapshot(value: unknown): boolean {
  return parsePrebaselineSnapshot(value) !== null;
}

export function activeElapsedMilliseconds(
  snapshot: PrebaselineSnapshot,
  now: Date = new Date(),
): number {
  const activeStartedAt = snapshot.timing.activeStartedAt;
  if (activeStartedAt === null) return snapshot.timing.accumulatedActiveMs;
  const activeMs = Math.max(0, now.getTime() - new Date(activeStartedAt).getTime());
  return snapshot.timing.accumulatedActiveMs + activeMs;
}

export function pausePrebaselineSnapshot(
  snapshot: PrebaselineSnapshot,
  pausedAt: Date,
): PrebaselineSnapshot {
  if (snapshot.timing.activeStartedAt === null) return snapshot;
  return {
    ...snapshot,
    timing: {
      ...snapshot.timing,
      accumulatedActiveMs: activeElapsedMilliseconds(snapshot, pausedAt),
      activeStartedAt: null,
    },
  };
}

export function resumePrebaselineSnapshot(
  snapshot: PrebaselineSnapshot,
  resumedAt: Date,
): PrebaselineSnapshot {
  if (snapshot.timing.activeStartedAt !== null) return snapshot;
  return {
    ...snapshot,
    timing: {
      ...snapshot.timing,
      activeStartedAt: resumedAt.toISOString(),
    },
  };
}
