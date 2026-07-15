import { CAPABILITY_FAMILIES, LEARNING_PHASES, RECOMMENDATION_V2_CONFIG } from './config.js';
import {
  calculateRecommendationV2Score,
  type AdaptiveLoadFeedback,
  type RecommendationV2Score,
  type RecommendationV2ScoreBreakdown,
  type RecommendationV2ScoreFactors,
} from './recommendation-v2.js';
import type { CapabilityFamily, LearningPhase } from './types.js';

export type AdaptiveRoutingDecisionKind =
  | 'NEXT_ITEM'
  | 'STOP_AND_ROUTE'
  | 'PAUSE_RECOMMENDED'
  | 'ASSESSMENT_COMPLETE';

export type AdaptiveDataSufficiency = 'LOW' | 'ROUTING_SUFFICIENT' | 'DEEP_SUFFICIENT';
export type AdaptivePauseSignal = 'NONE' | 'OVERLOAD' | 'USER_LOAD';

export interface AdaptiveCandidateItem extends RecommendationV2ScoreFactors {
  taskVersionId: string;
  taskKey: string;
  topicKey: string;
  primaryFamily: CapabilityFamily;
  recommendedPhase: LearningPhase;
  criticalPrerequisitesMet: boolean;
}

export interface AdaptiveCandidateScore {
  taskVersionId: string;
  taskKey: string;
  total: number;
  breakdown: RecommendationV2ScoreBreakdown;
}

export interface AdaptiveStopContext {
  topicKey?: string;
  primaryGap?: CapabilityFamily;
  recommendedPhase?: LearningPhase;
  dataSufficiency: AdaptiveDataSufficiency;
  consistentIndependentSignalCount: number;
  consecutiveSameMisconceptionErrors: number;
  adjacentNoAnswerLevelCount: number;
  nextItemCanChangeRoute: boolean;
  itemsSeen: number;
  itemCap: number | null;
  elapsedMinutes: number;
  timeCapMinutes: number | null;
  pauseSignal: AdaptivePauseSignal;
  assessmentComplete: boolean;
}

export interface AdaptiveRoutingInput {
  candidates: readonly AdaptiveCandidateItem[];
  loadFeedback: AdaptiveLoadFeedback;
  stop: AdaptiveStopContext;
}

export interface AdaptiveStopEvaluation {
  shouldStop: boolean;
  reasons: string[];
}

export interface AdaptiveRoutingDecision {
  decision: AdaptiveRoutingDecisionKind;
  nextTaskVersionId?: string;
  topicKey?: string;
  primaryGap?: CapabilityFamily;
  recommendedPhase?: LearningPhase;
  reasons: string[];
  scoreBreakdown: Record<string, number>;
  dataSufficiency: AdaptiveDataSufficiency;
}

const MACHINE_KEY_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const DATA_SUFFICIENCY_VALUES: readonly AdaptiveDataSufficiency[] = [
  'LOW',
  'ROUTING_SUFFICIENT',
  'DEEP_SUFFICIENT',
];
const PAUSE_SIGNALS: readonly AdaptivePauseSignal[] = ['NONE', 'OVERLOAD', 'USER_LOAD'];

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer`);
  }
}

function assertNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a finite non-negative number`);
  }
}

function validateCandidate(candidate: AdaptiveCandidateItem): void {
  if (candidate.taskVersionId.trim().length === 0) {
    throw new RangeError('taskVersionId must not be empty');
  }
  if (!MACHINE_KEY_PATTERN.test(candidate.taskKey)) {
    throw new RangeError('taskKey must be a stable English machine key');
  }
  if (!MACHINE_KEY_PATTERN.test(candidate.topicKey)) {
    throw new RangeError('topicKey must be a stable English machine key');
  }
  if (!CAPABILITY_FAMILIES.includes(candidate.primaryFamily)) {
    throw new RangeError('primaryFamily must be a known capability family');
  }
  if (!LEARNING_PHASES.includes(candidate.recommendedPhase)) {
    throw new RangeError('recommendedPhase must be a known learning phase');
  }
}

function validateStopContext(context: AdaptiveStopContext): void {
  if (!DATA_SUFFICIENCY_VALUES.includes(context.dataSufficiency)) {
    throw new RangeError('dataSufficiency is not supported');
  }
  if (!PAUSE_SIGNALS.includes(context.pauseSignal)) {
    throw new RangeError('pauseSignal is not supported');
  }
  assertNonNegativeInteger(
    context.consistentIndependentSignalCount,
    'consistentIndependentSignalCount',
  );
  assertNonNegativeInteger(
    context.consecutiveSameMisconceptionErrors,
    'consecutiveSameMisconceptionErrors',
  );
  assertNonNegativeInteger(context.adjacentNoAnswerLevelCount, 'adjacentNoAnswerLevelCount');
  assertNonNegativeInteger(context.itemsSeen, 'itemsSeen');
  assertNonNegative(context.elapsedMinutes, 'elapsedMinutes');
  if (context.itemCap !== null) {
    if (!Number.isSafeInteger(context.itemCap) || context.itemCap <= 0) {
      throw new RangeError('itemCap must be a positive integer or null');
    }
  }
  if (context.timeCapMinutes !== null) {
    if (!Number.isFinite(context.timeCapMinutes) || context.timeCapMinutes <= 0) {
      throw new RangeError('timeCapMinutes must be a positive number or null');
    }
  }
  if (context.topicKey !== undefined && !MACHINE_KEY_PATTERN.test(context.topicKey)) {
    throw new RangeError('topicKey must be a stable English machine key');
  }
  if (context.primaryGap !== undefined && !CAPABILITY_FAMILIES.includes(context.primaryGap)) {
    throw new RangeError('primaryGap must be a known capability family');
  }
  if (
    context.recommendedPhase !== undefined &&
    !LEARNING_PHASES.includes(context.recommendedPhase)
  ) {
    throw new RangeError('recommendedPhase must be a known learning phase');
  }
}

export function rankCandidateItem(
  candidate: AdaptiveCandidateItem,
  context: { loadFeedback: AdaptiveLoadFeedback },
): AdaptiveCandidateScore {
  validateCandidate(candidate);
  const score: RecommendationV2Score = calculateRecommendationV2Score(candidate, context);
  return {
    taskVersionId: candidate.taskVersionId,
    taskKey: candidate.taskKey,
    total: score.total,
    breakdown: score.breakdown,
  };
}

export function evaluateAdaptiveStopRules(context: AdaptiveStopContext): AdaptiveStopEvaluation {
  validateStopContext(context);
  const reasons: string[] = [];
  if (
    context.consistentIndependentSignalCount >=
    RECOMMENDATION_V2_CONFIG.consistentIndependentSignalsToStop
  ) {
    reasons.push('Получены два согласованных независимых сигнала по capability family.');
  }
  if (context.dataSufficiency !== 'LOW') {
    reasons.push('Coverage уже достаточно для выбора следующего маршрута.');
  }
  if (
    context.consecutiveSameMisconceptionErrors >=
    RECOMMENDATION_V2_CONFIG.repeatedMisconceptionErrorsToStop
  ) {
    reasons.push('Повторные ошибки локализовали один базовый misconception.');
  }
  if (context.adjacentNoAnswerLevelCount >= RECOMMENDATION_V2_CONFIG.adjacentNoAnswerLevelsToStop) {
    reasons.push('Несколько соседних уровней отмечены ответом «Не знаю».');
  }
  if (!context.nextItemCanChangeRoute) {
    reasons.push('Следующий item не изменит рекомендуемый маршрут.');
  }
  if (context.itemCap !== null && context.itemsSeen >= context.itemCap) {
    reasons.push('Достигнут безопасный лимит заданий диагностики.');
  }
  if (context.timeCapMinutes !== null && context.elapsedMinutes >= context.timeCapMinutes) {
    reasons.push('Достигнут безопасный лимит времени диагностики.');
  }
  return { shouldStop: reasons.length > 0, reasons };
}

function routeFields(
  context: AdaptiveStopContext,
): Pick<AdaptiveRoutingDecision, 'topicKey' | 'primaryGap' | 'recommendedPhase'> {
  return {
    ...(context.topicKey === undefined ? {} : { topicKey: context.topicKey }),
    ...(context.primaryGap === undefined ? {} : { primaryGap: context.primaryGap }),
    ...(context.recommendedPhase === undefined
      ? {}
      : { recommendedPhase: context.recommendedPhase }),
  };
}

export function selectAdaptiveRoutingDecision(
  input: AdaptiveRoutingInput,
): AdaptiveRoutingDecision {
  validateStopContext(input.stop);
  const candidateScores = input.candidates.map((candidate) => ({
    candidate,
    score: rankCandidateItem(candidate, input),
  }));

  if (input.stop.assessmentComplete) {
    return {
      decision: 'ASSESSMENT_COMPLETE',
      reasons: ['Все запланированные assessment branches завершены.'],
      scoreBreakdown: {},
      dataSufficiency: input.stop.dataSufficiency,
      ...routeFields(input.stop),
    };
  }

  if (input.stop.pauseSignal !== 'NONE') {
    return {
      decision: 'PAUSE_RECOMMENDED',
      reasons: [
        input.stop.pauseSignal === 'OVERLOAD'
          ? 'Зафиксирован overload; полезнее сделать паузу.'
          : 'Пользователь выбрал снизить текущую учебную нагрузку.',
      ],
      scoreBreakdown: {},
      dataSufficiency: input.stop.dataSufficiency,
      ...routeFields(input.stop),
    };
  }

  const stop = evaluateAdaptiveStopRules(input.stop);
  if (stop.shouldStop) {
    return {
      decision: 'STOP_AND_ROUTE',
      reasons: stop.reasons,
      scoreBreakdown: {},
      dataSufficiency: input.stop.dataSufficiency,
      ...routeFields(input.stop),
    };
  }

  const ranked = candidateScores
    .filter(({ candidate }) => candidate.criticalPrerequisitesMet)
    .sort(
      (left, right) =>
        right.score.total - left.score.total ||
        left.candidate.taskKey.localeCompare(right.candidate.taskKey),
    );
  const next = ranked[0];
  if (next === undefined) {
    return {
      decision: 'STOP_AND_ROUTE',
      reasons: ['Нет prerequisite-safe item, способного добавить информацию к маршруту.'],
      scoreBreakdown: {},
      dataSufficiency: input.stop.dataSufficiency,
      ...routeFields(input.stop),
    };
  }

  return {
    decision: 'NEXT_ITEM',
    nextTaskVersionId: next.candidate.taskVersionId,
    topicKey: next.candidate.topicKey,
    primaryGap: next.candidate.primaryFamily,
    recommendedPhase: next.candidate.recommendedPhase,
    reasons: ['Выбран prerequisite-safe item с наибольшей ожидаемой информационной ценностью.'],
    scoreBreakdown: { ...next.score.breakdown },
    dataSufficiency: input.stop.dataSufficiency,
  };
}
