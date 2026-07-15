import {
  CAPABILITY_FAMILIES,
  selectAdaptiveRoutingDecision,
  type AdaptiveDataSufficiency,
  type AdaptiveRoutingDecision,
  type CapabilityCoverage,
  type CapabilityFamily,
} from '@skillforge/learning-engine';

import {
  activeElapsedMilliseconds,
  type PrebaselineCandidate,
  type PrebaselineSnapshot,
} from './prebaseline-snapshot.js';

export type PrebaselineOutcomeStatus = 'CORRECT' | 'INCORRECT' | 'UNKNOWN' | 'PENDING';

export type PrebaselineOutcome = {
  taskVersionId: string;
  topicKey: string;
  primaryFamily: CapabilityFamily;
  status: PrebaselineOutcomeStatus;
  misconceptionTags: string[];
  submittedAt: string;
};

export type PrebaselineRoutingProfile = {
  assessmentRunId: string;
  sufficientForRouting: boolean;
  topicRoutes: Array<{
    topicKey: string;
    recommendedPhase: 'ACQUISITION' | 'CONSOLIDATION' | 'TRANSFER' | 'DEEP_DIAGNOSTIC';
    primaryGap: CapabilityFamily;
    observations: Partial<Record<CapabilityFamily, CapabilityCoverage>>;
    reasons: string[];
  }>;
};

const CORE_ROUTING_FAMILIES: readonly CapabilityFamily[] = [
  'MECHANISM',
  'TRACE',
  'DEBUG',
  'CODE_PRODUCTION',
];

const GAP_PRIORITY: readonly CapabilityFamily[] = [
  'MECHANISM',
  'TRACE',
  'DEBUG',
  'CODE_PRODUCTION',
  'TRANSFER',
  'TERM',
  'CALIBRATION',
];

const DISCOVERY_SEVERITY: Readonly<Record<CapabilityFamily, number>> = {
  TERM: 5,
  MECHANISM: 30,
  TRACE: 40,
  DEBUG: 20,
  CODE_PRODUCTION: 15,
  TRANSFER: 10,
  CALIBRATION: 0,
};

function isGap(outcome: PrebaselineOutcome): boolean {
  return outcome.status === 'INCORRECT' || outcome.status === 'UNKNOWN';
}

function isResolved(outcome: PrebaselineOutcome): boolean {
  return outcome.status !== 'PENDING';
}

function countByFamily(
  outcomes: readonly PrebaselineOutcome[],
  predicate: (outcome: PrebaselineOutcome) => boolean,
): Map<CapabilityFamily, number> {
  const counts = new Map<CapabilityFamily, number>();
  for (const outcome of outcomes) {
    if (!predicate(outcome)) continue;
    counts.set(outcome.primaryFamily, (counts.get(outcome.primaryFamily) ?? 0) + 1);
  }
  return counts;
}

function primaryGap(outcomes: readonly PrebaselineOutcome[]): CapabilityFamily {
  const gaps = countByFamily(outcomes, isGap);
  return [...GAP_PRIORITY].sort(
    (left, right) => (gaps.get(right) ?? 0) - (gaps.get(left) ?? 0),
  )[0] ?? 'MECHANISM';
}

function recommendedPhase(
  outcomes: readonly PrebaselineOutcome[],
  gap: CapabilityFamily,
): 'ACQUISITION' | 'CONSOLIDATION' | 'TRANSFER' {
  if (outcomes.some(isGap)) return 'ACQUISITION';
  if (
    gap === 'TRANSFER' &&
    outcomes.some(
      (outcome) => outcome.primaryFamily === 'TRANSFER' && outcome.status === 'CORRECT',
    )
  ) {
    return 'TRANSFER';
  }
  return 'CONSOLIDATION';
}

function consistentGapSignalCount(outcomes: readonly PrebaselineOutcome[]): number {
  const gaps = countByFamily(outcomes, isGap);
  return Math.max(0, ...gaps.values());
}

function consecutiveSameMisconceptionErrors(outcomes: readonly PrebaselineOutcome[]): number {
  const last = outcomes.at(-1);
  const previous = outcomes.at(-2);
  if (last?.status !== 'INCORRECT' || previous?.status !== 'INCORRECT') return 0;
  const previousTags = new Set(previous.misconceptionTags);
  return last.misconceptionTags.some((tag) => previousTags.has(tag)) ? 2 : 0;
}

function adjacentUnknownCount(outcomes: readonly PrebaselineOutcome[]): number {
  let count = 0;
  for (let index = outcomes.length - 1; index >= 0; index -= 1) {
    if (outcomes[index]?.status !== 'UNKNOWN') break;
    count += 1;
  }
  return count;
}

export function prebaselineDataSufficiency(
  outcomes: readonly PrebaselineOutcome[],
): AdaptiveDataSufficiency {
  const resolvedFamilies = new Set(
    outcomes.filter(isResolved).map((outcome) => outcome.primaryFamily),
  );
  if (
    CAPABILITY_FAMILIES.filter((family) => family !== 'CALIBRATION').every((family) =>
      resolvedFamilies.has(family),
    )
  ) {
    return 'DEEP_SUFFICIENT';
  }
  if (
    consistentGapSignalCount(outcomes) >= 2 ||
    CORE_ROUTING_FAMILIES.every((family) => resolvedFamilies.has(family))
  ) {
    return 'ROUTING_SUFFICIENT';
  }
  return 'LOW';
}

function prerequisitesMet(
  candidate: PrebaselineCandidate,
  outcomes: readonly PrebaselineOutcome[],
): boolean {
  return candidate.prerequisiteTopicKeys.every((topicKey) =>
    outcomes.some((outcome) => outcome.topicKey === topicKey && outcome.status === 'CORRECT'),
  );
}

function targetRelevance(candidate: PrebaselineCandidate, targetTrackKey: string | null): number {
  if (targetTrackKey === null) return 0;
  return Math.max(0, candidate.targetRelevance[targetTrackKey] ?? 0);
}

export function decidePrebaselineNext(input: {
  snapshot: PrebaselineSnapshot;
  outcomes: readonly PrebaselineOutcome[];
  targetTrackKey: string | null;
  now?: Date;
}): AdaptiveRoutingDecision {
  const selectedIds = new Set(
    input.snapshot.selectedHistory.map((entry) => entry.taskVersionId),
  );
  const remaining = input.snapshot.candidatePool.filter(
    (candidate) => !selectedIds.has(candidate.taskVersionId),
  );
  const gap = primaryGap(input.outcomes);
  const phase = recommendedPhase(input.outcomes, gap);
  const selectedCandidates = input.snapshot.selectedHistory.flatMap((entry) => {
    const candidate = input.snapshot.candidatePool.find(
      (item) => item.taskVersionId === entry.taskVersionId,
    );
    return candidate === undefined ? [] : [candidate];
  });
  const seenTopics = new Set(selectedCandidates.map((candidate) => candidate.topicKey));
  const seenFamilies = new Set(selectedCandidates.map((candidate) => candidate.primaryFamily));
  const resolvedFamilies = new Set(
    input.outcomes.filter(isResolved).map((outcome) => outcome.primaryFamily),
  );
  const gapCounts = countByFamily(input.outcomes, isGap);
  const recentFamilies = selectedCandidates.slice(-2).map((candidate) => candidate.primaryFamily);
  const candidates = remaining.map((candidate) => {
    const sameTopicFamilySelections = selectedCandidates.filter(
      (selected) =>
        selected.topicKey === candidate.topicKey &&
        selected.primaryFamily === candidate.primaryFamily,
    ).length;
    const gapSeverity =
      candidate.primaryFamily === gap && input.outcomes.some(isGap)
        ? 100
        : (gapCounts.get(candidate.primaryFamily) ?? 0) > 0
          ? 80
          : DISCOVERY_SEVERITY[candidate.primaryFamily];
    return {
      taskVersionId: candidate.taskVersionId,
      taskKey: candidate.taskKey,
      topicKey: candidate.topicKey,
      primaryFamily: candidate.primaryFamily,
      recommendedPhase:
        candidate.primaryFamily === 'TRANSFER'
          ? ('TRANSFER' as const)
          : candidate.primaryFamily === 'DEBUG' || candidate.primaryFamily === 'CODE_PRODUCTION'
            ? ('CONSOLIDATION' as const)
            : ('ACQUISITION' as const),
      criticalPrerequisitesMet: prerequisitesMet(candidate, input.outcomes),
      gapSeverity,
      missingFamily: !resolvedFamilies.has(candidate.primaryFamily),
      prerequisiteUnlock: candidate.unlocksTopicKeys.length * 5,
      targetRelevance: targetRelevance(candidate, input.targetTrackKey),
      reviewDue: 0,
      diversity:
        (seenTopics.has(candidate.topicKey) ? 0 : 20) +
        (seenFamilies.has(candidate.primaryFamily) ? 0 : 20),
      redundancyPenalty: sameTopicFamilySelections * 30,
      overloadPenalty:
        candidate.productionLoad === 'HIGH'
          ? 10
          : candidate.productionLoad === 'MEDIUM'
            ? 5
            : candidate.productionLoad === 'LOW'
              ? 2
              : 0,
      recentExposurePenalty: recentFamilies.filter(
        (family) => family === candidate.primaryFamily,
      ).length * 15,
    };
  });
  const nextItemCanChangeRoute = remaining.some(
    (candidate) =>
      !resolvedFamilies.has(candidate.primaryFamily) ||
      (gapCounts.get(candidate.primaryFamily) ?? 0) < 2,
  );
  const latestTopicKey = input.outcomes.at(-1)?.topicKey;
  return selectAdaptiveRoutingDecision({
    candidates,
    loadFeedback: 'NORMAL',
    stop: {
      ...(latestTopicKey === undefined ? {} : { topicKey: latestTopicKey }),
      primaryGap: gap,
      recommendedPhase: phase,
      dataSufficiency: prebaselineDataSufficiency(input.outcomes),
      consistentIndependentSignalCount: consistentGapSignalCount(input.outcomes),
      consecutiveSameMisconceptionErrors: consecutiveSameMisconceptionErrors(input.outcomes),
      adjacentNoAnswerLevelCount: adjacentUnknownCount(input.outcomes),
      nextItemCanChangeRoute,
      itemsSeen: input.snapshot.selectedHistory.length,
      itemCap: input.snapshot.hardCaps.items,
      elapsedMinutes: activeElapsedMilliseconds(
        input.snapshot,
        input.now ?? new Date(),
      ) / 60_000,
      timeCapMinutes: input.snapshot.hardCaps.minutes,
      pauseSignal: 'NONE',
      assessmentComplete: remaining.length === 0,
    },
  });
}

export function buildPrebaselineRoutingProfile(input: {
  assessmentRunId: string;
  snapshot: PrebaselineSnapshot;
  outcomes: readonly PrebaselineOutcome[];
  decision?: AdaptiveRoutingDecision;
}): PrebaselineRoutingProfile {
  const sufficiency = prebaselineDataSufficiency(input.outcomes);
  const globalGap = primaryGap(input.outcomes);
  const topicOrder = input.snapshot.candidatePool.map((candidate) => candidate.topicKey);
  const topicKeys = [...new Set(input.outcomes.map((outcome) => outcome.topicKey))].sort(
    (left, right) => topicOrder.indexOf(left) - topicOrder.indexOf(right),
  );
  const topicRoutes = topicKeys.map((topicKey) => {
    const local = input.outcomes.filter((outcome) => outcome.topicKey === topicKey);
    const localGaps = local.filter(isGap);
    const gap =
      localGaps.length > 0 ? primaryGap(local) : (local[0]?.primaryFamily ?? globalGap);
    const observations: Partial<Record<CapabilityFamily, CapabilityCoverage>> = {};
    for (const family of new Set(local.map((outcome) => outcome.primaryFamily))) {
      const localResolvedCount = local.filter(
        (outcome) => outcome.primaryFamily === family && isResolved(outcome),
      ).length;
      observations[family] = localResolvedCount >= 2 ? 'SUFFICIENT' : 'INSUFFICIENT';
    }
    const routeSufficient = sufficiency !== 'LOW';
    const localTransferSuccess = local.some(
      (outcome) => outcome.primaryFamily === 'TRANSFER' && outcome.status === 'CORRECT',
    );
    const routePhase =
      localGaps.length > 0
        ? ('ACQUISITION' as const)
        : !routeSufficient
          ? ('DEEP_DIAGNOSTIC' as const)
          : localTransferSuccess
            ? ('TRANSFER' as const)
            : ('CONSOLIDATION' as const);
    const reasons = [
      localGaps.length > 0
        ? `Зафиксировано сигналов пробела: ${String(localGaps.length)}.`
        : 'Подтверждённого пробела по проверенным dimensions пока нет.',
      routeSufficient
        ? 'Данных достаточно для ограниченного выбора следующей phase.'
        : 'Данных пока недостаточно; нужен следующий диагностический signal.',
    ];
    if (local.some((outcome) => outcome.status === 'PENDING')) {
      reasons.push('Часть ответа ожидает внешней проверки и не считается нулём.');
    }
    return {
      topicKey,
      recommendedPhase: routePhase,
      primaryGap: gap,
      observations,
      reasons,
    };
  });
  return {
    assessmentRunId: input.assessmentRunId,
    sufficientForRouting: sufficiency !== 'LOW',
    topicRoutes,
  };
}
