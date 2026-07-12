import type { RunnerResponse } from '@skillforge/contracts';

import { objectValue, stringArray } from '../../common/json.js';

function normalizeLine(value: string): string {
  return value
    .trim()
    .replace(/^[-*\d.)\s]+/, '')
    .replace(/^['"`] | ['"`]$/g, '')
    .trim();
}

function expectedOptions(expectedAnswer: unknown): string[] {
  const expected = objectValue(expectedAnswer);
  for (const key of ['correctOptions', 'selectedOptions', 'options', 'optionIds']) {
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
