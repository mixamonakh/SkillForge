import { AUTONOMY_FACTORS } from './config.js';
import { assertFiniteInRange, clamp } from './math.js';
import type { EvidenceInput, NormalizedEvidence } from './types.js';

export function normalizeEvidence(input: EvidenceInput): NormalizedEvidence {
  assertFiniteInRange(input.rawScore, 'rawScore', 0, 100);
  assertFiniteInRange(input.evaluatorReliability, 'evaluatorReliability', 0, 1);
  assertFiniteInRange(input.evidenceTypeWeight, 'evidenceTypeWeight', 0, 2);
  if (!Number.isFinite(input.ageDays) || input.ageDays < 0) {
    throw new RangeError('ageDays must be a finite non-negative number');
  }
  if (!Number.isFinite(input.halfLifeDays) || input.halfLifeDays <= 0) {
    throw new RangeError('halfLifeDays must be a finite positive number');
  }

  const normalizedScore = clamp(input.rawScore * AUTONOMY_FACTORS[input.helpLevel], 0, 100);
  const recencyFactor = 0.5 ** (input.ageDays / input.halfLifeDays);
  const weight = input.evaluatorReliability * input.evidenceTypeWeight * recencyFactor;
  return { normalizedScore, weight };
}
