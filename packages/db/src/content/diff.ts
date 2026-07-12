import { createVersionImportPlan, type LoadedContentPack } from '@skillforge/content-schema';

import type { PrismaClient } from '../../generated/client/client.js';
import { resolvePack } from './pack.js';

export type ContentDatabaseDiff = {
  pack: { key: string; version: string; checksum: string };
  alreadyImported: boolean;
  tasks: { create: number; unchanged: number; conflicts: number };
  contentItems: { create: number; unchanged: number; conflicts: number };
  assessments: { create: number; unchanged: number; conflicts: number };
  conflictDetails: Array<{
    kind: 'task' | 'content-item' | 'assessment' | 'pack';
    stableKey: string;
    version: string;
    existingChecksum: string;
    incomingChecksum: string;
  }>;
};

export async function diffContentPack(
  prisma: PrismaClient,
  packOrPath: LoadedContentPack | string,
): Promise<ContentDatabaseDiff> {
  const pack = await resolvePack(packOrPath);
  const [existingPack, taskVersions, contentItems, assessments] = await Promise.all([
    prisma.contentPack.findUnique({
      where: { key_version: { key: pack.manifest.key, version: pack.manifest.version } },
      select: { checksum: true },
    }),
    prisma.taskVersion.findMany({
      where: { task: { stableKey: { in: pack.tasks.map((task) => task.stableKey) } } },
      select: { version: true, checksum: true, task: { select: { stableKey: true } } },
    }),
    prisma.contentItem.findMany({
      where: { stableKey: { in: pack.contentItems.map((item) => item.stableKey) } },
      select: { stableKey: true, version: true, checksum: true },
    }),
    prisma.assessmentBlueprint.findMany({
      where: { key: { in: pack.assessments.map((assessment) => assessment.key) } },
      select: { key: true, version: true, checksum: true },
    }),
  ]);

  const taskPlan = createVersionImportPlan(
    pack.tasks,
    taskVersions.map((taskVersion) => ({
      stableKey: taskVersion.task.stableKey,
      version: taskVersion.version,
      checksum: taskVersion.checksum,
    })),
  );
  const contentPlan = createVersionImportPlan(pack.contentItems, contentItems);
  const assessmentPlan = createVersionImportPlan(
    pack.assessments.map((assessment) => ({
      ...assessment,
      stableKey: assessment.key,
    })),
    assessments.map((assessment) => ({
      stableKey: assessment.key,
      version: assessment.version,
      checksum: assessment.checksum,
    })),
  );

  const conflictDetails: ContentDatabaseDiff['conflictDetails'] = [
    ...taskPlan.conflicts.map((conflict) => ({
      kind: 'task' as const,
      stableKey: conflict.stableKey,
      version: String(conflict.version),
      existingChecksum: conflict.existingChecksum,
      incomingChecksum: conflict.incomingChecksum,
    })),
    ...contentPlan.conflicts.map((conflict) => ({
      kind: 'content-item' as const,
      stableKey: conflict.stableKey,
      version: String(conflict.version),
      existingChecksum: conflict.existingChecksum,
      incomingChecksum: conflict.incomingChecksum,
    })),
    ...assessmentPlan.conflicts.map((conflict) => ({
      kind: 'assessment' as const,
      stableKey: conflict.stableKey,
      version: String(conflict.version),
      existingChecksum: conflict.existingChecksum,
      incomingChecksum: conflict.incomingChecksum,
    })),
  ];

  if (existingPack !== null && existingPack.checksum !== pack.checksum) {
    conflictDetails.unshift({
      kind: 'pack',
      stableKey: pack.manifest.key,
      version: pack.manifest.version,
      existingChecksum: existingPack.checksum,
      incomingChecksum: pack.checksum,
    });
  }

  return {
    pack: {
      key: pack.manifest.key,
      version: pack.manifest.version,
      checksum: pack.checksum,
    },
    alreadyImported: existingPack?.checksum === pack.checksum,
    tasks: {
      create: taskPlan.create.length,
      unchanged: taskPlan.unchanged.length,
      conflicts: taskPlan.conflicts.length,
    },
    contentItems: {
      create: contentPlan.create.length,
      unchanged: contentPlan.unchanged.length,
      conflicts: contentPlan.conflicts.length,
    },
    assessments: {
      create: assessmentPlan.create.length,
      unchanged: assessmentPlan.unchanged.length,
      conflicts: assessmentPlan.conflicts.length,
    },
    conflictDetails,
  };
}

export function assertNoContentConflicts(diff: ContentDatabaseDiff): void {
  if (diff.conflictDetails.length === 0) {
    return;
  }

  const details = diff.conflictDetails
    .map(
      (conflict) =>
        `${conflict.kind}:${conflict.stableKey}@${conflict.version} (${conflict.existingChecksum} != ${conflict.incomingChecksum})`,
    )
    .join(', ');
  throw new Error(
    `Импорт запрещён: существующая version имеет другой checksum. Создайте новую version. ${details}`,
  );
}
