export const AI_EVALUATION_PROVIDER = Symbol('AI_EVALUATION_PROVIDER');

export interface AiEvaluationProvider {
  readonly mode: 'manual';
  analyzeAttempt(input: unknown): Promise<never>;
}
