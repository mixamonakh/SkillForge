type JsonRecord = Readonly<Record<string, unknown>>;

export {};

function record(value: unknown): JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function safeText(value: unknown, fallback: string): string {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : fallback;
}

const baseUrl = (process.env.AI_API_BASE_URL ?? 'http://127.0.0.1:4000/api/v1').replace(/\/$/u, '');

async function request(path: string, method: 'GET' | 'POST' = 'GET'): Promise<unknown> {
  const response = await fetch(`${baseUrl}${path}`, { method });
  const payload = await response.json();
  if (!response.ok) {
    const error = record(record(payload).error);
    throw new Error(
      `${safeText(error.code, 'HTTP_ERROR')}: ${safeText(error.message, response.statusText)}`,
    );
  }
  return payload;
}

function safeEvaluationSummary(value: unknown): unknown {
  const response = record(value);
  const draft = record(response.draft);
  const invocation = record(response.invocation);
  return {
    draftId: draft.id ?? null,
    draftStatus: draft.status ?? null,
    invocationId: invocation.id ?? null,
    invocationStatus: invocation.status ?? null,
    provider: invocation.provider ?? null,
    model: invocation.model ?? null,
    cacheHit: invocation.cacheHit ?? false,
  };
}

async function usage(): Promise<void> {
  const result = await request('/ai/usage/current');
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function smoke(): Promise<void> {
  const health = record(await request('/health/ready'));
  const result: Record<string, unknown> = {
    ready: health.status ?? 'ok',
    usage: await request('/ai/usage/current'),
  };
  const evaluationAttemptId = process.env.AI_SMOKE_ATTEMPT_ID?.trim();
  if (evaluationAttemptId) {
    result.evaluation = safeEvaluationSummary(
      await request(`/ai/attempts/${evaluationAttemptId}/evaluate`, 'POST'),
    );
  }
  const nudgeAttemptId = process.env.AI_SMOKE_NUDGE_ATTEMPT_ID?.trim();
  if (nudgeAttemptId) {
    const nudge = record(await request(`/ai/attempts/${nudgeAttemptId}/nudge`, 'POST'));
    result.nudge = {
      attemptId: nudge.attemptId ?? null,
      hintType: nudge.hintType ?? null,
      helpLevel: nudge.helpLevel ?? null,
      cacheHit: nudge.cacheHit ?? false,
      invocationId: nudge.invocationId ?? null,
    };
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const command = process.argv[2] ?? 'smoke';
try {
  if (command === 'usage') await usage();
  else if (command === 'smoke') await smoke();
  else throw new Error('Expected command: smoke or usage');
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'AI CLI failed'}\n`);
  process.exitCode = 1;
}
