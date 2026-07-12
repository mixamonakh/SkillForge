import { describe, expect, it } from 'vitest';

import {
  ContractValidationError,
  createExportBundleMarkdown,
  ExportBundleV1,
  JsonDocumentError,
  parseExportBundleV1,
  parseSkillForgeAnalysisV1,
  SkillForgeAnalysisV1,
} from '../src/index.js';

function first<T>(values: readonly T[]): T {
  const value = values[0];
  if (value === undefined) throw new Error('Expected a non-empty fixture');
  return value;
}

const BUNDLE_ID = '4f3762ac-43c7-4c5f-867c-9c69098fb724';
const ATTEMPT_ID = 'ce01ff15-8791-4fe3-97fd-4954421add62';

function validBundle(): ExportBundleV1 {
  return {
    schemaVersion: '1.0',
    bundleId: BUNDLE_ID,
    generatedAt: '2026-07-11T08:00:00.000Z',
    appVersion: '1.0.0',
    bundleType: 'assessment-run',
    user: { displayName: 'Мария', targetTrack: 'yandex-frontend-2026', locale: 'ru' },
    scope: { runId: 'baseline-1' },
    topics: [
      {
        key: 'js.scope.lexical',
        status: 'UNKNOWN',
        masteryEstimate: null,
        masteryConfidence: 0,
        evidenceCount: 0,
      },
    ],
    attempts: [
      {
        attemptId: ATTEMPT_ID,
        taskKey: 'js.scope.lexical.explain-1',
        taskVersion: 1,
        topicKey: 'js.scope.lexical',
        taskKind: 'EXPLAIN',
        prompt: 'Объясните lexical scope',
        answerText: 'Область видимости определяется местом объявления.',
        answerCode: null,
        selfRating: 4,
        confidence: 80,
        helpLevel: 'NONE',
        deterministicEvaluation: null,
      },
    ],
    requestedAnalysis: {
      contract: 'skillforge-analysis-v1',
      language: 'ru',
      instructions: ['Оценить ответ по evidence'],
    },
  };
}

function validAnalysis(): SkillForgeAnalysisV1 {
  return {
    schemaVersion: '1.0',
    contract: 'skillforge-analysis-v1',
    sourceBundleId: BUNDLE_ID,
    evaluator: {
      kind: 'external-ai',
      model: 'external-model',
      analyzedAt: '2026-07-11T08:10:00.000Z',
    },
    attemptEvaluations: [
      {
        attemptId: ATTEMPT_ID,
        overallScore: 82,
        passed: true,
        reliability: 0.65,
        dimensions: { explanation: 82 },
        feedbackMarkdown: 'Корректно, но не хватает примера.',
        misconceptions: [],
        topicEvidence: [{ topicKey: 'js.scope.lexical', kind: 'EXPLANATION', score: 82 }],
      },
    ],
    recommendations: [
      {
        topicKey: 'js.scope.lexical',
        priority: 2,
        sessionMode: 'TRAINING',
        reason: 'Добавить практический пример',
      },
    ],
    summary: 'Ответ в целом корректный.',
    warnings: [],
  };
}

describe('ExportBundleV1', () => {
  it('parses a strict raw JSON contract', () => {
    expect(parseExportBundleV1(JSON.stringify(validBundle()))).toEqual(validBundle());
  });

  it('round-trips the human Markdown wrapper through its single JSON fence', () => {
    const markdown = createExportBundleMarkdown(validBundle());
    expect(markdown).toContain('Оценивай только по evidence');
    expect(parseExportBundleV1(markdown)).toEqual(validBundle());
  });

  it('rejects unknown fields at every contract object boundary', () => {
    const bundle = validBundle() as ExportBundleV1 & { unexpected?: boolean };
    bundle.unexpected = true;
    expect(() => ExportBundleV1.parse(bundle)).toThrow();

    const nested = validBundle() as ExportBundleV1 & {
      user: ExportBundleV1['user'] & { role?: string };
    };
    nested.user.role = 'admin';
    expect(() => ExportBundleV1.parse(nested)).toThrow();
  });

  it('rejects duplicate IDs instead of creating ambiguous provenance', () => {
    const bundle = validBundle();
    bundle.attempts.push({ ...first(bundle.attempts) });
    expect(() => ExportBundleV1.parse(bundle)).toThrow(/Duplicate attempt id/);
  });

  it('rejects duplicate topic keys and unsafe nested JSON scope keys', () => {
    const duplicate = validBundle();
    duplicate.topics.push({ ...first(duplicate.topics) });
    expect(() => ExportBundleV1.parse(duplicate)).toThrow(/Duplicate topic key/);

    const unsafe = validBundle();
    unsafe.scope = JSON.parse('{"constructor":{}}') as ExportBundleV1['scope'];
    expect(() => ExportBundleV1.parse(unsafe)).toThrow(/Unsafe JSON key/);
  });

  it('validates a bundle again before creating the Markdown wrapper', () => {
    const invalid = validBundle();
    invalid.user.displayName = '';
    expect(() => createExportBundleMarkdown(invalid)).toThrow();
  });
});

describe('SkillForgeAnalysisV1', () => {
  it('parses JSON wrapped in a Markdown fence and applies documented defaults', () => {
    const analysis = validAnalysis();
    delete (analysis.attemptEvaluations[0] as { reliability?: number }).reliability;
    delete (analysis as { warnings?: string[] }).warnings;
    const parsed = parseSkillForgeAnalysisV1(`\`\`\`json\n${JSON.stringify(analysis)}\n\`\`\``);
    expect(parsed.attemptEvaluations[0]?.reliability).toBe(0.65);
    expect(parsed.warnings).toEqual([]);
  });

  it('rejects out-of-range scores and unknown enum values', () => {
    const badScore = validAnalysis();
    first(badScore.attemptEvaluations).overallScore = 101;
    expect(() => SkillForgeAnalysisV1.parse(badScore)).toThrow();

    const badKind = validAnalysis() as unknown as {
      attemptEvaluations: Array<{ topicEvidence: Array<{ kind: string }> }>;
    };
    first(first(badKind.attemptEvaluations).topicEvidence).kind = 'COURTESY_SCORE';
    expect(() => SkillForgeAnalysisV1.parse(badKind)).toThrow();
  });

  it('returns structured Zod issues for a schema violation', () => {
    expect.assertions(2);
    try {
      parseSkillForgeAnalysisV1(JSON.stringify({ ...validAnalysis(), contract: 'wrong' }));
    } catch (error) {
      expect(error).toBeInstanceOf(ContractValidationError);
      expect((error as ContractValidationError).issues.length).toBeGreaterThan(0);
    }
  });

  it('rejects malformed JSON before schema validation', () => {
    expect(() => parseSkillForgeAnalysisV1('```json\n{broken}\n```')).toThrow(JsonDocumentError);
  });

  it('rejects duplicate evaluations and excessive dimension maps', () => {
    const duplicate = validAnalysis();
    duplicate.attemptEvaluations.push({ ...first(duplicate.attemptEvaluations) });
    expect(() => SkillForgeAnalysisV1.parse(duplicate)).toThrow(/Duplicate attempt evaluation/);

    const dimensions = Object.fromEntries(
      Array.from({ length: 101 }, (_, index) => [`dimension-${index}`, index % 101]),
    );
    const tooMany = validAnalysis();
    first(tooMany.attemptEvaluations).dimensions = dimensions;
    expect(() => SkillForgeAnalysisV1.parse(tooMany)).toThrow(/dimension scores/);
  });

  it('turns valid JSON with the wrong root type into structured contract issues', () => {
    expect(() => parseSkillForgeAnalysisV1('[]')).toThrow(ContractValidationError);
  });
});
