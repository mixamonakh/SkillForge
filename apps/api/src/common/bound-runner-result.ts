import { createHash } from 'node:crypto';

import { RunnerResponseSchema, type RunnerResponse } from '@skillforge/contracts';

import { objectValue } from './json.js';

type BoundRunnerResult = {
  schemaVersion: '1.0';
  attemptRevision: number;
  sourceChecksum: string;
  result: RunnerResponse;
};

function sourceChecksum(source: string | null): string {
  return createHash('sha256')
    .update(source ?? '', 'utf8')
    .digest('hex');
}

export function bindRunnerResult(
  result: RunnerResponse,
  attemptRevision: number,
  source: string | null,
): BoundRunnerResult {
  return {
    schemaVersion: '1.0',
    attemptRevision,
    sourceChecksum: sourceChecksum(source),
    result,
  };
}

export function currentRunnerResult(stored: unknown, source: string | null): RunnerResponse | null {
  const value = objectValue(stored);
  if (
    value.schemaVersion !== '1.0' ||
    typeof value.attemptRevision !== 'number' ||
    !Number.isInteger(value.attemptRevision) ||
    value.attemptRevision < 0 ||
    value.sourceChecksum !== sourceChecksum(source)
  ) {
    return null;
  }
  const parsed = RunnerResponseSchema.safeParse(value.result);
  return parsed.success ? parsed.data : null;
}
