import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { loadContentPack } from '@skillforge/content-schema';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPrismaClient } from '../../src/client.js';
import { diffContentPack } from '../../src/content/diff.js';
import { exportContentPackSnapshot } from '../../src/content/exporter.js';
import { importContentPack } from '../../src/content/importer.js';
import { ensureDefaultUser } from '../../src/default-user.js';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://skillforge:skillforge@127.0.0.1:5432/skillforge?schema=public';
const baselinePackPath = path.resolve(process.cwd(), '../../content/packs/js-baseline-v1');
const prisma = createPrismaClient(databaseUrl);

describe('PostgreSQL content persistence', () => {
  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('имеет применённый AssessmentRun updatedAt contract без schema drift', async () => {
    const columns = await prisma.$queryRaw<Array<{ column_default: string | null }>>`
      SELECT column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
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
    });
    expect(diff).toMatchObject({
      alreadyImported: true,
      tasks: { create: 0, unchanged: 72, conflicts: 0 },
      contentItems: { create: 0, unchanged: 18, conflicts: 0 },
      assessments: { create: 0, unchanged: 1, conflicts: 0 },
      conflictDetails: [],
    });
    await expect(
      prisma.contentPack.count({
        where: { key: firstImport.packKey, version: firstImport.packVersion },
      }),
    ).resolves.toBe(1);
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
    const snapshot = (await exportContentPackSnapshot(prisma)) as {
      schemaVersion: string;
      packs: unknown[];
      tracks: unknown[];
      topics: unknown[];
      contentItems: unknown[];
      tasks: Array<{ versions: unknown[] }>;
      assessments: unknown[];
    };

    expect(snapshot.schemaVersion).toBe('1.0');
    expect(snapshot.packs).toHaveLength(1);
    expect(snapshot.tracks).toHaveLength(2);
    expect(snapshot.topics).toHaveLength(18);
    expect(snapshot.contentItems).toHaveLength(18);
    expect(snapshot.tasks).toHaveLength(72);
    expect(snapshot.tasks.flatMap((task) => task.versions)).toHaveLength(72);
    expect(snapshot.assessments).toHaveLength(1);
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
