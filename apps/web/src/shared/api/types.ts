import type {
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
    deterministicEvaluation: {
      evaluatorType: 'EXACT_MATCH' | 'TEST_RUNNER';
      evaluatorVersion: string;
      rawScore: number | null;
      passed: boolean | null;
    } | null;
  } | null;
};

export type AssessmentRun = {
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
};

export type LearningSession = SessionSummary & {
  goal: string;
  documentationAllowed: boolean;
  loadFeedback: string | null;
  summary: string | null;
  items: TaskItem[];
};

export type ImportPreview = {
  importId: string;
  sourceBundleId: string;
  matchedAttempts: number;
  unknownAttempts: string[];
  unknownTopics: string[];
  warnings: string[];
  evaluationsToCreate: number;
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
