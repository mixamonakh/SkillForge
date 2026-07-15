import type { EvidenceKind, HelpLevel } from '@skillforge/contracts';
import { describe, expect, it } from 'vitest';

import {
  CAPABILITY_FAMILIES,
  CAPABILITY_PROFILE_ALGORITHM_VERSION,
  calculateCapabilityState,
  computeTopicCapabilityProfile,
  mapCapabilityFamilies,
  normalizeCapabilityEvidence,
  type CapabilityEvidenceInput,
  type CapabilityFamily,
  type CapabilityScoredEvidenceInput,
} from '../src/index.js';

const BASE_DATE = '2026-01-01T10:00:00.000Z';

function scored(
  overrides: Partial<CapabilityScoredEvidenceInput> = {},
): CapabilityScoredEvidenceInput {
  return {
    rawScore: 100,
    evaluatorType: 'TEST_RUNNER',
    evidenceKind: 'PREDICT_OUTPUT',
    helpLevel: 'NONE',
    occurredAt: BASE_DATE,
    passed: true,
    taskKind: 'PREDICT_OUTPUT',
    ...overrides,
  };
}

function twoSignals(
  family: CapabilityFamily,
  evidenceKind: EvidenceKind,
  helpLevel: HelpLevel = 'NONE',
): CapabilityEvidenceInput[] {
  return [
    scored({ families: [family], evidenceKind, helpLevel }),
    scored({
      families: [family],
      evidenceKind,
      helpLevel,
      occurredAt: '2026-01-02T10:00:00.000Z',
    }),
  ];
}

describe('capability family mapping', () => {
  it('uses only conservative legacy mappings', () => {
    expect(mapCapabilityFamilies({ evidenceKind: 'PREDICT_OUTPUT' })).toEqual(['TRACE']);
    expect(mapCapabilityFamilies({ evidenceKind: 'DEBUGGING' })).toEqual(['DEBUG']);
    expect(mapCapabilityFamilies({ evidenceKind: 'CODE_CORRECTNESS' })).toEqual([
      'CODE_PRODUCTION',
    ]);
    expect(mapCapabilityFamilies({ evidenceKind: 'TRANSFER' })).toEqual(['TRANSFER']);
    expect(mapCapabilityFamilies({ evidenceKind: 'BATTLE' })).toEqual(['TRANSFER']);
    expect(mapCapabilityFamilies({ evidenceKind: 'INTERVIEW_RESPONSE' })).toEqual(['TRANSFER']);
  });

  it.each([
    'RECALL',
    'EXPLANATION',
    'EDGE_CASES',
    'COMPLEXITY_REASONING',
    'AI_REVIEW',
    'SELF_REPORT',
  ] as const)('does not invent a family for legacy %s evidence', (evidenceKind) => {
    expect(mapCapabilityFamilies({ evidenceKind })).toEqual([]);
  });

  it('prefers explicit dimension linkage and canonicalizes family order', () => {
    expect(
      mapCapabilityFamilies({
        evidenceKind: 'EXPLANATION',
        families: ['TRANSFER', 'MECHANISM', 'TRANSFER'],
        taskMetadata: {
          sourceSchemaVersion: '2.0',
          evidenceFamilies: ['TRACE'],
          mixedEvidence: false,
        },
      }),
    ).toEqual(['MECHANISM', 'TRANSFER']);
  });

  it('uses explicit v2 task metadata but ignores invented v1 metadata families', () => {
    expect(
      mapCapabilityFamilies({
        evidenceKind: 'EXPLANATION',
        taskMetadata: {
          sourceSchemaVersion: '2.0',
          evidenceFamilies: ['MECHANISM'],
          mixedEvidence: false,
        },
      }),
    ).toEqual(['MECHANISM']);
    expect(
      mapCapabilityFamilies({
        evidenceKind: 'EXPLANATION',
        taskMetadata: {
          sourceSchemaVersion: '1.0',
          evidenceFamilies: ['MECHANISM'],
          mixedEvidence: false,
        },
      }),
    ).toEqual([]);
  });
});

describe('capability-profile-v1.0', () => {
  it('returns NOT_TESTED without fabricated estimates for an empty profile', () => {
    const profile = computeTopicCapabilityProfile('js.references', []);

    expect(profile.algorithmVersion).toBe(CAPABILITY_PROFILE_ALGORITHM_VERSION);
    expect(Object.keys(profile.capabilities)).toEqual(CAPABILITY_FAMILIES);
    for (const state of Object.values(profile.capabilities)) {
      expect(state).toMatchObject({
        coverage: 'NOT_TESTED',
        estimate: null,
        confidence: 0,
        evidenceCount: 0,
        lastEvidenceAt: null,
      });
    }
  });

  it('keeps one weak signal INSUFFICIENT and its estimate hidden', () => {
    const trace = computeTopicCapabilityProfile('js.trace', [
      scored({ rawScore: 20, passed: false }),
    ]).capabilities.TRACE;

    expect(trace).toMatchObject({
      coverage: 'INSUFFICIENT',
      estimate: null,
      evidenceCount: 1,
      independentDays: 1,
      noHelpSuccessCount: 0,
      pendingReviewCount: 0,
      lastEvidenceAt: BASE_DATE,
    });
  });

  it('publishes a conservative estimate only after sufficient reliable evidence', () => {
    const trace = computeTopicCapabilityProfile('js.trace', twoSignals('TRACE', 'PREDICT_OUTPUT'))
      .capabilities.TRACE;

    expect(trace.coverage).toBe('SUFFICIENT');
    expect(trace.estimate).not.toBeNull();
    expect(trace.confidence).toBeGreaterThan(0);
    expect(trace).toMatchObject({
      evidenceCount: 2,
      independentDays: 2,
      noHelpSuccessCount: 2,
      lastEvidenceAt: '2026-01-02T10:00:00.000Z',
    });
  });

  it('keeps evaluated and pending dimensions separate', () => {
    const profile = computeTopicCapabilityProfile('js.composite', [
      ...twoSignals('TRACE', 'PREDICT_OUTPUT'),
      {
        pending: true,
        rawScore: null,
        evaluatorType: 'EXACT_MATCH',
        evidenceKind: 'EXPLANATION',
        helpLevel: 'NONE',
        occurredAt: '2026-01-02T10:00:00.000Z',
        families: ['MECHANISM'],
      },
    ]);

    expect(profile.capabilities.TRACE).toMatchObject({
      coverage: 'SUFFICIENT',
      evidenceCount: 2,
      pendingReviewCount: 0,
    });
    expect(profile.capabilities.MECHANISM).toMatchObject({
      coverage: 'INSUFFICIENT',
      estimate: null,
      evidenceCount: 0,
      pendingReviewCount: 1,
    });
  });

  it('does not spread a composite score across families without dimension linkage', () => {
    const profile = computeTopicCapabilityProfile('js.composite', [
      scored({
        evidenceKind: 'EXPLANATION',
        taskMetadata: {
          sourceSchemaVersion: '2.0',
          evidenceFamilies: ['TRACE', 'MECHANISM'],
          mixedEvidence: true,
        },
      }),
    ]);

    expect(profile.capabilities.TRACE).toMatchObject({
      coverage: 'INSUFFICIENT',
      estimate: null,
      evidenceCount: 0,
      pendingReviewCount: 1,
    });
    expect(profile.capabilities.MECHANISM).toMatchObject({
      coverage: 'INSUFFICIENT',
      estimate: null,
      evidenceCount: 0,
      pendingReviewCount: 1,
    });
  });

  it('lets explicit dimension linkage resolve a mixed v2 task safely', () => {
    const metadata = {
      sourceSchemaVersion: '2.0' as const,
      evidenceFamilies: ['TRACE', 'MECHANISM'] as const,
      mixedEvidence: true,
    };
    const trace = computeTopicCapabilityProfile('js.composite', [
      scored({ families: ['TRACE'], taskMetadata: metadata }),
      scored({
        families: ['TRACE'],
        taskMetadata: metadata,
        occurredAt: '2026-01-02T10:00:00.000Z',
      }),
    ]).capabilities;

    expect(trace.TRACE.coverage).toBe('SUFFICIENT');
    expect(trace.MECHANISM.coverage).toBe('NOT_TESTED');
  });

  it('reduces strength for hinted work and does not count it as no-help success', () => {
    const independent = computeTopicCapabilityProfile(
      'js.production',
      twoSignals('CODE_PRODUCTION', 'CODE_CORRECTNESS'),
    ).capabilities.CODE_PRODUCTION;
    const hinted = computeTopicCapabilityProfile(
      'js.production',
      twoSignals('CODE_PRODUCTION', 'CODE_CORRECTNESS', 'HINT'),
    ).capabilities.CODE_PRODUCTION;

    expect(hinted.coverage).toBe('SUFFICIENT');
    expect(hinted.estimate).toBeLessThan(independent.estimate ?? 0);
    expect(hinted.confidence).toBeLessThan(independent.confidence);
    expect(hinted.noHelpSuccessCount).toBe(0);
  });

  it('keeps transfer separate from code production', () => {
    const profile = computeTopicCapabilityProfile('js.application', [
      ...twoSignals('CODE_PRODUCTION', 'CODE_CORRECTNESS'),
      scored({ evidenceKind: 'TRANSFER', occurredAt: '2026-01-03T10:00:00.000Z' }),
    ]);

    expect(profile.capabilities.CODE_PRODUCTION).toMatchObject({
      coverage: 'SUFFICIENT',
      evidenceCount: 2,
    });
    expect(profile.capabilities.TRANSFER).toMatchObject({
      coverage: 'INSUFFICIENT',
      estimate: null,
      evidenceCount: 1,
    });
  });

  it('does not infer TERM or CALIBRATION from legacy recall/self-report', () => {
    const profile = computeTopicCapabilityProfile('js.terms', [
      scored({ evidenceKind: 'RECALL' }),
      scored({ evidenceKind: 'SELF_REPORT' }),
    ]);

    expect(profile.capabilities.TERM.coverage).toBe('NOT_TESTED');
    expect(profile.capabilities.CALIBRATION.coverage).toBe('NOT_TESTED');
  });

  it('supports CALIBRATION only through explicit evidence linkage', () => {
    const calibration = computeTopicCapabilityProfile(
      'js.calibration',
      twoSignals('CALIBRATION', 'SELF_REPORT'),
    ).capabilities.CALIBRATION;

    expect(calibration.coverage).toBe('INSUFFICIENT');
    expect(calibration.estimate).toBeNull();
    expect(calibration.evidenceCount).toBe(2);
  });

  it('keeps low-reliability evidence insufficient even when count is met', () => {
    const trace = computeTopicCapabilityProfile('js.trace', [
      ...twoSignals('TRACE', 'PREDICT_OUTPUT').map((item) => ({
        ...item,
        evaluatorReliability: 0.1,
      })),
    ]).capabilities.TRACE;

    expect(trace).toMatchObject({ coverage: 'INSUFFICIENT', estimate: null, evidenceCount: 2 });
  });

  it('rejects malformed inputs instead of manufacturing a projection', () => {
    expect(() => computeTopicCapabilityProfile(' ', [])).toThrow(RangeError);
    expect(() => computeTopicCapabilityProfile('js.trace', [scored({ rawScore: 101 })])).toThrow(
      RangeError,
    );
    expect(() => normalizeCapabilityEvidence(scored({ occurredAt: 'not-a-date' }))).toThrow(
      RangeError,
    );
    expect(() =>
      calculateCapabilityState('TRACE', [
        {
          families: ['TRACE'],
          pending: true,
          normalizedScore: 0,
          weight: 1,
          helpLevel: 'NONE',
          occurredAt: BASE_DATE,
          evidenceKind: 'PREDICT_OUTPUT',
          passed: null,
        },
      ]),
    ).toThrow(RangeError);
  });
});
