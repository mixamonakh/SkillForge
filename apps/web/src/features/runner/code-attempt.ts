import type { RunnerRequest } from '@skillforge/contracts';

import type { RunnerResult, TaskItem } from '@/shared/api/types';

type SavedAttempt = { id: string; revision: number };

type CodeExecutionDependencies = {
  run: (request: RunnerRequest) => Promise<RunnerResult>;
  persistResult: (attempt: SavedAttempt, result: RunnerResult) => Promise<void>;
};

type CodeExecutionInput = {
  item: TaskItem;
  source: string;
  attempt: SavedAttempt;
  requestId: string;
};

export async function runAndPersistCurrentCode(
  input: CodeExecutionInput,
  dependencies: CodeExecutionDependencies,
): Promise<RunnerResult> {
  const result = await dependencies.run({
    requestId: input.requestId,
    language: input.item.task.language === 'typescript' ? 'typescript' : 'javascript',
    source: input.source,
    harness: input.item.task.runnerHarness ?? '',
    timeoutMs: 2_000,
  });
  await dependencies.persistResult(input.attempt, result);
  return result;
}

export async function ensureCurrentCodeResult(
  input: CodeExecutionInput & { currentResult: RunnerResult | null },
  dependencies: CodeExecutionDependencies,
): Promise<RunnerResult | null> {
  if (input.item.task.kind !== 'CODE' || input.currentResult) return input.currentResult;
  return runAndPersistCurrentCode(input, dependencies);
}

export function runnerResultAfterCodeChange(
  currentResult: RunnerResult | null,
  previousCode: string,
  nextCode: string,
): RunnerResult | null {
  return previousCode === nextCode ? currentResult : null;
}
