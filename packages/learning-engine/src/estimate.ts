import { MASTERY_CONFIG } from './config.js';
import { clamp } from './math.js';
import type { NormalizedEvidence } from './types.js';

export function masteryEstimate(evidence: readonly NormalizedEvidence[]): number {
  const numerator = evidence.reduce<number>(
    (sum, item) => sum + item.weight * item.normalizedScore,
    MASTERY_CONFIG.priorWeight * MASTERY_CONFIG.priorScore,
  );
  const denominator = evidence.reduce<number>(
    (sum, item) => sum + item.weight,
    MASTERY_CONFIG.priorWeight,
  );
  return numerator / denominator;
}

export interface MasteryConfidenceInput {
  totalWeight: number;
  independentDays: number;
  taskKindCount: number;
  hasDelayedEvidence: boolean;
  hasNoHelpSuccess: boolean;
}

export function masteryConfidence(input: MasteryConfidenceInput): number {
  const value =
    MASTERY_CONFIG.confidenceWeightFactor * Math.log1p(input.totalWeight) +
    MASTERY_CONFIG.confidenceIndependentDayFactor * Math.min(input.independentDays, 4) +
    MASTERY_CONFIG.confidenceTaskKindFactor * Math.min(input.taskKindCount, 4) +
    (input.hasDelayedEvidence ? MASTERY_CONFIG.confidenceDelayedBonus : 0) +
    (input.hasNoHelpSuccess ? MASTERY_CONFIG.confidenceNoHelpBonus : 0);
  return clamp(value, 0, 100);
}
