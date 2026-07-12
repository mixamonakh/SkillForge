import { Script } from 'node:vm';

import type { ContentValidationIssue } from './errors.js';
import type { ContentTask } from './schema.js';

const assertMethodPattern = /\bassert\.([A-Za-z_$][\w$]*)/gu;
const runnerAssertMethods = new Set(['deepEqual', 'equal', 'notEqual']);

export function validateRunnerTests(
  task: Pick<ContentTask, 'stableKey' | 'testCases'>,
  errors: ContentValidationIssue[],
): void {
  const positions = task.testCases.map((testCase) => testCase.position);
  if (new Set(positions).size !== positions.length) {
    errors.push({
      code: 'DUPLICATE_TEST_POSITION',
      message: `Дублируется ${task.stableKey}: ${positions.join(', ')}`,
    });
  }

  const sortedPositions = [...positions].sort((left, right) => left - right);
  const expectedPositions = Array.from({ length: positions.length }, (_, index) => index + 1);
  if (JSON.stringify(sortedPositions) !== JSON.stringify(expectedPositions)) {
    errors.push({
      code: 'INVALID_TEST_POSITIONS',
      message: `${task.stableKey}: test positions должны быть непрерывными 1..${String(positions.length)}`,
    });
  }

  for (const testCase of task.testCases) {
    try {
      new Script(`(function (assert) {\n${testCase.testCode}\n})`, {
        filename: `${task.stableKey}.test-${String(testCase.position)}.js`,
      });
    } catch (error: unknown) {
      errors.push({
        code: 'INVALID_TEST_CODE',
        message: `${task.stableKey}: test ${String(testCase.position)} не компилируется: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
    for (const match of testCase.testCode.matchAll(assertMethodPattern)) {
      const method = match[1];
      if (method !== undefined && !runnerAssertMethods.has(method)) {
        errors.push({
          code: 'UNSUPPORTED_RUNNER_ASSERT',
          message: `${task.stableKey}: test ${String(testCase.position)} использует неподдерживаемый assert.${method}`,
        });
      }
    }
  }
}
