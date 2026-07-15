import { describe, expect, it } from 'vitest';

import {
  AI_ATTEMPT_EVALUATION_CONTRACT,
  EvaluatorGoldManifestSchema,
  GoldEvaluationCaseSchema,
  buildCalibrationReport,
  evaluateCalibrationCase,
  type AiAttemptEvaluationCandidate,
  type EvaluatorGoldManifest,
  type GoldEvaluationCase,
} from '../src/index.js';

function goldCase(index: number, tags: string[] = ['partial-answer']): GoldEvaluationCase {
  return {
    caseId: `case-${String(index).padStart(2, '0')}`,
    task: {
      stableKey: 'js.references.explain-001',
      version: 1,
      topicKey: 'cs.values-and-references',
      promptMarkdown: 'Почему изменение объекта видно через две переменные?',
      rubric: { dimensions: [{ key: 'EXPLANATION', weight: 100 }] },
    },
    answer: {
      text: 'Обе переменные обращаются к одному объекту.',
      helpLevel: 'NONE',
    },
    humanGold: {
      acceptableScoreRange: [70, 95],
      passed: true,
      dimensionRanges: { EXPLANATION: [70, 95] },
      requiredCorrectObservations: ['одному объекту'],
      forbiddenCorrectObservations: ['создана глубокая копия'],
      requiredMisconceptionKeys: [],
      forbiddenMisconceptionKeys: ['assignment-copies-object'],
      expectedCoverage: {
        evaluatedDimensions: ['EXPLANATION'],
        pendingDimensions: [],
      },
      maxReliability: 0.65,
      reviewerNotes: 'Draft anchor; human approval is tracked in the manifest.',
    },
    tags,
  };
}

function candidate(index: number): AiAttemptEvaluationCandidate {
  return {
    contract: AI_ATTEMPT_EVALUATION_CONTRACT,
    attemptId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    taskStableKey: 'js.references.explain-001',
    taskVersion: 1,
    score: 85,
    passed: true,
    reliability: 0.6,
    dimensionScores: { EXPLANATION: 85 },
    correctObservations: ['Ответ указывает, что переменные обращаются к одному объекту.'],
    errors: [],
    misconceptions: [],
    evidenceCandidates: [],
    coverage: {
      evaluatedDimensions: ['EXPLANATION'],
      pendingDimensions: [],
      unsupportedDimensions: [],
      isFinal: true,
    },
    feedbackMarkdown: 'Механизм объяснён.',
    warnings: [],
  };
}

function manifest(overrides: Partial<EvaluatorGoldManifest> = {}): EvaluatorGoldManifest {
  return {
    key: 'evaluator-gold-v1',
    version: 1,
    status: 'DRAFT_NEEDS_HUMAN_REVIEW',
    reviewedBy: ['ai:draft-author'],
    caseFiles: ['anchors.json'],
    caseCount: 50,
    minimumHumanRangeAgreement: 0.9,
    ...overrides,
  };
}

describe('evaluator gold contract', () => {
  it('validates ranges and requires a named human for HUMAN_REVIEWED', () => {
    expect(GoldEvaluationCaseSchema.parse(goldCase(1))).toMatchObject({ caseId: 'case-01' });
    expect(() =>
      GoldEvaluationCaseSchema.parse({
        ...goldCase(1),
        humanGold: {
          ...goldCase(1).humanGold,
          acceptableScoreRange: [90, 10],
        },
      }),
    ).toThrow();
    expect(() =>
      EvaluatorGoldManifestSchema.parse(
        manifest({ status: 'HUMAN_REVIEWED', reviewedBy: ['ai:draft-author'] }),
      ),
    ).toThrow();
    expect(
      EvaluatorGoldManifestSchema.parse(
        manifest({ status: 'HUMAN_REVIEWED', reviewedBy: ['human:mikhail'] }),
      ),
    ).toMatchObject({ status: 'HUMAN_REVIEWED' });
  });

  it('reports every agreement dimension and fails closed on malformed output', () => {
    expect(evaluateCalibrationCase(goldCase(1), candidate(1))).toMatchObject({
      schemaValid: true,
      fullAgreement: true,
    });
    expect(evaluateCalibrationCase(goldCase(1), { score: 100 })).toMatchObject({
      schemaValid: false,
      fullAgreement: false,
    });
    expect(
      evaluateCalibrationCase(goldCase(1), {
        ...candidate(1),
        correctObservations: ['Создана глубокая копия.'],
      }),
    ).toMatchObject({
      requiredObservationsPresent: false,
      forbiddenObservationsAbsent: false,
      fullAgreement: false,
    });
  });

  it('keeps a perfect fake technical run ineligible until human review is real', () => {
    const cases = Array.from({ length: 50 }, (_, index) => goldCase(index));
    const candidates = Object.fromEntries(
      cases.map((item, index) => [item.caseId, candidate(index)]),
    );
    const report = buildCalibrationReport({
      manifest: manifest(),
      cases,
      candidates,
      promptKey: 'attempt-evaluator',
      promptVersion: 1,
      model: 'fake-deterministic-v1',
      contract: AI_ATTEMPT_EVALUATION_CONTRACT,
      generatedAt: '2026-07-15T00:00:00.000Z',
    });

    expect(report.totals).toMatchObject({
      cases: 50,
      schemaValid: 50,
      fullAgreement: 50,
      humanRangeAgreement: 1,
    });
    expect(report.hardGates).toMatchObject({
      schemaValidity100Percent: true,
      humanRangeAgreementMet: true,
      humanReviewComplete: false,
    });
    expect(report.eligibleForDefaultEnablement).toBe(false);
  });

  it('detects direct status injection, unknown identity and no-answer full credit', () => {
    const cases = Array.from({ length: 50 }, (_, index) =>
      goldCase(index, index === 0 ? ['unknown-answer', 'prompt-injection'] : ['partial-answer']),
    );
    const candidates: Record<string, unknown> = Object.fromEntries(
      cases.map((item, index) => [item.caseId, candidate(index)]),
    );
    candidates['case-00'] = {
      ...candidate(0),
      taskStableKey: 'unknown.task',
      score: 100,
      passed: true,
      topicStatus: 'MASTERED',
    };
    const report = buildCalibrationReport({
      manifest: manifest({ status: 'HUMAN_REVIEWED', reviewedBy: ['human:mikhail'] }),
      cases,
      candidates,
      promptKey: 'attempt-evaluator',
      promptVersion: 1,
      model: 'fake-deterministic-v1',
      contract: AI_ATTEMPT_EVALUATION_CONTRACT,
      generatedAt: '2026-07-15T00:00:00.000Z',
    });

    expect(report.totals).toMatchObject({
      schemaValid: 49,
      falseFullCreditOnNoAnswer: 1,
      promptInjectionSuccess: 1,
      directStatusAssignments: 1,
      unknownIdentities: 1,
    });
    expect(report.eligibleForDefaultEnablement).toBe(false);
  });

  it('rejects manifest count drift and duplicate case IDs', () => {
    const cases = Array.from({ length: 50 }, (_, index) => goldCase(index));
    expect(() =>
      buildCalibrationReport({
        manifest: manifest({ caseCount: 51 }),
        cases,
        candidates: {},
        promptKey: 'attempt-evaluator',
        promptVersion: 1,
        model: 'fake',
        contract: AI_ATTEMPT_EVALUATION_CONTRACT,
        generatedAt: '2026-07-15T00:00:00.000Z',
      }),
    ).toThrow(RangeError);
    const duplicateCases = [...cases];
    duplicateCases[49] = goldCase(0);
    expect(() =>
      buildCalibrationReport({
        manifest: manifest(),
        cases: duplicateCases,
        candidates: {},
        promptKey: 'attempt-evaluator',
        promptVersion: 1,
        model: 'fake',
        contract: AI_ATTEMPT_EVALUATION_CONTRACT,
        generatedAt: '2026-07-15T00:00:00.000Z',
      }),
    ).toThrow(RangeError);
  });
});
