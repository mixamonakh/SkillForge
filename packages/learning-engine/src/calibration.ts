import { assertFiniteInRange, round } from './math.js';
import type { CalibrationAttempt, CalibrationResult } from './types.js';

export const MINIMUM_CALIBRATION_ATTEMPTS = 5 as const;

export function calculateCalibration(attempts: readonly CalibrationAttempt[]): CalibrationResult {
  const gaps = attempts.map((attempt) => {
    assertFiniteInRange(attempt.confidence, 'confidence', 0, 100);
    assertFiniteInRange(attempt.evaluatedScore, 'evaluatedScore', 0, 100);
    return Math.abs(attempt.confidence - attempt.evaluatedScore);
  });

  if (gaps.length < MINIMUM_CALIBRATION_ATTEMPTS) {
    return {
      state: 'INSUFFICIENT_DATA',
      evaluatedAttempts: gaps.length,
      minimumAttempts: MINIMUM_CALIBRATION_ATTEMPTS,
      meanAbsoluteGap: null,
    };
  }

  return {
    state: 'CALIBRATED',
    evaluatedAttempts: gaps.length,
    minimumAttempts: MINIMUM_CALIBRATION_ATTEMPTS,
    meanAbsoluteGap: round(gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length),
  };
}

export const calibrationGap = calculateCalibration;
