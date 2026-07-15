import type {
  EvaluationCoverage,
  EvaluationResultV2,
  RunStatus as ContractRunStatus,
  RunnerResponse,
  TaskKind as ContractTaskKind,
  TopicStatus as ContractTopicStatus,
} from '@skillforge/contracts';

export type RunStatus = ContractRunStatus;
export type TaskKind = ContractTaskKind;
type TopicStatus = ContractTopicStatus;

export type DataSufficiency = {
  sufficient: boolean;
  coverage: number;
  reason: string;
};

export type TopicSummary = {
  key: string;
  title: string;
  shortDescription: string;
  trackKey: string;
  trackTitle: string;
  status: TopicStatus;
  masteryEstimate: number | null;
  masteryConfidence: number;
  evidenceCount: number;
  needsReview: boolean;
  nextReviewAt: string | null;
  targetRelevance: number;
  prerequisites: Array<{ key: string; title: string }>;
};

export type CapabilityFamily =
  | 'TERM'
  | 'MECHANISM'
  | 'TRACE'
  | 'DEBUG'
  | 'CODE_PRODUCTION'
  | 'TRANSFER'
  | 'CALIBRATION';

export type CapabilityCoverage = 'NOT_TESTED' | 'INSUFFICIENT' | 'SUFFICIENT';

export type LearningPhase = 'CALIBRATION' | 'ACQUISITION' | 'CONSOLIDATION' | 'TRANSFER';

export type SessionMode = 'TRAINING' | 'REVIEW' | 'INTERVIEW' | 'RETURN' | 'BATTLE';
export type LoadMode = 'MINIMAL' | 'NORMAL' | 'DEEP' | 'RETURN';

export type RecommendationScoreBreakdown = {
  gapSeverity: number;
  missingFamily: number;
  prerequisiteUnlock: number;
  targetRelevance: number;
  reviewDue: number;
  diversity: number;
  redundancyPenalty: number;
  overloadPenalty: number;
  recentExposurePenalty: number;
};

export type LearningSequenceSummary = {
  key: string;
  version: number;
  phase?: Exclude<LearningPhase, 'CALIBRATION'>;
  estimatedMinutes?: number;
  completionRule?: { requiredSteps: number; minimumNoHelpSuccesses: number };
};

export type SessionRecommendation = {
  topic: TopicSummary | null;
  title?: string;
  mode: SessionMode;
  loadMode: LoadMode;
  reason: string;
  algorithmVersion?: string;
  topicKey?: string;
  capabilityGap?: CapabilityFamily;
  learningPhase?: Exclude<LearningPhase, 'CALIBRATION'>;
  recommendedFamilyKey?: string;
  sequenceKey?: string;
  estimatedMinutes?: number;
  evidenceNeeded?: string[];
  completionTarget?: string;
  scoreBreakdown?: RecommendationScoreBreakdown;
};

export type CapabilityState = {
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
};

export type TopicCapabilityProfile = {
  topicKey: string;
  algorithmVersion: string;
  capabilities: Record<CapabilityFamily, CapabilityState>;
};

export type DashboardData = {
  calibrated: boolean;
  dataSufficiency: DataSufficiency;
  activeAssessment: { id: string; status: RunStatus; answered: number; total: number } | null;
  recommendation: { title: string; reason: string; href: string; action: string } | null;
  coverage: { assessed: number; total: number };
  priorityTopic: Pick<TopicSummary, 'key' | 'title' | 'status'> | null;
  dueReviews: Array<Pick<TopicSummary, 'key' | 'title' | 'status'>>;
  lastSession: { id: string; title: string; lastStepLabel: string | null; at: string } | null;
  lastImport: { id: string; appliedAt: string | null; summary: string } | null;
  resume: { sessionId: string; topic: string; step: string | null; pausedDays: number } | null;
};

export type AssessmentCatalogItem = {
  key: string;
  version: number;
  title: string;
  description: string;
  totalBlocks: number;
  totalItems: number;
  estimatedMin: number;
  taskKinds: TaskKind[];
  flow?: 'FIXED_ASSESSMENT' | 'ADAPTIVE_PREBASELINE';
  contentStatus?: 'DRAFT' | 'ACTIVE';
  reviewState?: 'NEEDS_HUMAN_REVIEW' | 'APPROVED';
  activeRun: { id: string; status: RunStatus; answered: number } | null;
  latestCompletedRun: { id: string; status: 'COMPLETED'; answered: number } | null;
  completedRuns: number;
};

export type TaskItem = {
  id: string;
  position: number;
  blockIndex: number;
  purpose: string;
  task: {
    stableKey: string;
    version: number;
    topicKey: string;
    topicTitle: string;
    kind: TaskKind;
    promptMarkdown: string;
    starterCode: string | null;
    language: string | null;
    options: Array<{ id: string; label: string }>;
    hints: string[];
    visibleTests: Array<{ name: string }>;
    runnerHarness: string | null;
  };
  attempt: {
    id: string;
    revision: number;
    answerText: string | null;
    answerCode: string | null;
    selectedOptions: string[];
    selfRating: number | null;
    confidence: number | null;
    helpLevel: string;
    hintsUsed: string[];
    submittedAt: string | null;
    runnerOutput: RunnerResult | null;
    evaluationCoverage: EvaluationCoverage | null;
    deterministicEvaluation: EvaluationResultV2 | null;
  } | null;
};

export type AssessmentRun = {
  flow?: 'FIXED_ASSESSMENT';
  id: string;
  status: RunStatus;
  currentBlock: number;
  currentPosition: number;
  totalBlocks: number;
  totalItems: number;
  answeredCount: number;
  pendingReviewCount: number;
  sessionId: string;
  title: string;
  items: TaskItem[];
};

export type AdaptiveDecisionKind =
  | 'NEXT_ITEM'
  | 'STOP_AND_ROUTE'
  | 'PAUSE_RECOMMENDED'
  | 'ASSESSMENT_COMPLETE';

export type AdaptiveDataSufficiency = 'LOW' | 'ROUTING_SUFFICIENT' | 'DEEP_SUFFICIENT';

export type RoutingProfile = {
  assessmentRunId: string;
  sufficientForRouting: boolean;
  topicRoutes: Array<{
    topicKey: string;
    recommendedPhase: 'ACQUISITION' | 'CONSOLIDATION' | 'TRANSFER' | 'DEEP_DIAGNOSTIC';
    primaryGap: CapabilityFamily;
    observations: Partial<Record<CapabilityFamily, CapabilityCoverage>>;
    reasons: string[];
  }>;
};

export type AdaptiveAssessmentRun = {
  flow: 'ADAPTIVE_PREBASELINE';
  id: string;
  status: RunStatus;
  currentBlock: number;
  currentPosition: number;
  totalBlocks: number;
  totalItems: number;
  selectedCount: number;
  answeredCount: number;
  pendingReviewCount: number;
  sessionId: string;
  title: string;
  contentStatus: 'DRAFT' | 'ACTIVE';
  reviewState: 'NEEDS_HUMAN_REVIEW' | 'APPROVED';
  stopDecision: {
    decision: Exclude<AdaptiveDecisionKind, 'NEXT_ITEM'>;
    reasons: string[];
    explanation: string;
    dataSufficiency: AdaptiveDataSufficiency;
    primaryGap: CapabilityFamily | null;
    recommendedPhase: LearningPhase | null;
  } | null;
  items: TaskItem[];
};

export type PrebaselineNextResponse = {
  flow: 'ADAPTIVE_PREBASELINE';
  runId: string;
  sessionId: string;
  status: Extract<RunStatus, 'ACTIVE' | 'PAUSED' | 'COMPLETED'>;
  title: string;
  blueprint: {
    key: 'js-prebaseline-v1';
    version: number;
    contentStatus: 'DRAFT' | 'ACTIVE';
    reviewState: 'NEEDS_HUMAN_REVIEW' | 'APPROVED';
  };
  progress: {
    selected: number;
    answered: number;
    pendingReview: number;
    totalCandidates: number;
    elapsedMinutes: number;
    hardCaps: { items: number; minutes: number };
  };
  decision: AdaptiveDecisionKind;
  item: TaskItem | null;
  cluster: { topicKey: string; title: string } | null;
  reasons: string[];
  explanation: string;
  scoreBreakdown: RecommendationScoreBreakdown | Record<string, number>;
  dataSufficiency: AdaptiveDataSufficiency;
  primaryGap: CapabilityFamily | null;
  recommendedPhase: LearningPhase | null;
  routingProfile: RoutingProfile | null;
};

export type RunnerResult = RunnerResponse;

export type SessionSummary = {
  id: string;
  title: string;
  mode: string;
  loadMode: string;
  status: RunStatus;
  lastStepLabel: string | null;
  startedAt: string | null;
  completedAt: string | null;
  itemCount: number;
  stepCount?: number;
  learningPhase?: LearningPhase;
  sequence?: LearningSequenceSummary | null;
};

export type SessionContentSnapshot = {
  schemaVersion: string;
  stableKey: string;
  version: number;
  checksum: string;
  kind: string;
  title: string;
  bodyMarkdown: string | null;
  payload: unknown;
};

export type SessionContentStep = {
  kind: 'CONTENT';
  id: string;
  position: number;
  required: boolean;
  completedAt: string | null;
  content: SessionContentSnapshot;
};

export type SessionTaskStep = {
  kind: 'TASK';
  id: string;
  position: number;
  required: boolean;
  taskItem: TaskItem;
};

export type LearningSessionStep = SessionContentStep | SessionTaskStep;

export type LearningSession = SessionSummary & {
  goal: string;
  documentationAllowed: boolean;
  loadFeedback: string | null;
  summary: string | null;
  items: TaskItem[];
  steps?: LearningSessionStep[];
};

export type ImportPreview = {
  importId: string;
  sourceBundleId: string;
  matchedAttempts: number;
  unknownAttempts: string[];
  unknownTopics: string[];
  warnings: string[];
  evaluationsToCreate: number;
  evidenceToCreate?: number;
  suppressedEvaluationEffects?: Array<{
    attemptId: string;
    reason: 'PREBASELINE_ROUTING_ONLY';
    evaluationAction: 'CREATE_AUDIT_RECORD';
    evidenceAction: 'SUPPRESSED';
    topicStateAction: 'NO_MUTATION';
    masteryAction: 'NO_MUTATION';
    requestedEvidenceItems: number;
  }>;
  projectedTopics: Array<{
    topicKey: string;
    title: string;
    currentStatus: TopicStatus;
    projectedStatus: TopicStatus;
    currentEstimate: number | null;
    projectedEstimate: number | null;
  }>;
  recommendations: Array<{ topicKey: string; priority: number; reason: string }>;
};

export type ApiErrorPayload = {
  error: { code: string; message: string; requestId?: string; details?: unknown };
};
