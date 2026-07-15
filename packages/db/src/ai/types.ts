import type {
  AiBudgetPeriod,
  AiEvaluationDraft,
  AiInvocation,
  AiPromptVersion,
  Prisma,
} from '../../generated/client/client.js';
import type { AiFeature } from '../../generated/client/enums.js';

export type AiMoneyInput = Prisma.Decimal | number | string;

export type AiRepositoryOptions = {
  databaseSchema?: string;
};

export type RegisterAiPromptVersionInput = {
  id?: string;
  key: string;
  version: number;
  feature: AiFeature;
  systemPrompt: string;
  schemaVersion: string;
  checksum: string;
  active?: boolean;
};

export type RegisterAiPromptVersionResult = {
  promptVersion: AiPromptVersion;
  created: boolean;
};

export type ReserveAiInvocationInput = {
  id?: string;
  userId: string;
  period: string;
  limitUsd: AiMoneyInput;
  feature: AiFeature;
  provider: string;
  model: string;
  promptVersionId: string;
  inputHash: string;
  cacheKey: string;
  estimatedCostUsd: AiMoneyInput;
  relatedAttemptId?: string;
  relatedTaskVersionId?: string;
};

export type ReserveAiInvocationOutcome =
  | 'RESERVED'
  | 'IN_PROGRESS'
  | 'CACHE_HIT'
  | 'REJECTED_BUDGET'
  | 'ALREADY_FINALIZED';

export type ReserveAiInvocationResult = {
  outcome: ReserveAiInvocationOutcome;
  invocation: AiInvocation;
  budgetPeriod: AiBudgetPeriod;
  sourceInvocation?: AiInvocation;
  sourceDraft?: AiEvaluationDraft;
  draft?: AiEvaluationDraft;
};

export type ReconcileAiInvocationInput = {
  invocationId: string;
  actualCostUsd: AiMoneyInput;
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
};

export type AiInvocationTransitionResult = {
  invocation: AiInvocation;
  budgetPeriod: AiBudgetPeriod;
  changed: boolean;
};

export type CreateAiEvaluationDraftInput = {
  id?: string;
  invocationId: string;
  attemptId: string;
  normalizedJson: Prisma.InputJsonValue;
  preview?: Prisma.InputJsonValue;
};

export type AiEvaluationDraftTransitionResult = {
  draft: AiEvaluationDraft;
  changed: boolean;
};

export type CachedAiEvaluation = {
  sourceInvocation: AiInvocation;
  draft: AiEvaluationDraft;
};

export type AiPersistenceErrorCode =
  | 'AI_BUDGET_INVARIANT'
  | 'AI_INPUT_INVALID'
  | 'AI_INVOCATION_CONFLICT'
  | 'AI_INVALID_TRANSITION'
  | 'AI_PROMPT_VERSION_CONFLICT'
  | 'AI_RECONCILE_EXCEEDS_RESERVATION';

export class AiPersistenceError extends Error {
  readonly code: AiPersistenceErrorCode;

  constructor(code: AiPersistenceErrorCode, message: string) {
    super(message);
    this.name = 'AiPersistenceError';
    this.code = code;
  }
}
