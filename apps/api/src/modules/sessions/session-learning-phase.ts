import type { LearningPhase } from '@skillforge/learning-engine';

export type LearningSessionMode =
  | 'ASSESSMENT'
  | 'TRAINING'
  | 'REVIEW'
  | 'INTERVIEW'
  | 'RETURN'
  | 'BATTLE';

const DEFAULT_PHASE_BY_MODE: Readonly<Record<LearningSessionMode, LearningPhase>> = Object.freeze({
  ASSESSMENT: 'CALIBRATION',
  TRAINING: 'ACQUISITION',
  REVIEW: 'CONSOLIDATION',
  INTERVIEW: 'TRANSFER',
  RETURN: 'CONSOLIDATION',
  BATTLE: 'TRANSFER',
});

export function defaultLearningPhaseForMode(mode: LearningSessionMode): LearningPhase {
  return DEFAULT_PHASE_BY_MODE[mode];
}

export function isLearningPhaseCompatible(
  mode: LearningSessionMode,
  learningPhase: LearningPhase,
): boolean {
  if (mode === 'TRAINING') {
    return learningPhase === 'ACQUISITION' || learningPhase === 'CONSOLIDATION';
  }
  return DEFAULT_PHASE_BY_MODE[mode] === learningPhase;
}

export function resolveLearningPhase(
  mode: LearningSessionMode,
  requested?: LearningPhase,
): LearningPhase {
  const learningPhase = requested ?? defaultLearningPhaseForMode(mode);
  if (!isLearningPhaseCompatible(mode, learningPhase)) {
    throw new RangeError(`Learning phase ${learningPhase} is not compatible with mode ${mode}`);
  }
  return learningPhase;
}
