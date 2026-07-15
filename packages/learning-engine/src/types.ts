import type {
  Difficulty,
  EvidenceKind,
  EvaluatorType,
  HelpLevel,
  LoadMode,
  SessionMode,
  TaskKind,
  TopicStatus,
} from '@skillforge/contracts';

import type { CAPABILITY_FAMILIES, LEARNING_PHASES } from './config.js';

export type DateInput = Date | string;

export type CapabilityFamily = (typeof CAPABILITY_FAMILIES)[number];
export type LearningPhase = (typeof LEARNING_PHASES)[number];
export type CapabilityCoverage = 'NOT_TESTED' | 'INSUFFICIENT' | 'SUFFICIENT';

export interface CapabilityTaskMetadataInput {
  sourceSchemaVersion: '1.0' | '2.0';
  evidenceFamilies: readonly CapabilityFamily[];
  mixedEvidence: boolean;
}

export interface CapabilityFamilyMappingInput {
  evidenceKind: EvidenceKind;
  families?: readonly CapabilityFamily[];
  taskMetadata?: CapabilityTaskMetadataInput | null;
}

interface CapabilityEvidenceBase extends CapabilityFamilyMappingInput {
  evaluatorType: EvaluatorType;
  evaluatorReliability?: number;
  evidenceTypeWeight?: number;
  helpLevel: HelpLevel;
  occurredAt: DateInput;
  halfLifeDays?: number;
  passed?: boolean | null;
  taskKind?: TaskKind;
}

export interface CapabilityScoredEvidenceInput extends CapabilityEvidenceBase {
  pending?: false;
  rawScore: number;
}

export interface CapabilityPendingEvidenceInput extends CapabilityEvidenceBase {
  pending: true;
  rawScore?: null;
}

export type CapabilityEvidenceInput =
  | CapabilityScoredEvidenceInput
  | CapabilityPendingEvidenceInput;

export interface NormalizedCapabilityEvidence {
  families: CapabilityFamily[];
  pending: boolean;
  normalizedScore: number | null;
  weight: number;
  helpLevel: HelpLevel;
  occurredAt: string;
  evidenceKind: EvidenceKind;
  passed: boolean | null;
  taskKind?: TaskKind;
}

export interface CapabilityState {
  family: CapabilityFamily;
  coverage: CapabilityCoverage;
  estimate: number | null;
  confidence: number;
  evidenceCount: number;
  independentDays: number;
  noHelpSuccessCount: number;
  pendingReviewCount: number;
  lastEvidenceAt: string | null;
  explanation: string[];
}

export interface TopicCapabilityProfile {
  topicKey: string;
  algorithmVersion: string;
  capabilities: Record<CapabilityFamily, CapabilityState>;
}

export interface EvidenceInput {
  rawScore: number;
  evaluatorReliability: number;
  evidenceTypeWeight: number;
  helpLevel: HelpLevel;
  ageDays: number;
  halfLifeDays: number;
}

export interface NormalizedEvidence {
  normalizedScore: number;
  weight: number;
}

export interface TopicEvidenceInput {
  id?: string;
  attemptId?: string;
  rawScore: number;
  evaluatorType: EvaluatorType;
  evaluatorReliability?: number;
  evidenceTypeWeight?: number;
  kind: EvidenceKind;
  helpLevel: HelpLevel;
  occurredAt: DateInput;
  halfLifeDays?: number;
  taskKind?: TaskKind;
  difficulty?: Difficulty;
  passed?: boolean | null;
  submitted?: boolean;
  isBasic?: boolean;
}

export interface TopicStateOptions {
  now?: DateInput;
  overloaded?: boolean;
}

export interface StatusGate {
  code: string;
  met: boolean;
  actual: boolean | number | string;
  required: boolean | number | string;
}

export interface TopicStateExplanation {
  algorithmVersion: string;
  summary: string;
  estimateBeforeSufficiencyGate: number;
  factors: {
    totalReliableWeight: number;
    independentDays: number;
    taskKindCount: number;
    evidenceKindCount: number;
    hasDelayedEvidence: boolean;
    hasNoHelpSuccess: boolean;
    hasTransferEvidence: boolean;
    recentFailureCount: number;
    recentDeterministicBasicFailureCount: number;
    lastEvidenceFailed: boolean;
  };
  statusGates: StatusGate[];
}

export interface ReviewScheduleResult {
  dueAt: string;
  intervalDays: number;
  reason:
    | 'successful-independent-attempt'
    | 'partial-attempt'
    | 'failed-attempt'
    | 'failed-overloaded-attempt';
  algorithmVersion: string;
}

export interface TopicStateResult {
  status: TopicStatus;
  masteryEstimate: number | null;
  masteryConfidence: number;
  evidenceWeight: number;
  evidenceCount: number;
  independentDays: number;
  taskKindCount: number;
  needsReview: boolean;
  lastEvidenceAt: string | null;
  nextReviewAt: string | null;
  algorithmVersion: string;
  explanation: TopicStateExplanation;
  reviewSchedule: ReviewScheduleResult | null;
}

export type ReviewOutcome = 'success' | 'partial' | 'failure';

export interface ReviewScheduleInput {
  status: TopicStatus;
  lastEvidenceAt: DateInput;
  outcome: ReviewOutcome;
  helpLevel: HelpLevel;
  overloaded?: boolean;
}

export interface RequiredReadinessTopic {
  topicKey: string;
  domainKey: string;
  weight: number;
}

export interface ReadinessTopicState {
  topicKey: string;
  status: TopicStatus;
  masteryEstimate: number | null;
}

export interface ReadinessGateDefinition {
  key: string;
  domainKey: string;
  minimumScore: number;
  cap: number;
}

export interface ReadinessTarget {
  key: string;
  version: string;
  minimumCoverage?: number;
  requiredTopics: RequiredReadinessTopic[];
  gates?: ReadinessGateDefinition[];
}

export interface ReadinessDomainResult {
  domainKey: string;
  score: number | null;
  coverage: number;
  assessedTopics: number;
  requiredTopics: number;
}

export interface ReadinessBlockingGate {
  key: string;
  domainKey: string;
  actualScore: number | null;
  minimumScore: number;
  cap: number;
  reason: 'below-threshold' | 'insufficient-domain-data';
}

export interface ReadinessResult {
  algorithmVersion: string;
  targetKey: string;
  targetVersion: string;
  state: 'NOT_CALIBRATED' | 'PARTIALLY_CALIBRATED' | 'CALIBRATED';
  overallScore: number | null;
  coverage: number;
  assessedRequiredTopics: number;
  requiredTopics: number;
  domains: ReadinessDomainResult[];
  strongestDomains: string[];
  blockingGates: ReadinessBlockingGate[];
  disclaimer: 'оценка покрытия компетенций, не вероятность оффера';
}

export interface RecommendationCandidate {
  topicKey: string;
  sessionMode: SessionMode;
  targetWeight: number;
  weaknessScore: number;
  prerequisiteUnlockValue: number;
  reviewDueScore: number;
  repeatedMistakeScore: number;
  criticalPrerequisitesMet: boolean;
  reason: string;
}

export interface RecommendationContext {
  selectedLoadMode?: LoadMode;
  userSelectedMode?: SessionMode;
  loadFeedback?: string | null;
  daysSinceLastSession?: number | null;
  resumeThresholdDays?: number;
}

export interface RecommendationResult {
  algorithmVersion: string;
  topicKey: string;
  sessionMode: SessionMode;
  loadMode: LoadMode;
  priority: number;
  reason: string;
  priorityFactors: Omit<
    RecommendationCandidate,
    'topicKey' | 'sessionMode' | 'criticalPrerequisitesMet' | 'reason'
  >;
}

export interface CalibrationAttempt {
  confidence: number;
  evaluatedScore: number;
}

export interface CalibrationResult {
  state: 'INSUFFICIENT_DATA' | 'CALIBRATED';
  evaluatedAttempts: number;
  minimumAttempts: 5;
  meanAbsoluteGap: number | null;
}
