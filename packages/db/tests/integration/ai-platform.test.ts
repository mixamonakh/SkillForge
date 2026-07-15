import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { PrismaPg } from '@prisma/adapter-pg';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaClient } from '../../generated/client/client.js';
import { createAiRepository } from '../../src/ai/index.js';
import type { AiRepository } from '../../src/ai/repository.js';

const configuredDatabaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://skillforge:skillforge@127.0.0.1:5432/skillforge?schema=public';
const connectionUrl = new URL(configuredDatabaseUrl);
connectionUrl.searchParams.delete('schema');
const databaseUrl = connectionUrl.toString();
const migrationRoot = path.resolve(process.cwd(), 'prisma/migrations');
const aiMigration = '20260715002000_ai_platform';
const schemaName = `sfv2_ai_${randomUUID().replaceAll('-', '')}`;
const quotedSchemaName = `"${schemaName}"`;
const sqlClient = new Client({ connectionString: databaseUrl });

type LegacyFixture = {
  userId: string;
  trackId: string;
  topicId: string;
  taskVersionId: string;
  sessionId: string;
  attemptId: string;
  evaluationId: string;
  evidenceId: string;
  importBatchId: string;
  metricSnapshotId: string;
};

type LegacySnapshot = Record<string, Record<string, unknown>>;

let sqlConnected = false;
let prisma: PrismaClient | undefined;
let repository: AiRepository | undefined;
let fixture: LegacyFixture | undefined;
let legacyBefore: LegacySnapshot | undefined;
let promptVersionId: string | undefined;

async function migrationDirectories(): Promise<string[]> {
  const entries = await readdir(migrationRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

async function applyMigration(directory: string): Promise<void> {
  const sql = await readFile(path.join(migrationRoot, directory, 'migration.sql'), 'utf8');
  await sqlClient.query(sql);
}

async function insertLegacyFixture(): Promise<LegacyFixture> {
  const legacy: LegacyFixture = {
    userId: randomUUID(),
    trackId: randomUUID(),
    topicId: randomUUID(),
    taskVersionId: randomUUID(),
    sessionId: randomUUID(),
    attemptId: randomUUID(),
    evaluationId: randomUUID(),
    evidenceId: randomUUID(),
    importBatchId: randomUUID(),
    metricSnapshotId: randomUUID(),
  };
  const taskId = randomUUID();

  await sqlClient.query(
    'INSERT INTO "User" ("id", "displayName", "updatedAt") VALUES ($1, $2, CURRENT_TIMESTAMP)',
    [legacy.userId, 'AI migration preservation'],
  );
  await sqlClient.query(
    `INSERT INTO "Track" (
      "id", "key", "title", "description", "position", "sourcePack", "sourceVersion", "updatedAt"
    ) VALUES ($1, $2, $3, $4, 1, $5, $6, CURRENT_TIMESTAMP)`,
    [legacy.trackId, 'ai-migration-track', 'AI migration', 'Legacy fixture', 'fixture', '1.0.0'],
  );
  await sqlClient.query(
    `INSERT INTO "Topic" (
      "id", "key", "trackId", "title", "shortDescription", "whyImportant", "atWork",
      "atInterview", "position", "sourcePack", "sourceVersion", "updatedAt"
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, $9, $10, CURRENT_TIMESTAMP)`,
    [
      legacy.topicId,
      'ai-migration-topic',
      legacy.trackId,
      'AI migration topic',
      'Preserve data',
      'Attempts are valuable',
      'Migration verification',
      'Migration verification',
      'fixture',
      '1.0.0',
    ],
  );
  await sqlClient.query(
    `INSERT INTO "Task" (
      "id", "stableKey", "topicId", "kind", "difficulty", "updatedAt"
    ) VALUES ($1, $2, $3, 'EXPLAIN', 'EASY', CURRENT_TIMESTAMP)`,
    [taskId, 'ai-migration-task', legacy.topicId],
  );
  await sqlClient.query(
    `INSERT INTO "TaskVersion" (
      "id", "taskId", "version", "promptMarkdown", "rubric", "hints", "acceptanceCriteria",
      "sourcePack", "sourceVersion", "checksum"
    ) VALUES ($1, $2, 1, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8, $9)`,
    [
      legacy.taskVersionId,
      taskId,
      'Explain the preserved value',
      JSON.stringify({ dimensions: { EXPLANATION: 100 } }),
      JSON.stringify([]),
      JSON.stringify(['Preserve the answer']),
      'fixture',
      '1.0.0',
      'task-checksum-ai-migration',
    ],
  );
  await sqlClient.query(
    `INSERT INTO "LearningSession" (
      "id", "userId", "mode", "learningPhase", "loadMode", "title", "goal", "planSnapshot"
    ) VALUES ($1, $2, 'TRAINING', 'ACQUISITION', 'MINIMAL', $3, $4, $5::jsonb)`,
    [
      legacy.sessionId,
      legacy.userId,
      'Preserved session',
      'Keep every byte',
      JSON.stringify({ marker: 'immutable-session-snapshot', nested: { value: 42 } }),
    ],
  );
  await sqlClient.query(
    `INSERT INTO "Attempt" (
      "id", "userId", "sessionId", "taskVersionId", "answerText", "answerCode",
      "runnerOutput", "submittedAt", "updatedAt"
    ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      legacy.attemptId,
      legacy.userId,
      legacy.sessionId,
      legacy.taskVersionId,
      'valuable answer text',
      'const preserved = true;',
      JSON.stringify({ stdout: ['preserved'], passed: true }),
    ],
  );
  await sqlClient.query(
    `INSERT INTO "ImportBatch" (
      "id", "userId", "schemaVersion", "source", "sourceBundleId", "status", "checksum",
      "rawPayload", "normalized", "preview", "validationErrors"
    ) VALUES ($1, $2, '1.0', 'manual-ai', $3, 'PREVIEWED', $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb)`,
    [
      legacy.importBatchId,
      legacy.userId,
      randomUUID(),
      'legacy-import-checksum',
      JSON.stringify({ answer: 'sensitive preserved import body' }),
      JSON.stringify({ contract: 'skillforge-analysis-v1' }),
      JSON.stringify({ projected: { status: 'UNKNOWN' } }),
      JSON.stringify([]),
    ],
  );
  await sqlClient.query(
    `INSERT INTO "Evaluation" (
      "id", "attemptId", "userId", "importBatchId", "evaluatorType", "evaluatorVersion",
      "rawScore", "passed", "reliability", "dimensionScores", "feedbackMarkdown", "rubricResult",
      "externalReference"
    ) VALUES ($1, $2, $3, $4, 'EXTERNAL_AI', 'legacy-v1', 62, true, 0.65, $5::jsonb, $6,
      $7::jsonb, $8)`,
    [
      legacy.evaluationId,
      legacy.attemptId,
      legacy.userId,
      legacy.importBatchId,
      JSON.stringify({ EXPLANATION: 62 }),
      'preserved feedback',
      JSON.stringify({ coverage: 'partial' }),
      'legacy-evaluation-reference',
    ],
  );
  await sqlClient.query(
    `INSERT INTO "Evidence" (
      "id", "userId", "topicId", "evaluationId", "kind", "rawScore", "normalizedScore",
      "weight", "occurredAt", "provenance"
    ) VALUES ($1, $2, $3, $4, 'EXPLANATION', 62, 0.62, 0.65, CURRENT_TIMESTAMP, $5::jsonb)`,
    [
      legacy.evidenceId,
      legacy.userId,
      legacy.topicId,
      legacy.evaluationId,
      JSON.stringify({ source: 'legacy-import', immutableMarker: true }),
    ],
  );
  await sqlClient.query(
    `INSERT INTO "MetricSnapshot" (
      "id", "userId", "algorithmVersion", "scope", "values"
    ) VALUES ($1, $2, 'legacy-algorithm', 'profile', $3::jsonb)`,
    [
      legacy.metricSnapshotId,
      legacy.userId,
      JSON.stringify({ unknownTopics: 1, marker: 'preserved-metric-snapshot' }),
    ],
  );

  return legacy;
}

async function readLegacySnapshot(legacy: LegacyFixture): Promise<LegacySnapshot> {
  const snapshot: LegacySnapshot = {};
  const rows = [
    ['session', 'LearningSession', legacy.sessionId],
    ['attempt', 'Attempt', legacy.attemptId],
    ['evaluation', 'Evaluation', legacy.evaluationId],
    ['evidence', 'Evidence', legacy.evidenceId],
    ['importBatch', 'ImportBatch', legacy.importBatchId],
    ['metricSnapshot', 'MetricSnapshot', legacy.metricSnapshotId],
    ['taskVersion', 'TaskVersion', legacy.taskVersionId],
  ] as const;
  for (const [key, table, id] of rows) {
    const result = await sqlClient.query<{ row: Record<string, unknown> }>(
      `SELECT to_jsonb(row_value) AS "row" FROM "${table}" AS row_value WHERE "id" = $1`,
      [id],
    );
    const row = result.rows[0]?.row;
    if (row === undefined) {
      throw new Error(`Legacy fixture ${table} is missing`);
    }
    snapshot[key] = row;
  }
  return snapshot;
}

function requirePrisma(): PrismaClient {
  if (prisma === undefined) {
    throw new Error('Prisma client is not initialized');
  }
  return prisma;
}

function requireRepository(): AiRepository {
  if (repository === undefined) {
    throw new Error('AI repository is not initialized');
  }
  return repository;
}

function requireFixture(): LegacyFixture {
  if (fixture === undefined) {
    throw new Error('Legacy fixture is not initialized');
  }
  return fixture;
}

function requirePromptVersionId(): string {
  if (promptVersionId === undefined) {
    throw new Error('Prompt version is not initialized');
  }
  return promptVersionId;
}

function reservationInput(
  id: string,
  period: string,
  cacheKey: string,
  estimatedCostUsd: string,
  relatedAttemptId = requireFixture().attemptId,
) {
  const legacy = requireFixture();
  return {
    id,
    userId: legacy.userId,
    period,
    limitUsd: '10.00',
    feature: 'ATTEMPT_EVALUATION' as const,
    provider: 'fake',
    model: 'fake-evaluator-v1',
    promptVersionId: requirePromptVersionId(),
    inputHash: `input-${cacheKey}`,
    cacheKey,
    estimatedCostUsd,
    relatedAttemptId,
    relatedTaskVersionId: legacy.taskVersionId,
  };
}

beforeAll(async () => {
  await sqlClient.connect();
  sqlConnected = true;
  await sqlClient.query(`CREATE SCHEMA ${quotedSchemaName}`);
  await sqlClient.query(`SET search_path TO ${quotedSchemaName}`);

  const directories = await migrationDirectories();
  for (const directory of directories.filter((candidate) => candidate < aiMigration)) {
    await applyMigration(directory);
  }
  fixture = await insertLegacyFixture();
  legacyBefore = await readLegacySnapshot(fixture);
  await applyMigration(aiMigration);

  const adapter = new PrismaPg({ connectionString: databaseUrl }, { schema: schemaName });
  prisma = new PrismaClient({ adapter });
  await prisma.$queryRaw`SELECT 1`;
  repository = createAiRepository(prisma, { databaseSchema: schemaName });
  const prompt = await repository.registerPromptVersion({
    key: 'attempt-evaluator',
    version: 1,
    feature: 'ATTEMPT_EVALUATION',
    systemPrompt: 'Evaluate only the supplied rubric and return the strict contract.',
    schemaVersion: 'skillforge-ai-attempt-evaluation-v1',
    checksum: 'prompt-checksum-v1',
    active: true,
  });
  promptVersionId = prompt.promptVersion.id;
}, 30_000);

afterAll(async () => {
  await prisma?.$disconnect();
  if (sqlConnected) {
    await sqlClient.query('SET search_path TO public');
    await sqlClient.query(`DROP SCHEMA IF EXISTS ${quotedSchemaName} CASCADE`);
    await sqlClient.end();
  }
});

describe('AI platform PostgreSQL persistence', { concurrent: false }, () => {
  it('additive migration сохраняет attempts, evaluations, evidence, snapshots, imports и TaskVersion', async () => {
    if (legacyBefore === undefined) {
      throw new Error('Legacy before snapshot is missing');
    }
    await expect(readLegacySnapshot(requireFixture())).resolves.toEqual(legacyBefore);
  });

  it('prompt registry идемпотентен, immutable по содержимому и допускает только active toggle', async () => {
    const db = requirePrisma();
    const repo = requireRepository();
    const id = requirePromptVersionId();
    const repeated = await repo.registerPromptVersion({
      key: 'attempt-evaluator',
      version: 1,
      feature: 'ATTEMPT_EVALUATION',
      systemPrompt: 'Evaluate only the supplied rubric and return the strict contract.',
      schemaVersion: 'skillforge-ai-attempt-evaluation-v1',
      checksum: 'prompt-checksum-v1',
      active: true,
    });

    expect(repeated).toMatchObject({ created: false, promptVersion: { id } });
    await expect(repo.setPromptVersionActive(id, false)).resolves.toMatchObject({ active: false });
    await expect(repo.setPromptVersionActive(id, true)).resolves.toMatchObject({ active: true });
    await expect(
      db.aiPromptVersion.update({ where: { id }, data: { checksum: 'mutated-checksum' } }),
    ).rejects.toThrow(/immutable/iu);
    await expect(db.aiPromptVersion.delete({ where: { id } })).rejects.toThrow(/immutable/iu);
  });

  it('concurrent reservations не превышают hard monthly limit', async () => {
    const db = requirePrisma();
    const repo = requireRepository();
    const attempts = Array.from({ length: 6 }, (_, index) =>
      repo.reserveInvocation(
        reservationInput(randomUUID(), '2026-07', `budget-race-${index}`, '3.000000'),
      ),
    );
    const results = await Promise.all(attempts);
    const reserved = results.filter((result) => result.outcome === 'RESERVED');
    const rejected = results.filter((result) => result.outcome === 'REJECTED_BUDGET');
    const budget = await db.aiBudgetPeriod.findUniqueOrThrow({
      where: { userId_period: { userId: requireFixture().userId, period: '2026-07' } },
    });

    expect(reserved).toHaveLength(3);
    expect(rejected).toHaveLength(3);
    expect(budget.reservedUsd.toFixed(6)).toBe('9.000000');
    expect(budget.spentUsd.toFixed(6)).toBe('0.000000');
    expect(budget.reservedUsd.plus(budget.spentUsd).lessThanOrEqualTo(budget.limitUsd)).toBe(true);

    await Promise.all(
      reserved.map((result) => repo.releaseInvocation(result.invocation.id, 'TEST_CLEANUP')),
    );
  });

  it('reconcile и release точны и идемпотентны', async () => {
    const db = requirePrisma();
    const repo = requireRepository();
    const invocationId = randomUUID();
    const reservation = await repo.reserveInvocation(
      reservationInput(invocationId, '2026-08', 'reconcile-success', '4.000000'),
    );
    expect(reservation.outcome).toBe('RESERVED');

    await expect(repo.markInvocationRunning(invocationId)).resolves.toMatchObject({
      changed: true,
    });
    await expect(repo.markInvocationRunning(invocationId)).resolves.toMatchObject({
      changed: false,
    });
    const first = await repo.reconcileInvocation({
      invocationId,
      actualCostUsd: '2.500000',
      inputTokens: 120,
      cachedInputTokens: 20,
      outputTokens: 40,
      latencyMs: 25,
    });
    const repeated = await repo.reconcileInvocation({
      invocationId,
      actualCostUsd: '2.500000',
      inputTokens: 120,
      cachedInputTokens: 20,
      outputTokens: 40,
      latencyMs: 25,
    });
    expect(first).toMatchObject({ changed: true, invocation: { status: 'SUCCEEDED' } });
    expect(repeated).toMatchObject({ changed: false, invocation: { status: 'SUCCEEDED' } });

    const releaseId = randomUUID();
    await repo.reserveInvocation(
      reservationInput(releaseId, '2026-08', 'release-failure', '3.000000'),
    );
    await expect(repo.releaseInvocation(releaseId, 'PROVIDER_TIMEOUT')).resolves.toMatchObject({
      changed: true,
      invocation: { status: 'FAILED', errorCode: 'PROVIDER_TIMEOUT' },
    });
    await expect(repo.releaseInvocation(releaseId, 'PROVIDER_TIMEOUT')).resolves.toMatchObject({
      changed: false,
      invocation: { status: 'FAILED' },
    });

    const overrunId = randomUUID();
    await repo.reserveInvocation(
      reservationInput(overrunId, '2026-08', 'reconcile-overrun', '1.000000'),
    );
    await expect(
      repo.reconcileInvocation({ invocationId: overrunId, actualCostUsd: '1.000001' }),
    ).rejects.toMatchObject({
      code: 'AI_RECONCILE_EXCEEDS_RESERVATION',
    });
    await repo.releaseInvocation(overrunId, 'COST_ESTIMATE_VIOLATION');

    const budget = await db.aiBudgetPeriod.findUniqueOrThrow({
      where: { userId_period: { userId: requireFixture().userId, period: '2026-08' } },
    });
    expect(budget.spentUsd.toFixed(6)).toBe('2.500000');
    expect(budget.reservedUsd.toFixed(6)).toBe('0.000000');
  });

  it('cache deduplicates provider charge and returns one validated normalized draft', async () => {
    const db = requirePrisma();
    const repo = requireRepository();
    const initialRequests = Array.from({ length: 4 }, () =>
      reservationInput(randomUUID(), '2026-09', 'stable-cache-key', '1.000000'),
    );
    const initialResults = await Promise.all(
      initialRequests.map((request) => repo.reserveInvocation(request)),
    );
    const source = initialResults.find((result) => result.outcome === 'RESERVED');
    expect(source).toBeDefined();
    if (source === undefined) {
      return;
    }
    expect(initialResults.filter((result) => result.outcome === 'RESERVED')).toHaveLength(1);
    expect(initialResults.filter((result) => result.outcome === 'IN_PROGRESS')).toHaveLength(3);
    expect(new Set(initialResults.map((result) => result.invocation.id)).size).toBe(1);
    const sourceId = source.invocation.id;
    await repo.markInvocationRunning(sourceId);
    await repo.reconcileInvocation({ invocationId: sourceId, actualCostUsd: '0.400000' });
    const createdDraft = await repo.createEvaluationDraft({
      invocationId: sourceId,
      attemptId: requireFixture().attemptId,
      normalizedJson: {
        contract: 'skillforge-ai-attempt-evaluation-v1',
        attemptId: requireFixture().attemptId,
        score: 62,
        reliability: 0.65,
      },
      preview: { projectedState: 'UNKNOWN', changes: [] },
    });
    expect(createdDraft.changed).toBe(true);

    const secondAttempt = await db.attempt.create({
      data: {
        userId: requireFixture().userId,
        sessionId: requireFixture().sessionId,
        taskVersionId: requireFixture().taskVersionId,
        sequence: 2,
        answerText: 'valuable answer text',
        submittedAt: new Date(),
      },
    });
    const cacheIds = Array.from({ length: 4 }, () => randomUUID());
    const cacheInputs = cacheIds.map((id, index) =>
      reservationInput(
        id,
        '2026-09',
        'stable-cache-key',
        '1.000000',
        index === 0 ? secondAttempt.id : requireFixture().attemptId,
      ),
    );
    const hits = await Promise.all(
      cacheInputs.map((cacheInput) => repo.reserveInvocation(cacheInput)),
    );
    expect(hits.every((hit) => hit.outcome === 'CACHE_HIT')).toBe(true);
    expect(hits.every((hit) => hit.sourceInvocation?.id === sourceId)).toBe(true);
    expect(hits.every((hit) => hit.sourceDraft?.id === createdDraft.draft.id)).toBe(true);
    expect(hits.every((hit) => hit.draft === undefined)).toBe(true);

    const reboundDrafts = await Promise.all(
      hits.map((hit) => {
        const attemptId = hit.invocation.relatedAttemptId;
        if (attemptId === null) {
          throw new Error('Cached invocation must retain current relatedAttemptId');
        }
        return repo.createEvaluationDraft({
          invocationId: hit.invocation.id,
          attemptId,
          normalizedJson: {
            contract: 'skillforge-ai-attempt-evaluation-v1',
            attemptId,
            score: 62,
            reliability: 0.65,
          },
          preview: { projectedState: 'UNKNOWN', changes: [] },
        });
      }),
    );
    expect(new Set(reboundDrafts.map((result) => result.draft.id)).size).toBe(4);
    expect(reboundDrafts[0]?.draft).toMatchObject({ attemptId: secondAttempt.id });
    expect(reboundDrafts[0]?.draft.id).not.toBe(createdDraft.draft.id);

    const repeatedHit = await repo.reserveInvocation(
      cacheInputs[0] ?? reservationInput(randomUUID(), '2026-09', 'stable-cache-key', '1.000000'),
    );
    expect(repeatedHit).toMatchObject({
      outcome: 'CACHE_HIT',
      sourceInvocation: { id: sourceId },
      sourceDraft: { id: createdDraft.draft.id },
      draft: { id: reboundDrafts[0]?.draft.id, attemptId: secondAttempt.id },
    });
    await expect(
      repo.findCachedEvaluation('stable-cache-key', requireFixture().userId),
    ).resolves.toMatchObject({
      sourceInvocation: { id: sourceId },
      draft: { id: createdDraft.draft.id },
    });

    const budget = await db.aiBudgetPeriod.findUniqueOrThrow({
      where: { userId_period: { userId: requireFixture().userId, period: '2026-09' } },
    });
    expect(budget.spentUsd.toFixed(6)).toBe('0.400000');
    expect(budget.reservedUsd.toFixed(6)).toBe('0.000000');
    await expect(
      db.aiInvocation.count({ where: { cacheKey: 'stable-cache-key', status: 'SUCCEEDED' } }),
    ).resolves.toBe(1);
    await expect(
      db.aiInvocation.count({ where: { cacheKey: 'stable-cache-key', status: 'CACHED' } }),
    ).resolves.toBe(4);
  });

  it('draft apply/reject/compensating rollback transitions идемпотентны и не пишут knowledge state', async () => {
    const db = requirePrisma();
    const repo = requireRepository();
    const cached = await repo.findCachedEvaluation('stable-cache-key', requireFixture().userId);
    expect(cached).not.toBeNull();
    if (cached === null) {
      return;
    }

    const evidenceBefore = await db.evidence.count();
    const topicStatesBefore = await db.topicState.count();
    const appliedEvaluation = await db.$transaction(async (transaction) => {
      const evaluation = await transaction.evaluation.create({
        data: {
          attemptId: requireFixture().attemptId,
          userId: requireFixture().userId,
          evaluatorType: 'API_AI',
          evaluatorVersion: 'attempt-evaluator-v1',
          rawScore: 62,
          passed: true,
          reliability: 0.65,
          dimensionScores: { EXPLANATION: 62 },
          feedbackMarkdown: 'Validated candidate',
        },
      });
      await repo.applyEvaluationDraftInTransaction(transaction, cached.draft.id, evaluation.id);
      return evaluation;
    });
    await expect(
      repo.applyEvaluationDraft(cached.draft.id, appliedEvaluation.id),
    ).resolves.toMatchObject({ changed: false, draft: { status: 'APPLIED' } });

    const rollbackEvaluation = await db.$transaction(async (transaction) => {
      const evaluation = await transaction.evaluation.create({
        data: {
          attemptId: requireFixture().attemptId,
          userId: requireFixture().userId,
          evaluatorType: 'API_AI',
          evaluatorVersion: 'attempt-evaluator-v1-rollback',
          rawScore: null,
          passed: null,
          reliability: 1,
          dimensionScores: {},
          feedbackMarkdown: 'Compensating rollback',
          supersedesId: appliedEvaluation.id,
        },
      });
      await repo.rollbackEvaluationDraftInTransaction(transaction, cached.draft.id, evaluation.id);
      return evaluation;
    });
    await expect(
      repo.rollbackEvaluationDraft(cached.draft.id, rollbackEvaluation.id),
    ).resolves.toMatchObject({ changed: false, draft: { status: 'ROLLED_BACK' } });

    const rejectedInvocationId = randomUUID();
    await repo.reserveInvocation(
      reservationInput(rejectedInvocationId, '2026-10', 'draft-reject', '0.500000'),
    );
    await repo.reconcileInvocation({
      invocationId: rejectedInvocationId,
      actualCostUsd: '0.100000',
    });
    const rejectedDraft = await repo.createEvaluationDraft({
      invocationId: rejectedInvocationId,
      attemptId: requireFixture().attemptId,
      normalizedJson: { contract: 'skillforge-ai-attempt-evaluation-v1', score: 20 },
    });
    await expect(repo.rejectEvaluationDraft(rejectedDraft.draft.id)).resolves.toMatchObject({
      changed: true,
      draft: { status: 'REJECTED' },
    });
    await expect(repo.rejectEvaluationDraft(rejectedDraft.draft.id)).resolves.toMatchObject({
      changed: false,
      draft: { status: 'REJECTED' },
    });

    await expect(db.evidence.count()).resolves.toBe(evidenceBefore);
    await expect(db.topicState.count()).resolves.toBe(topicStatesBefore);
    await expect(
      db.attempt.findUniqueOrThrow({ where: { id: requireFixture().attemptId } }),
    ).resolves.toMatchObject({
      answerText: 'valuable answer text',
      answerCode: 'const preserved = true;',
    });
  });
});
