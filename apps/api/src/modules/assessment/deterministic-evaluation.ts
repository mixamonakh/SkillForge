import type { EvaluationCoverage, EvaluationResultV2, RunnerResponse } from '@skillforge/contracts';

import { objectValue, stringArray } from '../../common/json.js';

function normalizeLine(value: string): string {
  return value
    .trim()
    .replace(/^(?:[-*]\s+|\d+[.)]\s*)/u, '')
    .replace(/^['"`] | ['"`]$/g, '')
    .trim();
}

function expectedOptions(expectedAnswer: unknown): string[] {
  const expected = objectValue(expectedAnswer);
  for (const key of [
    'selectedOptionIds',
    'correctOptions',
    'selectedOptions',
    'options',
    'optionIds',
  ]) {
    const value = expected[key];
    if (Array.isArray(value)) return stringArray(value).sort();
  }
  for (const key of ['correctOptionId', 'optionId', 'answer']) {
    if (typeof expected[key] === 'string') return [expected[key]];
  }
  return [];
}

export function exactOutputScore(answerText: string | null, expectedAnswer: unknown): number {
  if (!answerText) return 0;
  const expected = objectValue(expectedAnswer).output;
  const expectedLines = (Array.isArray(expected) ? expected : [expected])
    .filter((item): item is string | number | boolean =>
      ['string', 'number', 'boolean'].includes(typeof item),
    )
    .map((item) => normalizeLine(String(item)));
  if (expectedLines.length === 0) return 0;
  const answerLines = answerText
    .replace(/```(?:javascript|js|text)?/gi, '')
    .replace(/```/g, '')
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean);
  return expectedLines.every((line, index) => answerLines[index] === line) ? 100 : 0;
}

export function choiceScore(selected: unknown, expectedAnswer: unknown): number {
  const actual = [...stringArray(selected)].sort();
  const expected = expectedOptions(expectedAnswer);
  return actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
    ? 100
    : 0;
}

export function runnerScore(result: RunnerResponse | null): number {
  if (!result || result.status === 'runtime-error' || result.status === 'timeout') return 0;
  if (result.tests.length === 0) return result.status === 'passed' ? 100 : 0;
  return (result.tests.filter((test) => test.passed).length / result.tests.length) * 100;
}

export function pendingExternalReview(kind: string): boolean {
  return ['EXPLAIN', 'PREDICT_OUTPUT', 'FIND_BUG', 'COMPARE_SOLUTIONS', 'AI_REVIEW'].includes(kind);
}

const DETERMINISTIC_DIMENSIONS: Readonly<Record<string, readonly string[]>> = {
  SINGLE_CHOICE: ['RECALL'],
  MULTIPLE_CHOICE: ['RECALL'],
  PREDICT_OUTPUT: ['PREDICT_OUTPUT'],
  CODE: ['CODE_CORRECTNESS'],
};

function rubricDimensions(rubric: unknown): string[] {
  const dimensions = objectValue(objectValue(rubric).dimensions);
  return Object.entries(dimensions)
    .filter(([, weight]) => typeof weight === 'number' && Number.isFinite(weight) && weight > 0)
    .map(([dimension]) => dimension)
    .sort();
}

export function evaluationCoverage(
  taskKind: string,
  rubric: unknown,
  deterministicEvaluation = false,
): EvaluationCoverage {
  const dimensions = rubricDimensions(rubric);
  const supported = new Set(
    deterministicEvaluation ? (DETERMINISTIC_DIMENSIONS[taskKind] ?? []) : [],
  );
  const evaluatedDimensions = dimensions.filter((dimension) => supported.has(dimension));
  const remainingDimensions = dimensions.filter((dimension) => !supported.has(dimension));
  const reviewable = pendingExternalReview(taskKind);
  const pendingDimensions = reviewable ? remainingDimensions : [];
  const unsupportedDimensions = reviewable ? [] : remainingDimensions;
  return {
    evaluatedDimensions,
    pendingDimensions,
    unsupportedDimensions,
    isFinal:
      dimensions.length > 0 &&
      evaluatedDimensions.length === dimensions.length &&
      pendingDimensions.length === 0 &&
      unsupportedDimensions.length === 0,
  };
}

export function deterministicEvaluationResult(input: {
  taskKind: string;
  rubric: unknown;
  evaluatorType: 'EXACT_MATCH' | 'TEST_RUNNER';
  evaluatorVersion: string;
  rawScore: number;
}): EvaluationResultV2 {
  const coverage = evaluationCoverage(input.taskKind, input.rubric, true);
  const dimensionScores = Object.fromEntries(
    coverage.evaluatedDimensions.map((dimension) => [dimension, input.rawScore]),
  );
  const partial = !coverage.isFinal;
  return {
    evaluatorType: input.evaluatorType,
    evaluatorVersion: input.evaluatorVersion,
    score: partial ? null : input.rawScore,
    passed: partial ? null : input.rawScore >= 100,
    dimensionScores,
    coverage,
    feedback: partial
      ? [
          'Локальная проверка завершена частично.',
          'Полный итог появится после проверки остальных dimensions.',
        ]
      : ['Локальная проверка завершена.'],
  };
}
