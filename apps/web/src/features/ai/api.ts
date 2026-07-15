import { apiFetch, apiMutation } from '@/shared/api/client';

import {
  AiEvaluationResponseSchema,
  AiNudgeResponseSchema,
  AiUsageResponseSchema,
  type AiEvaluationResponse,
  type AiNudgeResponse,
  type AiUsageResponse,
} from './contracts';

export async function fetchAiUsage(): Promise<AiUsageResponse> {
  return AiUsageResponseSchema.parse(await apiFetch<unknown>('/api/v1/ai/usage/current'));
}

export async function fetchAiEvaluation(draftId: string): Promise<AiEvaluationResponse> {
  return AiEvaluationResponseSchema.parse(
    await apiFetch<unknown>(`/api/v1/ai/evaluations/${encodeURIComponent(draftId)}`),
  );
}

export async function requestAiEvaluation(attemptId: string): Promise<AiEvaluationResponse> {
  return AiEvaluationResponseSchema.parse(
    await apiMutation(`/api/v1/ai/attempts/${encodeURIComponent(attemptId)}/evaluate`, 'POST'),
  );
}

export async function transitionAiEvaluation(
  draftId: string,
  action: 'apply' | 'reject' | 'rollback',
): Promise<AiEvaluationResponse> {
  return AiEvaluationResponseSchema.parse(
    await apiMutation(`/api/v1/ai/evaluations/${encodeURIComponent(draftId)}/${action}`, 'POST'),
  );
}

export async function requestAiNudge(attemptId: string): Promise<AiNudgeResponse> {
  return AiNudgeResponseSchema.parse(
    await apiMutation(`/api/v1/ai/attempts/${encodeURIComponent(attemptId)}/nudge`, 'POST'),
  );
}
