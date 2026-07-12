import { z } from 'zod';

export const RUNNER_LIMITS = Object.freeze({
  defaultTimeoutMs: 2_000,
  maxTimeoutMs: 2_000,
  maxSourceLength: 50 * 1024,
  maxHarnessLength: 100 * 1024,
  maxTests: 500,
  maxConsoleEntries: 200,
  maxConsoleEntryLength: 4_096,
  maxErrorLength: 16_384,
});

export const RunnerRequestSchema = z
  .object({
    requestId: z.string().trim().min(1).max(128),
    language: z.enum(['javascript', 'typescript']),
    source: z.string().max(RUNNER_LIMITS.maxSourceLength),
    harness: z.string().max(RUNNER_LIMITS.maxHarnessLength),
    timeoutMs: z.number().int().positive().max(RUNNER_LIMITS.maxTimeoutMs),
  })
  .strict();

export const RunnerTestResultSchema = z
  .object({
    name: z.string().min(1).max(500),
    passed: z.boolean(),
    message: z.string().max(RUNNER_LIMITS.maxErrorLength).optional(),
  })
  .strict();

export const RunnerErrorSchema = z
  .object({
    name: z.string().min(1).max(200),
    message: z.string().max(RUNNER_LIMITS.maxErrorLength),
    stack: z.string().max(RUNNER_LIMITS.maxErrorLength).optional(),
  })
  .strict();

export const RunnerResponseSchema = z
  .object({
    requestId: z.string().trim().min(1).max(128),
    status: z.enum(['passed', 'failed', 'runtime-error', 'timeout']),
    tests: z.array(RunnerTestResultSchema).max(RUNNER_LIMITS.maxTests),
    console: z
      .array(z.string().max(RUNNER_LIMITS.maxConsoleEntryLength))
      .max(RUNNER_LIMITS.maxConsoleEntries),
    durationMs: z.number().finite().nonnegative(),
    error: RunnerErrorSchema.optional(),
  })
  .strict()
  .superRefine((response, context) => {
    if (response.status === 'runtime-error' && response.error === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['error'],
        message: 'runtime-error responses must include error details',
      });
    }
    if (response.status === 'passed' && response.tests.some((test) => !test.passed)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tests'],
        message: 'passed response cannot contain a failed test',
      });
    }
  });

export type RunnerRequest = z.infer<typeof RunnerRequestSchema>;
export type RunnerResponse = z.infer<typeof RunnerResponseSchema>;
export type RunnerTestResult = z.infer<typeof RunnerTestResultSchema>;
export type RunnerError = z.infer<typeof RunnerErrorSchema>;

export function createRunnerRequest(
  input: Omit<RunnerRequest, 'timeoutMs'> & { timeoutMs?: number },
): RunnerRequest {
  return RunnerRequestSchema.parse({
    ...input,
    timeoutMs: input.timeoutMs ?? RUNNER_LIMITS.defaultTimeoutMs,
  });
}
