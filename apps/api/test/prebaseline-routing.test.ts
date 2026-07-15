import { describe, expect, it } from 'vitest';

import {
  buildPrebaselineRoutingProfile,
  decidePrebaselineNext,
  type PrebaselineOutcome,
} from '../src/modules/assessment/prebaseline-routing.js';
import {
  activeElapsedMilliseconds,
  pausePrebaselineSnapshot,
  resumePrebaselineSnapshot,
  type PrebaselineCandidate,
  type PrebaselineSnapshot,
} from '../src/modules/assessment/prebaseline-snapshot.js';

const baseDecision = {
  decision: 'NEXT_ITEM' as const,
  nextTaskVersionId: 'selected',
  topicKey: 'js.values.types',
  primaryGap: 'TRACE' as const,
  recommendedPhase: 'ACQUISITION' as const,
  reasons: ['test selection'],
  scoreBreakdown: {},
  dataSufficiency: 'LOW' as const,
};

function candidate(
  taskKey: string,
  taskVersionId: string,
  topicKey = 'js.values.types',
): PrebaselineCandidate {
  return {
    taskVersionId,
    taskKey,
    taskVersion: 1,
    topicKey,
    topicTitle: topicKey,
    prerequisiteTopicKeys: [],
    unlocksTopicKeys: [],
    blockIndex: 0,
    position: 0,
    required: false,
    taskKind: 'PREDICT_OUTPUT',
    difficulty: 'EASY',
    primaryFamily: 'TRACE',
    evidenceFamilies: ['TRACE'],
    familyKey: 'values.trace',
    misconceptionTags: ['values.trace-miss'],
    estimatedMinutes: 1,
    productionLoad: 'NONE',
    targetRelevance: {},
  };
}

function snapshot(
  candidates: PrebaselineCandidate[],
  selectedTaskVersionIds: string[] = [],
): PrebaselineSnapshot {
  return {
    schemaVersion: '2.0',
    kind: 'ADAPTIVE_PREBASELINE',
    algorithmVersion: 'recommendation-v2.0',
    blueprint: {
      key: 'js-prebaseline-v1',
      version: 1,
      checksum: 'checksum',
      contentStatus: 'DRAFT',
      reviewState: 'NEEDS_HUMAN_REVIEW',
      estimatedMinutes: 29,
    },
    hardCaps: { items: 18, minutes: 35 },
    candidatePool: candidates,
    selectedHistory: selectedTaskVersionIds.map((taskVersionId, index) => ({
      sequence: index + 1,
      taskVersionId,
      sessionItemId: `session-item-${String(index + 1)}`,
      selectedAt: `2026-07-15T10:0${String(index)}:00.000Z`,
      decision: { ...baseDecision, nextTaskVersionId: taskVersionId },
    })),
    decisionHistory: [],
    timing: {
      startedAt: '2026-07-15T10:00:00.000Z',
      activeStartedAt: '2026-07-15T10:00:00.000Z',
      accumulatedActiveMs: 0,
    },
  };
}

function failed(
  taskVersionId: string,
  topicKey: string,
  submittedAt: string,
): PrebaselineOutcome {
  return {
    taskVersionId,
    topicKey,
    primaryFamily: 'TRACE',
    status: 'INCORRECT',
    misconceptionTags: ['values.trace-miss'],
    submittedAt,
  };
}

describe('pre-baseline adaptive routing', () => {
  it('uses stable task-key tie-breaking independently of candidate order', () => {
    const alpha = candidate('js.values.types.alpha-001', 'task-alpha');
    const zeta = candidate('js.values.types.zeta-001', 'task-zeta');

    const first = decidePrebaselineNext({
      snapshot: snapshot([zeta, alpha]),
      outcomes: [],
      targetTrackKey: null,
      now: new Date('2026-07-15T10:00:10.000Z'),
    });
    const second = decidePrebaselineNext({
      snapshot: snapshot([alpha, zeta]),
      outcomes: [],
      targetTrackKey: null,
      now: new Date('2026-07-15T10:00:10.000Z'),
    });

    expect(first.nextTaskVersionId).toBe('task-alpha');
    expect(second.nextTaskVersionId).toBe('task-alpha');
  });

  it('stops after two independent errors in one family and routes to acquisition', () => {
    const first = candidate('cs.values.trace-001', 'task-first', 'cs.values-and-references');
    const second = candidate('js.values.trace-001', 'task-second', 'js.values.types');
    const remaining = candidate('js.scope.trace-001', 'task-third', 'js.variables.scope');
    const outcomes = [
      failed('task-first', first.topicKey, '2026-07-15T10:01:00.000Z'),
      failed('task-second', second.topicKey, '2026-07-15T10:02:00.000Z'),
    ];
    const state = snapshot([first, second, remaining], ['task-first', 'task-second']);

    const decision = decidePrebaselineNext({
      snapshot: state,
      outcomes,
      targetTrackKey: null,
      now: new Date('2026-07-15T10:03:00.000Z'),
    });
    const profile = buildPrebaselineRoutingProfile({
      assessmentRunId: 'run-id',
      snapshot: state,
      outcomes,
      decision,
    });

    expect(decision).toMatchObject({
      decision: 'STOP_AND_ROUTE',
      primaryGap: 'TRACE',
      recommendedPhase: 'ACQUISITION',
      dataSufficiency: 'ROUTING_SUFFICIENT',
    });
    expect(decision.reasons.join(' ')).toMatch(/два согласованных|coverage/iu);
    expect(profile.sufficientForRouting).toBe(true);
    expect(profile.topicRoutes).toHaveLength(2);
    expect(profile.topicRoutes.every((route) => route.recommendedPhase === 'ACQUISITION')).toBe(
      true,
    );
    expect(
      profile.topicRoutes.every((route) => route.observations.TRACE === 'INSUFFICIENT'),
    ).toBe(true);
    expect(JSON.stringify(profile)).not.toMatch(/mastery|passed|pass\/fail/iu);
  });

  it('stops after adjacent unknown answers without turning them into mastery evidence', () => {
    const candidates = [
      candidate('cs.values.trace-001', 'task-first', 'cs.values-and-references'),
      candidate('js.values.trace-001', 'task-second', 'js.values.types'),
      candidate('js.scope.trace-001', 'task-third', 'js.variables.scope'),
    ];
    const outcomes: PrebaselineOutcome[] = candidates.slice(0, 2).map((item, index) => ({
      taskVersionId: item.taskVersionId,
      topicKey: item.topicKey,
      primaryFamily: item.primaryFamily,
      status: 'UNKNOWN',
      misconceptionTags: item.misconceptionTags,
      submittedAt: `2026-07-15T10:0${String(index + 1)}:00.000Z`,
    }));

    const decision = decidePrebaselineNext({
      snapshot: snapshot(candidates, ['task-first', 'task-second']),
      outcomes,
      targetTrackKey: null,
      now: new Date('2026-07-15T10:03:00.000Z'),
    });

    expect(decision.decision).toBe('STOP_AND_ROUTE');
    expect(decision.reasons.join(' ')).toContain('Не знаю');
  });

  it('counts only active time across pause and resume for the 35-minute cap', () => {
    const state = snapshot([candidate('js.values.trace-001', 'task-first')]);
    const paused = pausePrebaselineSnapshot(state, new Date('2026-07-15T10:05:00.000Z'));
    const resumed = resumePrebaselineSnapshot(paused, new Date('2026-07-15T11:00:00.000Z'));

    expect(activeElapsedMilliseconds(paused, new Date('2026-07-15T11:00:00.000Z'))).toBe(
      5 * 60_000,
    );
    expect(activeElapsedMilliseconds(resumed, new Date('2026-07-15T11:02:00.000Z'))).toBe(
      7 * 60_000,
    );
  });

  it('does not claim routing sufficiency when the pool ends with only pending review', () => {
    const only = candidate('js.values.trace-001', 'task-only');
    const state = snapshot([only], ['task-only']);
    const outcomes: PrebaselineOutcome[] = [
      {
        taskVersionId: only.taskVersionId,
        topicKey: only.topicKey,
        primaryFamily: only.primaryFamily,
        status: 'PENDING',
        misconceptionTags: only.misconceptionTags,
        submittedAt: '2026-07-15T10:01:00.000Z',
      },
    ];
    const decision = decidePrebaselineNext({
      snapshot: state,
      outcomes,
      targetTrackKey: null,
      now: new Date('2026-07-15T10:02:00.000Z'),
    });
    const profile = buildPrebaselineRoutingProfile({
      assessmentRunId: 'run-id',
      snapshot: state,
      outcomes,
      decision,
    });

    expect(decision.decision).toBe('ASSESSMENT_COMPLETE');
    expect(profile.sufficientForRouting).toBe(false);
    expect(profile.topicRoutes[0]?.recommendedPhase).toBe('DEEP_DIAGNOSTIC');
  });
});
