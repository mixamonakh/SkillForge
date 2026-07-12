import { READINESS_ALGORITHM_VERSION } from './config.js';
import { assertFiniteInRange, clamp, round } from './math.js';
import type {
  ReadinessBlockingGate,
  ReadinessDomainResult,
  ReadinessResult,
  ReadinessTarget,
  ReadinessTopicState,
} from './types.js';

export const DEFAULT_MINIMUM_READINESS_COVERAGE = 0.6;
export const READINESS_DISCLAIMER = 'оценка покрытия компетенций, не вероятность оффера' as const;

export function isReadinessSufficient(
  assessedRequiredTopics: number,
  requiredTopics: number,
  minimumCoverage = DEFAULT_MINIMUM_READINESS_COVERAGE,
): boolean {
  if (!Number.isInteger(assessedRequiredTopics) || assessedRequiredTopics < 0) {
    throw new RangeError('assessedRequiredTopics must be a non-negative integer');
  }
  if (!Number.isInteger(requiredTopics) || requiredTopics < 0) {
    throw new RangeError('requiredTopics must be a non-negative integer');
  }
  assertFiniteInRange(minimumCoverage, 'minimumCoverage', 0, 1);
  if (requiredTopics === 0 || assessedRequiredTopics > requiredTopics) return false;
  return assessedRequiredTopics / requiredTopics >= minimumCoverage;
}

export function calculateReadiness(
  target: ReadinessTarget,
  topicStates: readonly ReadinessTopicState[],
): ReadinessResult {
  const minimumCoverage = target.minimumCoverage ?? DEFAULT_MINIMUM_READINESS_COVERAGE;
  assertFiniteInRange(minimumCoverage, 'target.minimumCoverage', 0, 1);

  const stateByTopic = new Map<string, ReadinessTopicState>();
  for (const state of topicStates) {
    if (stateByTopic.has(state.topicKey))
      throw new Error(`Duplicate topic state: ${state.topicKey}`);
    if (state.masteryEstimate !== null)
      assertFiniteInRange(state.masteryEstimate, 'masteryEstimate', 0, 100);
    stateByTopic.set(state.topicKey, state);
  }

  const requiredKeys = new Set<string>();
  const domainTopics = new Map<string, typeof target.requiredTopics>();
  for (const required of target.requiredTopics) {
    if (requiredKeys.has(required.topicKey))
      throw new Error(`Duplicate required topic: ${required.topicKey}`);
    requiredKeys.add(required.topicKey);
    if (!Number.isFinite(required.weight) || required.weight <= 0) {
      throw new RangeError(`Weight for ${required.topicKey} must be positive`);
    }
    const current = domainTopics.get(required.domainKey) ?? [];
    current.push(required);
    domainTopics.set(required.domainKey, current);
  }

  const isAssessed = (
    state: ReadinessTopicState | undefined,
  ): state is ReadinessTopicState & { masteryEstimate: number } =>
    state !== undefined && state.status !== 'UNKNOWN' && state.masteryEstimate !== null;

  const assessedRequiredTopics = target.requiredTopics.filter((required) =>
    isAssessed(stateByTopic.get(required.topicKey)),
  ).length;
  const requiredTopicCount = target.requiredTopics.length;
  const coverage = requiredTopicCount === 0 ? 0 : assessedRequiredTopics / requiredTopicCount;

  const domains: ReadinessDomainResult[] = [...domainTopics.entries()]
    .map(([domainKey, required]) => {
      const assessed = required.flatMap((topic) => {
        const state = stateByTopic.get(topic.topicKey);
        return isAssessed(state) ? [{ state, weight: topic.weight }] : [];
      });
      const domainCoverage = required.length === 0 ? 0 : assessed.length / required.length;
      const assessedWeight = assessed.reduce((sum, item) => sum + item.weight, 0);
      const weightedMean =
        assessedWeight === 0
          ? null
          : assessed.reduce((sum, item) => sum + item.state.masteryEstimate * item.weight, 0) /
            assessedWeight;
      return {
        domainKey,
        score: weightedMean === null ? null : round(weightedMean * Math.min(1, domainCoverage)),
        coverage: round(domainCoverage, 4),
        assessedTopics: assessed.length,
        requiredTopics: required.length,
      };
    })
    .sort((left, right) => left.domainKey.localeCompare(right.domainKey));

  const state =
    assessedRequiredTopics === 0
      ? 'NOT_CALIBRATED'
      : isReadinessSufficient(assessedRequiredTopics, requiredTopicCount, minimumCoverage)
        ? 'CALIBRATED'
        : 'PARTIALLY_CALIBRATED';

  const blockingGates: ReadinessBlockingGate[] = [];
  for (const gate of target.gates ?? []) {
    assertFiniteInRange(gate.minimumScore, `gate ${gate.key} minimumScore`, 0, 100);
    assertFiniteInRange(gate.cap, `gate ${gate.key} cap`, 0, 100);
    const domain = domains.find((item) => item.domainKey === gate.domainKey);
    if (domain?.score === null || domain === undefined) {
      blockingGates.push({ ...gate, actualScore: null, reason: 'insufficient-domain-data' });
    } else if (domain.score < gate.minimumScore) {
      blockingGates.push({ ...gate, actualScore: domain.score, reason: 'below-threshold' });
    }
  }

  let overallScore: number | null = null;
  const hasUnknownGate = blockingGates.some((gate) => gate.reason === 'insufficient-domain-data');
  if (state === 'CALIBRATED' && !hasUnknownGate) {
    const domainWeights = new Map<string, number>();
    for (const topic of target.requiredTopics) {
      domainWeights.set(topic.domainKey, (domainWeights.get(topic.domainKey) ?? 0) + topic.weight);
    }
    const totalWeight = [...domainWeights.values()].reduce((sum, weight) => sum + weight, 0);
    const uncapped =
      totalWeight === 0
        ? 0
        : domains.reduce(
            (sum, domain) => sum + (domain.score ?? 0) * (domainWeights.get(domain.domainKey) ?? 0),
            0,
          ) / totalWeight;
    const cap = blockingGates.reduce(
      (current, gate) =>
        gate.reason === 'below-threshold' ? Math.min(current, gate.cap) : current,
      100,
    );
    overallScore = round(clamp(uncapped, 0, cap));
  }

  const strongestDomains = domains
    .filter((domain): domain is ReadinessDomainResult & { score: number } => domain.score !== null)
    .sort(
      (left, right) => right.score - left.score || left.domainKey.localeCompare(right.domainKey),
    )
    .slice(0, 3)
    .map((domain) => domain.domainKey);

  return {
    algorithmVersion: READINESS_ALGORITHM_VERSION,
    targetKey: target.key,
    targetVersion: target.version,
    state,
    overallScore,
    coverage: round(coverage, 4),
    assessedRequiredTopics,
    requiredTopics: requiredTopicCount,
    domains,
    strongestDomains,
    blockingGates,
    disclaimer: READINESS_DISCLAIMER,
  };
}
