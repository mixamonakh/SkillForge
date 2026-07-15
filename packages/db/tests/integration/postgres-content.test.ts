import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { PrismaPg } from '@prisma/adapter-pg';
import { loadContentPack } from '@skillforge/content-schema';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaClient } from '../../generated/client/client.js';
import { diffContentPack } from '../../src/content/diff.js';
import { exportContentPackSnapshot } from '../../src/content/exporter.js';
import { importContentPack } from '../../src/content/importer.js';
import { ensureDefaultUser } from '../../src/default-user.js';

const configuredDatabaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://skillforge:skillforge@127.0.0.1:5432/skillforge?schema=public';
const connectionUrl = new URL(configuredDatabaseUrl);
connectionUrl.searchParams.delete('schema');
const databaseUrl = connectionUrl.toString();
const baselinePackPath = path.resolve(process.cwd(), '../../content/packs/js-baseline-v1');
const migrationRoot = path.resolve(process.cwd(), 'prisma/migrations');
const schemaName = `sf_content_${randomUUID().replaceAll('-', '')}`;
const quotedSchemaName = `"${schemaName}"`;
const sqlClient = new Client({ connectionString: databaseUrl });
const isolatedConnectionUrl = new URL(databaseUrl);
isolatedConnectionUrl.searchParams.set('options', `-c search_path=${schemaName}`);
const adapter = new PrismaPg(
  { connectionString: isolatedConnectionUrl.toString() },
  { schema: schemaName },
);
const prisma = new PrismaClient({ adapter });

async function applyMigrations(): Promise<void> {
  const directories = (await readdir(migrationRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
  for (const directory of directories) {
    const sql = await readFile(path.join(migrationRoot, directory, 'migration.sql'), 'utf8');
    await sqlClient.query(sql);
  }
}

describe('PostgreSQL content persistence', () => {
  beforeAll(async () => {
    await sqlClient.connect();
    await sqlClient.query(`CREATE SCHEMA ${quotedSchemaName}`);
    await sqlClient.query(`SET search_path TO ${quotedSchemaName}`);
    await applyMigrations();
    await prisma.$queryRaw`SELECT 1`;
  }, 30_000);

  afterAll(async () => {
    await prisma.$disconnect();
    await sqlClient.query('SET search_path TO public');
    await sqlClient.query(`DROP SCHEMA IF EXISTS ${quotedSchemaName} CASCADE`);
    await sqlClient.end();
  });

  it('имеет применённый AssessmentRun updatedAt contract без schema drift', async () => {
    const columns = await prisma.$queryRaw<Array<{ column_default: string | null }>>`
      SELECT column_default
      FROM information_schema.columns
      WHERE table_schema = ${schemaName}
        AND table_name = 'AssessmentRun'
        AND column_name = 'updatedAt'
    `;

    expect(columns).toEqual([{ column_default: null }]);
  });

  it('идемпотентно создаёт default user и импортирует один checksum дважды', async () => {
    const firstUser = await ensureDefaultUser(prisma);
    const secondUser = await ensureDefaultUser(prisma);
    expect(secondUser).toEqual({ id: firstUser.id, created: false });

    const firstImport = await importContentPack(prisma, baselinePackPath);
    const secondImport = await importContentPack(prisma, baselinePackPath);
    const diff = await diffContentPack(prisma, baselinePackPath);

    expect(firstImport.checksum).toBe(secondImport.checksum);
    expect(secondImport).toMatchObject({
      alreadyImported: true,
      taskVersionsCreated: 0,
      taskVersionsUnchanged: 72,
      contentItemsCreated: 0,
      contentItemsUnchanged: 18,
      assessmentsCreated: 0,
      assessmentsUnchanged: 1,
      sequencesCreated: 0,
      sequencesUnchanged: 0,
    });
    expect(diff).toMatchObject({
      alreadyImported: true,
      tasks: { create: 0, unchanged: 72, conflicts: 0 },
      contentItems: { create: 0, unchanged: 18, conflicts: 0 },
      assessments: { create: 0, unchanged: 1, conflicts: 0 },
      sequences: { create: 0, unchanged: 0, conflicts: 0 },
      conflictDetails: [],
    });
    await expect(
      prisma.contentPack.count({
        where: { key: firstImport.packKey, version: firstImport.packVersion },
      }),
    ).resolves.toBe(1);
  });

  it('повторным canonical import восстанавливает release statuses без изменения versions', async () => {
    const pack = await loadContentPack(baselinePackPath);
    const task = pack.tasks[0];
    const contentItem = pack.contentItems[0];
    const assessment = pack.assessments[0];
    expect(task).toBeDefined();
    expect(contentItem).toBeDefined();
    expect(assessment).toBeDefined();
    if (task === undefined || contentItem === undefined || assessment === undefined) {
      throw new Error('Baseline fixture is incomplete');
    }
    const versionBefore = await prisma.taskVersion.findFirstOrThrow({
      where: { task: { stableKey: task.stableKey }, version: task.version },
      select: { id: true, checksum: true, promptMarkdown: true },
    });

    await prisma.$transaction([
      prisma.contentPack.update({
        where: { key_version: { key: pack.manifest.key, version: pack.manifest.version } },
        data: { status: 'ARCHIVED' },
      }),
      prisma.task.update({ where: { stableKey: task.stableKey }, data: { status: 'DRAFT' } }),
      prisma.contentItem.update({
        where: {
          stableKey_version: { stableKey: contentItem.stableKey, version: contentItem.version },
        },
        data: { status: 'DRAFT' },
      }),
      prisma.assessmentBlueprint.update({
        where: { key_version: { key: assessment.key, version: assessment.version } },
        data: { status: 'DRAFT' },
      }),
    ]);

    await expect(importContentPack(prisma, pack)).resolves.toMatchObject({
      alreadyImported: true,
      taskVersionsCreated: 0,
      contentItemsCreated: 0,
      assessmentsCreated: 0,
    });
    await expect(
      prisma.contentPack.findUniqueOrThrow({
        where: { key_version: { key: pack.manifest.key, version: pack.manifest.version } },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: 'ACTIVE' });
    await expect(
      prisma.task.findUniqueOrThrow({
        where: { stableKey: task.stableKey },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: 'ACTIVE' });
    await expect(
      prisma.contentItem.findUniqueOrThrow({
        where: {
          stableKey_version: { stableKey: contentItem.stableKey, version: contentItem.version },
        },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: 'ACTIVE' });
    await expect(
      prisma.assessmentBlueprint.findUniqueOrThrow({
        where: { key_version: { key: assessment.key, version: assessment.version } },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: 'ACTIVE' });
    await expect(
      prisma.taskVersion.findUniqueOrThrow({
        where: { id: versionBefore.id },
        select: { id: true, checksum: true, promptMarkdown: true },
      }),
    ).resolves.toEqual(versionBefore);
  });

  it('отклоняет конфликт checksum до записи в БД', async () => {
    const pack = await loadContentPack(baselinePackPath);
    const firstTask = pack.tasks[0];
    expect(firstTask).toBeDefined();
    if (firstTask === undefined) {
      return;
    }
    const conflictingPack = {
      ...pack,
      tasks: [{ ...firstTask, checksum: '0'.repeat(64) }, ...pack.tasks.slice(1)],
    };
    const before = await prisma.taskVersion.count();
    const diff = await diffContentPack(prisma, conflictingPack);

    expect(diff.tasks.conflicts).toBe(1);
    await expect(importContentPack(prisma, conflictingPack)).rejects.toThrow(
      /создайте новую version/iu,
    );
    await expect(prisma.taskVersion.count()).resolves.toBe(before);
  });

  it('экспортирует фактический versioned content snapshot', async () => {
    const snapshot = await exportContentPackSnapshot(prisma);

    expect(snapshot.schemaVersion).toBe('1.0');
    expect(snapshot.packs).toHaveLength(1);
    expect(snapshot.tracks).toHaveLength(2);
    expect(snapshot.topics).toHaveLength(18);
    expect(snapshot.contentItems).toHaveLength(18);
    expect(snapshot.tasks).toHaveLength(72);
    expect(snapshot.tasks.flatMap((task) => task.versions)).toHaveLength(72);
    expect(snapshot.assessments).toHaveLength(1);
    expect(snapshot.sequences).toHaveLength(0);
  });

  it('обеспечивает DB constraints и immutable used TaskVersion', async () => {
    const userId = randomUUID();
    const taskVersion = await prisma.taskVersion.findFirstOrThrow({
      orderBy: { id: 'asc' },
      include: { testCases: { orderBy: { position: 'asc' }, take: 1 } },
    });
    const session = await prisma.learningSession.create({
      data: {
        user: { create: { id: userId, displayName: 'DB integration test', locale: 'ru' } },
        mode: 'TRAINING',
        learningPhase: 'ACQUISITION',
        loadMode: 'MINIMAL',
        title: 'DB integration test',
        goal: 'Проверить ограничения хранения',
        planSnapshot: {},
        items: {
          create: {
            taskVersionId: taskVersion.id,
            position: 0,
            purpose: 'integration-test',
          },
        },
      },
      include: { items: true },
    });
    const sessionItem = session.items[0];
    expect(sessionItem).toBeDefined();
    if (sessionItem === undefined) {
      await prisma.user.delete({ where: { id: userId } });
      return;
    }

    try {
      await prisma.attempt.create({
        data: {
          userId,
          sessionId: session.id,
          sessionItemId: sessionItem.id,
          taskVersionId: taskVersion.id,
          sequence: 1,
          answerText: 'integration evidence',
        },
      });

      await expect(
        prisma.attempt.create({
          data: {
            userId,
            sessionId: session.id,
            sessionItemId: sessionItem.id,
            taskVersionId: taskVersion.id,
            sequence: 1,
          },
        }),
      ).rejects.toThrow();
      await expect(
        prisma.attempt.create({
          data: {
            userId,
            sessionId: session.id,
            sessionItemId: sessionItem.id,
            taskVersionId: taskVersion.id,
            sequence: 2,
            selfRating: 6,
          },
        }),
      ).rejects.toThrow();
      await expect(
        prisma.taskVersion.update({
          where: { id: taskVersion.id },
          data: { promptMarkdown: taskVersion.promptMarkdown },
        }),
      ).rejects.toThrow(/immutable/iu);
      await expect(prisma.taskVersion.delete({ where: { id: taskVersion.id } })).rejects.toThrow(
        /immutable/iu,
      );
      await expect(
        prisma.taskTestCase.create({
          data: {
            taskVersionId: taskVersion.id,
            name: 'late mutation',
            testCode: "assert.equal('late', 'late');",
            hidden: true,
            position: 999_999,
          },
        }),
      ).rejects.toThrow(/immutable/iu);

      const testCase = taskVersion.testCases[0];
      if (testCase !== undefined) {
        await expect(
          prisma.taskTestCase.update({
            where: { id: testCase.id },
            data: { name: testCase.name },
          }),
        ).rejects.toThrow(/immutable/iu);
      }
    } finally {
      await prisma.user.delete({ where: { id: userId } });
    }
  });
});
