import { describe, expect, it } from 'vitest';

import {
  evaluateAdaptiveStopRules,
  selectAdaptiveRoutingDecision,
  type AdaptiveCandidateItem,
  type AdaptiveRoutingInput,
  type AdaptiveStopContext,
} from '../src/index.js';

function candidate(overrides: Partial<AdaptiveCandidateItem> = {}): AdaptiveCandidateItem {
  return {
    taskVersionId: 'task-version-1',
    taskKey: 'js.references.trace-001',
    topicKey: 'js.references',
    primaryFamily: 'TRACE',
    recommendedPhase: 'ACQUISITION',
    criticalPrerequisitesMet: true,
    gapSeverity: 40,
    missingFamily: true,
    prerequisiteUnlock: 10,
    targetRelevance: 8,
    reviewDue: 5,
    diversity: 4,
    redundancyPenalty: 3,
    overloadPenalty: 15,
    recentExposurePenalty: 2,
    ...overrides,
  };
}

function stopContext(overrides: Partial<AdaptiveStopContext> = {}): AdaptiveStopContext {
  return {
    topicKey: 'js.references',
    primaryGap: 'TRACE',
    recommendedPhase: 'ACQUISITION',
    dataSufficiency: 'LOW',
    consistentIndependentSignalCount: 0,
    consecutiveSameMisconceptionErrors: 0,
    adjacentNoAnswerLevelCount: 0,
    nextItemCanChangeRoute: true,
    itemsSeen: 1,
    itemCap: 20,
    elapsedMinutes: 2,
    timeCapMinutes: 30,
    pauseSignal: 'NONE',
    assessmentComplete: false,
    ...overrides,
  };
}

function routingInput(overrides: Partial<AdaptiveRoutingInput> = {}): AdaptiveRoutingInput {
  return {
    candidates: [candidate()],
    loadFeedback: 'NORMAL',
    stop: stopContext(),
    ...overrides,
  };
}

describe('adaptive routing and stop rules', () => {
  it('selects the highest-information prerequisite-safe item with actual breakdown', () => {
    const blocked = candidate({
      taskVersionId: 'blocked',
      taskKey: 'js.references.blocked',
      prerequisiteUnlock: 1_000,
      criticalPrerequisitesMet: false,
    });
    const decision = selectAdaptiveRoutingDecision(
      routingInput({ candidates: [blocked, candidate()] }),
    );

    expect(decision).toMatchObject({
      decision: 'NEXT_ITEM',
      nextTaskVersionId: 'task-version-1',
      topicKey: 'js.references',
      primaryGap: 'TRACE',
      recommendedPhase: 'ACQUISITION',
      dataSufficiency: 'LOW',
      scoreBreakdown: {
        gapSeverity: 40,
        missingFamily: 20,
        reviewDue: 5,
        redundancyPenalty: -3,
        recentExposurePenalty: -2,
      },
    });
  });

  it('is deterministic and breaks item-score ties by stable task key', () => {
    const a = candidate({ taskVersionId: 'a-version', taskKey: 'js.a' });
    const z = candidate({ taskVersionId: 'z-version', taskKey: 'js.z' });
    const first = selectAdaptiveRoutingDecision(routingInput({ candidates: [z, a] }));
    const second = selectAdaptiveRoutingDecision(routingInput({ candidates: [a, z] }));

    expect(first).toEqual(second);
    expect(first.nextTaskVersionId).toBe('a-version');
  });

  it.each([
    {
      label: 'consistent independent signals',
      patch: { consistentIndependentSignalCount: 2 },
      reason: 'согласованных независимых',
    },
    {
      label: 'routing sufficiency',
      patch: { dataSufficiency: 'ROUTING_SUFFICIENT' as const },
      reason: 'достаточно',
    },
    {
      label: 'repeated misconception',
      patch: { consecutiveSameMisconceptionErrors: 2 },
      reason: 'misconception',
    },
    {
      label: 'adjacent no-answer levels',
      patch: { adjacentNoAnswerLevelCount: 2 },
      reason: 'Не знаю',
    },
    {
      label: 'no information gain',
      patch: { nextItemCanChangeRoute: false },
      reason: 'не изменит',
    },
    {
      label: 'safe item cap',
      patch: { itemsSeen: 20, itemCap: 20 },
      reason: 'лимит заданий',
    },
    {
      label: 'safe time cap',
      patch: { elapsedMinutes: 30, timeCapMinutes: 30 },
      reason: 'лимит времени',
    },
  ])('stops on $label without fabricating a candidate score', ({ patch, reason }) => {
    const decision = selectAdaptiveRoutingDecision(routingInput({ stop: stopContext(patch) }));

    expect(decision.decision).toBe('STOP_AND_ROUTE');
    expect(decision.scoreBreakdown).toEqual({});
    expect(decision.reasons.join(' ')).toContain(reason);
  });

  it('continues below every stop threshold', () => {
    expect(
      evaluateAdaptiveStopRules(
        stopContext({
          consistentIndependentSignalCount: 1,
          consecutiveSameMisconceptionErrors: 1,
          adjacentNoAnswerLevelCount: 1,
          itemsSeen: 19,
          elapsedMinutes: 29,
        }),
      ),
    ).toEqual({ shouldStop: false, reasons: [] });
  });

  it('recommends a pause only from an explicit overload/user-load signal', () => {
    expect(selectAdaptiveRoutingDecision(routingInput({ loadFeedback: 'OVERLOAD' })).decision).toBe(
      'NEXT_ITEM',
    );
    const paused = selectAdaptiveRoutingDecision(
      routingInput({ stop: stopContext({ pauseSignal: 'OVERLOAD' }) }),
    );
    expect(paused).toMatchObject({ decision: 'PAUSE_RECOMMENDED', scoreBreakdown: {} });
  });

  it('returns assessment completion and empty-score fallback decisions explicitly', () => {
    expect(
      selectAdaptiveRoutingDecision(
        routingInput({ stop: stopContext({ assessmentComplete: true }) }),
      ),
    ).toMatchObject({ decision: 'ASSESSMENT_COMPLETE', scoreBreakdown: {} });
    expect(selectAdaptiveRoutingDecision(routingInput({ candidates: [] }))).toMatchObject({
      decision: 'STOP_AND_ROUTE',
      scoreBreakdown: {},
      dataSufficiency: 'LOW',
    });
  });

  it('rejects unsafe or malformed caps', () => {
    expect(() => evaluateAdaptiveStopRules(stopContext({ itemCap: 0 }))).toThrow(RangeError);
    expect(() => evaluateAdaptiveStopRules(stopContext({ timeCapMinutes: -1 }))).toThrow(
      RangeError,
    );
    expect(() =>
      evaluateAdaptiveStopRules(
        stopContext({ pauseSignal: 'UNKNOWN' as AdaptiveStopContext['pauseSignal'] }),
      ),
    ).toThrow(RangeError);
  });
});
