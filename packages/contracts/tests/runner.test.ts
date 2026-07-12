import { describe, expect, it } from 'vitest';

import {
  createRunnerRequest,
  RUNNER_LIMITS,
  RunnerRequestSchema,
  RunnerResponseSchema,
} from '../src/index.js';

describe('runner protocol', () => {
  it('uses the 2000ms default and rejects oversized or unknown request data', () => {
    expect(
      createRunnerRequest({
        requestId: 'run-1',
        language: 'javascript',
        source: 'return 1',
        harness: 'test()',
      }),
    ).toMatchObject({ timeoutMs: 2_000 });

    expect(() =>
      RunnerRequestSchema.parse({
        requestId: 'run-1',
        language: 'javascript',
        source: 'x'.repeat(RUNNER_LIMITS.maxSourceLength + 1),
        harness: '',
        timeoutMs: 2_000,
      }),
    ).toThrow();
    expect(() =>
      RunnerRequestSchema.parse({
        requestId: 'run-1',
        language: 'javascript',
        source: '',
        harness: '',
        timeoutMs: 2_000,
        executeOnServer: true,
      }),
    ).toThrow();
  });

  it('keeps response status consistent with test and runtime-error details', () => {
    expect(() =>
      RunnerResponseSchema.parse({
        requestId: 'run-1',
        status: 'passed',
        tests: [{ name: 'works', passed: false }],
        console: [],
        durationMs: 1,
      }),
    ).toThrow();
    expect(() =>
      RunnerResponseSchema.parse({
        requestId: 'run-1',
        status: 'runtime-error',
        tests: [],
        console: [],
        durationMs: 1,
      }),
    ).toThrow();
    expect(
      RunnerResponseSchema.parse({
        requestId: 'run-1',
        status: 'timeout',
        tests: [],
        console: [],
        durationMs: 2_000,
      }),
    ).toMatchObject({ status: 'timeout' });
  });
});
