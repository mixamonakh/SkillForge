import { randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { PrismaPg } from '@prisma/adapter-pg';
import {
  loadContentPack,
  ManifestSchema,
  sha256,
  type LoadedContentPack,
} from '@skillforge/content-schema';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaClient } from '../../generated/client/client.js';
import { diffContentPack } from '../../src/content/diff.js';
import { exportContentPackSnapshot } from '../../src/content/exporter.js';
import { importContentPack } from '../../src/content/importer.js';

const configuredDatabaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://skillforge:skillforge@127.0.0.1:5432/skillforge?schema=public';
const connectionUrl = new URL(configuredDatabaseUrl);
connectionUrl.searchParams.delete('schema');
const databaseUrl = connectionUrl.toString();
const migrationRoot = path.resolve(process.cwd(), 'prisma/migrations');
const baselinePackPath = path.resolve(process.cwd(), '../../content/packs/js-baseline-v1');
const schemaName = `sfv2_phase_${randomUUID().replaceAll('-', '')}`;
const quotedSchemaName = `"${schemaName}"`;
const sqlClient = new Client({ connectionString: databaseUrl });

const modeToPhase = {
  ASSESSMENT: 'CALIBRATION',
  TRAINING: 'ACQUISITION',
  REVIEW: 'CONSOLIDATION',
  RETURN: 'CONSOLIDATION',
  INTERVIEW: 'TRANSFER',
  BATTLE: 'TRANSFER',
} as const;

type LegacyFixture = {
  userId: string;
  taskVersionId: string;
  attemptId: string;
  sessionIds: Record<keyof typeof modeToPhase, string>;
};

let prisma: PrismaClient | undefined;
let temporaryPackRoot: string | undefined;
let sequencePackPath: string | undefined;
let legacyFixture: LegacyFixture | undefined;
let sqlConnected = false;

async function applyMigration(directory: string): Promise<void> {
  const sql = await readFile(path.join(migrationRoot, directory, 'migration.sql'), 'utf8');
  await sqlClient.query(sql);
}

async function insertLegacyFixture(): Promise<LegacyFixture> {
  const userId = randomUUID();
  const trackId = randomUUID();
  const topicId = randomUUID();
  const taskId = randomUUID();
  const taskVersionId = randomUUID();
  const attemptId = randomUUID();

  await sqlClient.query(
    'INSERT INTO "User" ("id", "displayName", "updatedAt") VALUES ($1, $2, CURRENT_TIMESTAMP)',
    [userId, 'Phase migration integration'],
  );
  await sqlClient.query(
    `INSERT INTO "Track" (
      "id", "key", "title", "description", "position", "sourcePack", "sourceVersion", "updatedAt"
    ) VALUES ($1, $2, $3, $4, 1, $5, $6, CURRENT_TIMESTAMP)`,
    [trackId, 'migration-track', 'Migration track', 'Migration fixture', 'legacy-pack', '1.0.0'],
  );
  await sqlClient.query(
    `INSERT INTO "Topic" (
      "id", "key", "trackId", "title", "shortDescription", "whyImportant", "atWork",
      "atInterview", "position", "sourcePack", "sourceVersion", "updatedAt"
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, $9, $10, CURRENT_TIMESTAMP)`,
    [
      topicId,
      'migration-topic',
      trackId,
      'Migration topic',
      'Fixture',
      'Preservation',
      'Database migration',
      'Database migration',
      'legacy-pack',
      '1.0.0',
    ],
  );
  await sqlClient.query(
    `INSERT INTO "Task" (
      "id", "stableKey", "topicId", "kind", "difficulty", "updatedAt"
    ) VALUES ($1, $2, $3, 'EXPLAIN', 'EASY', CURRENT_TIMESTAMP)`,
    [taskId, 'migration-task', topicId],
  );
  await sqlClient.query(
    `INSERT INTO "TaskVersion" (
      "id", "taskId", "version", "promptMarkdown", "rubric", "hints", "acceptanceCriteria",
      "sourcePack", "sourceVersion", "checksum"
    ) VALUES ($1, $2, 1, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8, $9)`,
    [
      taskVersionId,
      taskId,
      'Legacy prompt',
      JSON.stringify({ dimensions: { EXPLANATION: 100 } }),
      JSON.stringify([]),
      JSON.stringify(['Preserve answer']),
      'legacy-pack',
      '1.0.0',
      'legacy-task-checksum',
    ],
  );

  const sessionIds = {} as LegacyFixture['sessionIds'];
  for (const mode of Object.keys(modeToPhase) as Array<keyof typeof modeToPhase>) {
    const sessionId = randomUUID();
    sessionIds[mode] = sessionId;
    await sqlClient.query(
      `INSERT INTO "LearningSession" (
        "id", "userId", "mode", "loadMode", "title", "goal", "planSnapshot"
      ) VALUES ($1, $2, $3::"SessionMode", 'MINIMAL', $4, $5, $6::jsonb)`,
      [
        sessionId,
        userId,
        mode,
        `Legacy ${mode}`,
        'Preserve the complete session',
        JSON.stringify({ immutableMarker: `snapshot-${mode}` }),
      ],
    );
  }

  await sqlClient.query(
    `INSERT INTO "Attempt" (
      "id", "userId", "sessionId", "taskVersionId", "answerText", "updatedAt"
    ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
    [attemptId, userId, sessionIds.TRAINING, taskVersionId, 'valuable legacy answer'],
  );

  return { userId, taskVersionId, attemptId, sessionIds };
}

async function createPackWithSequence(): Promise<string> {
  temporaryPackRoot = await mkdtemp(path.join(tmpdir(), 'skillforge-db-sequence-'));
  const packPath = path.join(temporaryPackRoot, 'js-baseline-v1');
  await cp(baselinePackPath, packPath, { recursive: true });

  const manifestPath = path.join(packPath, 'manifest.json');
  const manifest = ManifestSchema.parse(
    JSON.parse(await readFile(manifestPath, 'utf8')) as unknown,
  );
  manifest.counts.sequences = 1;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await mkdir(path.join(packPath, 'sequences'));
  await writeFile(
    path.join(packPath, 'sequences', '01-acquisition.json'),
    `${JSON.stringify(
      [
        {
          schemaVersion: '1.0',
          key: 'cs.values-and-references.acquisition-v1',
          version: 1,
          topicKey: 'cs.values-and-references',
          phase: 'ACQUISITION',
          estimatedMinutes: 20,
          steps: [
            {
              kind: 'CONTENT',
              contentItemKey: 'cs.values-and-references.note-001',
              version: 1,
            },
            {
              kind: 'TASK',
              taskKey: 'cs.values-and-references.predict-001',
              version: 1,
              purpose: 'PREDICT',
            },
          ],
          completionRule: { requiredSteps: 2, minimumNoHelpSuccesses: 1 },
        },
      ],
      null,
      2,
    )}\n`,
    'utf8',
  );

  return packPath;
}

function requirePrisma(): PrismaClient {
  if (prisma === undefined) {
    throw new Error('Test Prisma client is not initialized');
  }
  return prisma;
}

function requireLegacyFixture(): LegacyFixture {
  if (legacyFixture === undefined) {
    throw new Error('Legacy migration fixture is not initialized');
  }
  return legacyFixture;
}

function requireSequencePackPath(): string {
  if (sequencePackPath === undefined) {
    throw new Error('Sequence pack fixture is not initialized');
  }
  return sequencePackPath;
}

function recalculatePackChecksum(pack: LoadedContentPack): LoadedContentPack {
  pack.checksum = sha256({
    manifest: pack.manifest,
    tracks: pack.tracks,
    topics: pack.topics,
    contentItems: pack.contentItems,
    tasks: pack.tasks,
    assessments: pack.assessments,
    ...(pack.manifest.counts.sequences !== undefined ? { sequences: pack.sequences } : {}),
  });
  return pack;
}

function asCrossPack(pack: LoadedContentPack, key: string): LoadedContentPack {
  const crossPack = structuredClone(pack);
  crossPack.manifest.key = key;
  crossPack.rootPath = path.join(path.dirname(pack.rootPath), key);
  return recalculatePackChecksum(crossPack);
}

beforeAll(async () => {
  await sqlClient.connect();
  sqlConnected = true;
  await sqlClient.query(`CREATE SCHEMA ${quotedSchemaName}`);
  await sqlClient.query(`SET search_path TO ${quotedSchemaName}`);

  await applyMigration('20260711000000_initial');
  await applyMigration('20260711001000_assessment_run_timestamps');
  await applyMigration('20260711002000_assessment_run_updated_at_contract');
  await applyMigration('20260711003000_lock_used_task_tests');
  legacyFixture = await insertLegacyFixture();
  await applyMigration('20260715000000_learning_sequences_and_phases');
  await applyMigration('20260715001000_learning_session_content_steps');

  const adapter = new PrismaPg({ connectionString: databaseUrl }, { schema: schemaName });
  prisma = new PrismaClient({ adapter });
  await prisma.$queryRaw`SELECT 1`;
  sequencePackPath = await createPackWithSequence();
}, 30_000);

afterAll(async () => {
  await prisma?.$disconnect();
  if (sqlConnected) {
    await sqlClient.query('SET search_path TO public');
    await sqlClient.query(`DROP SCHEMA IF EXISTS ${quotedSchemaName} CASCADE`);
    await sqlClient.end();
  }
  if (temporaryPackRoot !== undefined) {
    await rm(temporaryPackRoot, { recursive: true });
  }
});

describe('LearningPhase migration and sequence persistence', { concurrent: false }, () => {
  it('backfill сохраняет все sessions, snapshots и attempts с точным mapping', async () => {
    const fixture = requireLegacyFixture();
    const sessions = await sqlClient.query<{
      id: string;
      mode: keyof typeof modeToPhase;
      learningPhase: string;
      planSnapshot: { immutableMarker: string };
    }>(
      `SELECT "id", "mode", "learningPhase", "planSnapshot"
       FROM "LearningSession"
       ORDER BY "mode"`,
    );

    expect(sessions.rows).toHaveLength(6);
    for (const session of sessions.rows) {
      expect(session.learningPhase).toBe(modeToPhase[session.mode]);
      expect(session.planSnapshot).toEqual({ immutableMarker: `snapshot-${session.mode}` });
      expect(session.id).toBe(fixture.sessionIds[session.mode]);
    }

    const attempts = await sqlClient.query<{ id: string; answerText: string }>(
      'SELECT "id", "answerText" FROM "Attempt" WHERE "id" = $1',
      [fixture.attemptId],
    );
    expect(attempts.rows).toEqual([
      { id: fixture.attemptId, answerText: 'valuable legacy answer' },
    ]);

    const prismaSessions = await requirePrisma().learningSession.findMany({
      where: { userId: fixture.userId },
      orderBy: { mode: 'asc' },
    });
    expect(prismaSessions).toHaveLength(6);
    expect(
      prismaSessions.every((session) => session.learningPhase === modeToPhase[session.mode]),
    ).toBe(true);

    const phaseColumn = await sqlClient.query<{
      is_nullable: string;
      column_default: string | null;
    }>(
      `SELECT is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = $1
         AND table_name = 'LearningSession'
         AND column_name = 'learningPhase'`,
      [schemaName],
    );
    expect(phaseColumn.rows).toHaveLength(1);
    expect(phaseColumn.rows[0]?.is_nullable).toBe('NO');
    expect(phaseColumn.rows[0]?.column_default).toMatch(/ACQUISITION.*LearningPhase/u);
  });

  it('импортирует sequence атомарно, идемпотентно и экспортирует canonical JSON', async () => {
    const testPrisma = requirePrisma();
    const packPath = requireSequencePackPath();

    const first = await importContentPack(testPrisma, packPath);
    const second = await importContentPack(testPrisma, packPath);
    const diff = await diffContentPack(testPrisma, packPath);
    const stored = await testPrisma.learningSequenceBlueprint.findUniqueOrThrow({
      where: {
        key_version: { key: 'cs.values-and-references.acquisition-v1', version: 1 },
      },
    });
    const snapshot = await exportContentPackSnapshot(testPrisma);

    expect(first).toMatchObject({ sequencesCreated: 1, sequencesUnchanged: 0 });
    expect(second).toMatchObject({
      alreadyImported: true,
      sequencesCreated: 0,
      sequencesUnchanged: 1,
    });
    expect(diff.sequences).toEqual({ create: 0, unchanged: 1, conflicts: 0 });
    expect(stored).toMatchObject({
      phase: 'ACQUISITION',
      schemaVersion: '1.0',
      estimatedMinutes: 20,
      completionRule: { requiredSteps: 2, minimumNoHelpSuccesses: 1 },
    });
    expect(stored.steps).toEqual([
      {
        kind: 'CONTENT',
        contentItemKey: 'cs.values-and-references.note-001',
        version: 1,
      },
      {
        kind: 'TASK',
        taskKey: 'cs.values-and-references.predict-001',
        version: 1,
        purpose: 'PREDICT',
      },
    ]);
    expect(snapshot.sequences).toEqual([
      expect.objectContaining({
        key: 'cs.values-and-references.acquisition-v1',
        topicKey: 'cs.values-and-references',
        steps: stored.steps,
        completionRule: stored.completionRule,
      }),
    ]);
  });

  it('добавляет immutable content step без изменения legacy session, answer и snapshot', async () => {
    const testPrisma = requirePrisma();
    const fixture = requireLegacyFixture();
    const contentItem = await testPrisma.contentItem.findUniqueOrThrow({
      where: {
        stableKey_version: {
          stableKey: 'cs.values-and-references.note-001',
          version: 1,
        },
      },
    });
    const beforeSession = await testPrisma.learningSession.findUniqueOrThrow({
      where: { id: fixture.sessionIds.TRAINING },
    });
    const beforeAttempt = await testPrisma.attempt.findUniqueOrThrow({
      where: { id: fixture.attemptId },
    });

    const step = await testPrisma.learningSessionContentStep.create({
      data: {
        sessionId: fixture.sessionIds.TRAINING,
        contentItemId: contentItem.id,
        sequencePosition: 0,
        required: true,
        snapshot: {
          schemaVersion: '1.0',
          stableKey: contentItem.stableKey,
          version: contentItem.version,
          checksum: contentItem.checksum,
          kind: contentItem.kind,
          title: contentItem.title,
          bodyMarkdown: contentItem.bodyMarkdown,
          payload: contentItem.payload,
        },
      },
    });
    const afterSession = await testPrisma.learningSession.findUniqueOrThrow({
      where: { id: fixture.sessionIds.TRAINING },
    });
    const afterAttempt = await testPrisma.attempt.findUniqueOrThrow({
      where: { id: fixture.attemptId },
    });

    expect(step).toMatchObject({
      sessionId: fixture.sessionIds.TRAINING,
      contentItemId: contentItem.id,
      sequencePosition: 0,
      completedAt: null,
    });
    expect(afterSession.planSnapshot).toEqual(beforeSession.planSnapshot);
    expect(afterAttempt).toEqual(beforeAttempt);
  });

  it('reuse shared Track/Topic не меняет ownership, status, metadata или dependency graph', async () => {
    const testPrisma = requirePrisma();
    const packPath = requireSequencePackPath();
    const baselinePack = await loadContentPack(packPath);
    const crossPack = asCrossPack(baselinePack, 'js-prebaseline-v1');
    const beforeTracks = await testPrisma.track.findMany({
      where: { key: { in: crossPack.tracks.map((track) => track.key) } },
      orderBy: { key: 'asc' },
    });
    const beforeTopics = await testPrisma.topic.findMany({
      where: { key: { in: crossPack.topics.map((topic) => topic.key) } },
      orderBy: { key: 'asc' },
    });
    const beforeDependencies = await testPrisma.topicDependency.findMany({
      where: { topicId: { in: beforeTopics.map((topic) => topic.id) } },
      orderBy: [{ topicId: 'asc' }, { prerequisiteId: 'asc' }],
    });

    const diff = await diffContentPack(testPrisma, crossPack);
    const result = await importContentPack(testPrisma, crossPack);
    const afterTracks = await testPrisma.track.findMany({
      where: { key: { in: crossPack.tracks.map((track) => track.key) } },
      orderBy: { key: 'asc' },
    });
    const afterTopics = await testPrisma.topic.findMany({
      where: { key: { in: crossPack.topics.map((topic) => topic.key) } },
      orderBy: { key: 'asc' },
    });
    const afterDependencies = await testPrisma.topicDependency.findMany({
      where: { topicId: { in: afterTopics.map((topic) => topic.id) } },
      orderBy: [{ topicId: 'asc' }, { prerequisiteId: 'asc' }],
    });

    expect(diff.tracks).toEqual({ create: 0, update: 0, reuse: 2, conflicts: 0 });
    expect(diff.topics).toEqual({ create: 0, update: 0, reuse: 18, conflicts: 0 });
    expect(result).toMatchObject({
      tracksUpserted: 0,
      tracksReused: 2,
      topicsUpserted: 0,
      topicsReused: 18,
    });
    expect(afterTracks).toEqual(beforeTracks);
    expect(afterTopics).toEqual(beforeTopics);
    expect(afterDependencies).toEqual(beforeDependencies);
    expect(afterTracks.every((track) => track.sourcePack === 'js-baseline-v1')).toBe(true);
    expect(afterTopics.every((topic) => topic.sourcePack === 'js-baseline-v1')).toBe(true);
  });

  it('отклоняет cross-pack semantic и dependency conflicts без записи', async () => {
    const testPrisma = requirePrisma();
    const baselinePack = await loadContentPack(requireSequencePackPath());
    const conflictingTopicPack = asCrossPack(baselinePack, 'js-conflicting-topic-v1');
    const firstTopic = conflictingTopicPack.topics[0];
    expect(firstTopic).toBeDefined();
    if (firstTopic === undefined) {
      return;
    }
    firstTopic.title = `${firstTopic.title} changed`;
    recalculatePackChecksum(conflictingTopicPack);

    const dependencyPack = asCrossPack(baselinePack, 'js-conflicting-dependency-v1');
    const topicWithPrerequisite = dependencyPack.topics.find(
      (topic) => topic.prerequisites.length > 0,
    );
    expect(topicWithPrerequisite).toBeDefined();
    if (topicWithPrerequisite === undefined) {
      return;
    }
    topicWithPrerequisite.prerequisites = [];
    recalculatePackChecksum(dependencyPack);

    const beforePacks = await testPrisma.contentPack.count();
    const beforeDependencies = await testPrisma.topicDependency.count();
    const topicDiff = await diffContentPack(testPrisma, conflictingTopicPack);
    const dependencyDiff = await diffContentPack(testPrisma, dependencyPack);

    expect(topicDiff.conflictDetails).toContainEqual(
      expect.objectContaining({ kind: 'topic', stableKey: firstTopic.key }),
    );
    expect(dependencyDiff.conflictDetails).toContainEqual(
      expect.objectContaining({
        kind: 'topic-dependency',
        stableKey: topicWithPrerequisite.key,
      }),
    );
    await expect(importContentPack(testPrisma, conflictingTopicPack)).rejects.toThrow(
      /существующая version имеет другой checksum/iu,
    );
    await expect(importContentPack(testPrisma, dependencyPack)).rejects.toThrow(
      /существующая version имеет другой checksum/iu,
    );
    await expect(testPrisma.contentPack.count()).resolves.toBe(beforePacks);
    await expect(testPrisma.topicDependency.count()).resolves.toBe(beforeDependencies);
  });

  it('отклоняет checksum conflict sequence version до любых записей', async () => {
    const testPrisma = requirePrisma();
    const packPath = requireSequencePackPath();
    const pack = structuredClone(await loadContentPack(packPath));
    const sequence = pack.sequences[0];
    expect(sequence).toBeDefined();
    if (sequence === undefined) {
      return;
    }
    sequence.checksum = '0'.repeat(64);
    const before = await testPrisma.learningSequenceBlueprint.count();
    const diff = await diffContentPack(testPrisma, pack);

    expect(diff.sequences).toEqual({ create: 0, unchanged: 0, conflicts: 1 });
    expect(diff.conflictDetails).toContainEqual(
      expect.objectContaining({
        kind: 'sequence',
        stableKey: sequence.key,
        version: String(sequence.version),
      }),
    );
    await expect(importContentPack(testPrisma, pack)).rejects.toThrow(/создайте новую version/iu);
    await expect(testPrisma.learningSequenceBlueprint.count()).resolves.toBe(before);
  });
});
