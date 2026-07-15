import type { LoadedContentPack } from '@skillforge/content-schema';

import { Prisma, type PrismaClient } from '../../generated/client/client.js';
import { assertNoContentConflicts, diffContentPack } from './diff.js';
import {
  areSemanticsEqual,
  normalizedPrerequisiteKeys,
  type TopicSemantics,
  type TrackSemantics,
} from './ownership.js';
import { contentStatusBySource, resolvePack, toJson } from './pack.js';

export type ContentImportResult = {
  packKey: string;
  packVersion: string;
  checksum: string;
  alreadyImported: boolean;
  tracksUpserted: number;
  tracksReused: number;
  topicsUpserted: number;
  topicsReused: number;
  taskVersionsCreated: number;
  taskVersionsUnchanged: number;
  contentItemsCreated: number;
  contentItemsUnchanged: number;
  assessmentsCreated: number;
  assessmentsUnchanged: number;
  sequencesCreated: number;
  sequencesUnchanged: number;
};

async function reconcileCanonicalStatuses(
  transaction: Prisma.TransactionClient,
  pack: LoadedContentPack,
): Promise<void> {
  await transaction.contentPack.update({
    where: { key_version: { key: pack.manifest.key, version: pack.manifest.version } },
    data: {
      locale: pack.manifest.locale,
      status: contentStatusBySource[pack.manifest.status],
      manifest: toJson(pack.manifest),
    },
  });

  for (const status of ['draft', 'active', 'archived'] as const) {
    const trackKeys = pack.tracks
      .filter((track) => track.status === status)
      .map((track) => track.key);
    if (trackKeys.length > 0) {
      await transaction.track.updateMany({
        where: {
          key: { in: trackKeys },
          sourcePack: pack.manifest.key,
          sourceVersion: pack.manifest.version,
        },
        data: { status: contentStatusBySource[status] },
      });
    }

    const topicKeys = pack.topics
      .filter((topic) => topic.status === status)
      .map((topic) => topic.key);
    if (topicKeys.length > 0) {
      await transaction.topic.updateMany({
        where: {
          key: { in: topicKeys },
          sourcePack: pack.manifest.key,
          sourceVersion: pack.manifest.version,
        },
        data: { status: contentStatusBySource[status] },
      });
    }

    const taskKeys = pack.tasks
      .filter((task) => task.status === status)
      .map((task) => task.stableKey);
    if (taskKeys.length > 0) {
      await transaction.task.updateMany({
        where: {
          stableKey: { in: taskKeys },
          versions: {
            some: { sourcePack: pack.manifest.key, sourceVersion: pack.manifest.version },
          },
        },
        data: { status: contentStatusBySource[status] },
      });
    }

    const contentItemKeys = pack.contentItems
      .filter((item) => item.status === status)
      .map((item) => item.stableKey);
    if (contentItemKeys.length > 0) {
      await transaction.contentItem.updateMany({
        where: {
          stableKey: { in: contentItemKeys },
          sourcePack: pack.manifest.key,
          sourceVersion: pack.manifest.version,
        },
        data: { status: contentStatusBySource[status] },
      });
    }

    const assessmentKeys = pack.assessments
      .filter((assessment) => assessment.status === status)
      .map((assessment) => assessment.key);
    if (assessmentKeys.length > 0) {
      await transaction.assessmentBlueprint.updateMany({
        where: {
          key: { in: assessmentKeys },
          sourcePack: pack.manifest.key,
          sourceVersion: pack.manifest.version,
        },
        data: { status: contentStatusBySource[status] },
      });
    }
  }
}

async function importIntoTransaction(
  transaction: Prisma.TransactionClient,
  pack: LoadedContentPack,
): Promise<ContentImportResult> {
  const currentPack = await transaction.contentPack.findUnique({
    where: { key_version: { key: pack.manifest.key, version: pack.manifest.version } },
    select: { checksum: true },
  });

  if (currentPack?.checksum === pack.checksum) {
    await reconcileCanonicalStatuses(transaction, pack);
    return {
      packKey: pack.manifest.key,
      packVersion: pack.manifest.version,
      checksum: pack.checksum,
      alreadyImported: true,
      tracksUpserted: 0,
      tracksReused: 0,
      topicsUpserted: 0,
      topicsReused: 0,
      taskVersionsCreated: 0,
      taskVersionsUnchanged: pack.tasks.length,
      contentItemsCreated: 0,
      contentItemsUnchanged: pack.contentItems.length,
      assessmentsCreated: 0,
      assessmentsUnchanged: pack.assessments.length,
      sequencesCreated: 0,
      sequencesUnchanged: pack.sequences.length,
    };
  }
  if (currentPack !== null) {
    throw new Error(
      `Content pack ${pack.manifest.key}@${pack.manifest.version} уже существует с другим checksum`,
    );
  }

  const currentTracks = await transaction.track.findMany({
    where: { key: { in: pack.tracks.map((track) => track.key) } },
    select: {
      key: true,
      title: true,
      description: true,
      position: true,
      status: true,
      sourcePack: true,
    },
  });
  const currentTrackByKey = new Map(currentTracks.map((track) => [track.key, track]));
  let tracksUpserted = 0;
  let tracksReused = 0;
  for (const track of pack.tracks) {
    const current = currentTrackByKey.get(track.key);
    if (current === undefined) {
      await transaction.track.create({
        data: {
          key: track.key,
          title: track.title,
          description: track.description,
          position: track.position,
          status: contentStatusBySource[track.status],
          sourcePack: pack.manifest.key,
          sourceVersion: pack.manifest.version,
        },
      });
      tracksUpserted += 1;
      continue;
    }

    if (current.sourcePack === pack.manifest.key) {
      await transaction.track.update({
        where: { key: track.key },
        data: {
          title: track.title,
          description: track.description,
          position: track.position,
          status: contentStatusBySource[track.status],
          sourcePack: pack.manifest.key,
          sourceVersion: pack.manifest.version,
        },
      });
      tracksUpserted += 1;
      continue;
    }

    const incomingSemantics: TrackSemantics = {
      title: track.title,
      description: track.description,
      position: track.position,
      status: contentStatusBySource[track.status],
    };
    const existingSemantics: TrackSemantics = {
      title: current.title,
      description: current.description,
      position: current.position,
      status: current.status,
    };
    if (!areSemanticsEqual(existingSemantics, incomingSemantics)) {
      throw new Error(`Shared track ${track.key} имеет несовместимую semantic definition`);
    }
    tracksReused += 1;
  }

  const tracks = await transaction.track.findMany({
    where: { key: { in: pack.tracks.map((track) => track.key) } },
    select: { id: true, key: true },
  });
  const trackIdByKey = new Map(tracks.map((track) => [track.key, track.id]));

  const currentTopics = await transaction.topic.findMany({
    where: { key: { in: pack.topics.map((topic) => topic.key) } },
    select: {
      key: true,
      title: true,
      shortDescription: true,
      whyImportant: true,
      atWork: true,
      atInterview: true,
      position: true,
      defaultHalfLifeDays: true,
      status: true,
      sourcePack: true,
      metadata: true,
      track: { select: { key: true } },
      prerequisites: { select: { prerequisite: { select: { key: true } } } },
    },
  });
  const currentTopicByKey = new Map(currentTopics.map((topic) => [topic.key, topic]));
  const ownedTopicKeys = new Set<string>();
  let topicsUpserted = 0;
  let topicsReused = 0;
  for (const topic of pack.topics) {
    const trackId = trackIdByKey.get(topic.trackKey);
    if (trackId === undefined) {
      throw new Error(`Track ${topic.trackKey} не найден для topic ${topic.key}`);
    }
    const current = currentTopicByKey.get(topic.key);
    if (current === undefined) {
      await transaction.topic.create({
        data: {
          key: topic.key,
          trackId,
          title: topic.title,
          shortDescription: topic.shortDescription,
          whyImportant: topic.whyImportant,
          atWork: topic.atWork,
          atInterview: topic.atInterview,
          position: topic.position,
          defaultHalfLifeDays: topic.defaultHalfLifeDays,
          status: contentStatusBySource[topic.status],
          sourcePack: pack.manifest.key,
          sourceVersion: pack.manifest.version,
          metadata: toJson(topic.metadata),
        },
      });
      ownedTopicKeys.add(topic.key);
      topicsUpserted += 1;
      continue;
    }

    if (current.sourcePack === pack.manifest.key) {
      await transaction.topic.update({
        where: { key: topic.key },
        data: {
          trackId,
          title: topic.title,
          shortDescription: topic.shortDescription,
          whyImportant: topic.whyImportant,
          atWork: topic.atWork,
          atInterview: topic.atInterview,
          position: topic.position,
          defaultHalfLifeDays: topic.defaultHalfLifeDays,
          status: contentStatusBySource[topic.status],
          sourcePack: pack.manifest.key,
          sourceVersion: pack.manifest.version,
          metadata: toJson(topic.metadata),
        },
      });
      ownedTopicKeys.add(topic.key);
      topicsUpserted += 1;
      continue;
    }

    const incomingSemantics: TopicSemantics = {
      trackKey: topic.trackKey,
      title: topic.title,
      shortDescription: topic.shortDescription,
      whyImportant: topic.whyImportant,
      atWork: topic.atWork,
      atInterview: topic.atInterview,
      position: topic.position,
      defaultHalfLifeDays: topic.defaultHalfLifeDays,
      status: contentStatusBySource[topic.status],
      metadata: topic.metadata,
    };
    const existingSemantics: TopicSemantics = {
      trackKey: current.track.key,
      title: current.title,
      shortDescription: current.shortDescription,
      whyImportant: current.whyImportant,
      atWork: current.atWork,
      atInterview: current.atInterview,
      position: current.position,
      defaultHalfLifeDays: current.defaultHalfLifeDays,
      status: current.status,
      metadata: current.metadata,
    };
    const incomingPrerequisites = normalizedPrerequisiteKeys(topic.prerequisites);
    const existingPrerequisites = normalizedPrerequisiteKeys(
      current.prerequisites.map((dependency) => dependency.prerequisite.key),
    );
    if (
      !areSemanticsEqual(existingSemantics, incomingSemantics) ||
      !areSemanticsEqual(existingPrerequisites, incomingPrerequisites)
    ) {
      throw new Error(`Shared topic ${topic.key} имеет несовместимую semantic definition`);
    }
    topicsReused += 1;
  }

  const topics = await transaction.topic.findMany({
    where: { key: { in: pack.topics.map((topic) => topic.key) } },
    select: { id: true, key: true },
  });
  const topicIdByKey = new Map(topics.map((topic) => [topic.key, topic.id]));
  const ownedTopics = topics.filter((topic) => ownedTopicKeys.has(topic.key));
  if (ownedTopics.length > 0) {
    await transaction.topicDependency.deleteMany({
      where: { topicId: { in: ownedTopics.map((topic) => topic.id) } },
    });
  }
  const dependencies = pack.topics
    .filter((topic) => ownedTopicKeys.has(topic.key))
    .flatMap((topic) =>
      topic.prerequisites.map((prerequisiteKey) => {
        const topicId = topicIdByKey.get(topic.key);
        const prerequisiteId = topicIdByKey.get(prerequisiteKey);
        if (topicId === undefined || prerequisiteId === undefined) {
          throw new Error(`Не удалось разрешить dependency ${topic.key} -> ${prerequisiteKey}`);
        }
        return { topicId, prerequisiteId, weight: 1 };
      }),
    );
  if (dependencies.length > 0) {
    await transaction.topicDependency.createMany({ data: dependencies });
  }

  let contentItemsCreated = 0;
  let contentItemsUnchanged = 0;
  for (const item of pack.contentItems) {
    const topicId = topicIdByKey.get(item.topicKey);
    if (topicId === undefined) {
      throw new Error(`Topic ${item.topicKey} не найден для content item ${item.stableKey}`);
    }
    const current = await transaction.contentItem.findUnique({
      where: { stableKey_version: { stableKey: item.stableKey, version: item.version } },
      select: { checksum: true },
    });
    if (current !== null) {
      if (current.checksum !== item.checksum) {
        throw new Error(`${item.stableKey}@${String(item.version)} имеет другой checksum`);
      }
      contentItemsUnchanged += 1;
      continue;
    }
    await transaction.contentItem.create({
      data: {
        stableKey: item.stableKey,
        version: item.version,
        topicId,
        kind: item.kind,
        title: item.title,
        ...(item.bodyMarkdown === undefined ? {} : { bodyMarkdown: item.bodyMarkdown }),
        ...(item.payload === undefined ? {} : { payload: toJson(item.payload) }),
        sourcePack: pack.manifest.key,
        sourceVersion: pack.manifest.version,
        checksum: item.checksum,
        status: contentStatusBySource[item.status],
      },
    });
    contentItemsCreated += 1;
  }

  const currentTasks = await transaction.task.findMany({
    where: { stableKey: { in: pack.tasks.map((task) => task.stableKey) } },
    select: { id: true, stableKey: true, topicId: true, kind: true, difficulty: true },
  });
  const currentTaskByKey = new Map(currentTasks.map((task) => [task.stableKey, task]));
  for (const task of pack.tasks) {
    const topicId = topicIdByKey.get(task.topicKey);
    if (topicId === undefined) {
      throw new Error(`Topic ${task.topicKey} не найден для task ${task.stableKey}`);
    }
    const current = currentTaskByKey.get(task.stableKey);
    if (
      current !== undefined &&
      (current.topicId !== topicId ||
        current.kind !== task.kind ||
        current.difficulty !== task.difficulty)
    ) {
      throw new Error(`Stable task ${task.stableKey} изменил topic/kind/difficulty`);
    }
    if (current === undefined) {
      const created = await transaction.task.create({
        data: {
          stableKey: task.stableKey,
          topicId,
          kind: task.kind,
          difficulty: task.difficulty,
          status: contentStatusBySource[task.status],
        },
        select: { id: true, stableKey: true, topicId: true, kind: true, difficulty: true },
      });
      currentTaskByKey.set(created.stableKey, created);
    } else {
      await transaction.task.update({
        where: { id: current.id },
        data: { status: contentStatusBySource[task.status] },
      });
    }
  }

  let taskVersionsCreated = 0;
  let taskVersionsUnchanged = 0;
  for (const task of pack.tasks) {
    const stableTask = currentTaskByKey.get(task.stableKey);
    if (stableTask === undefined) {
      throw new Error(`Task ${task.stableKey} не найден после upsert`);
    }
    const current = await transaction.taskVersion.findUnique({
      where: { taskId_version: { taskId: stableTask.id, version: task.version } },
      select: { checksum: true },
    });
    if (current !== null) {
      if (current.checksum !== task.checksum) {
        throw new Error(`${task.stableKey}@${String(task.version)} имеет другой checksum`);
      }
      taskVersionsUnchanged += 1;
      continue;
    }
    await transaction.taskVersion.create({
      data: {
        taskId: stableTask.id,
        version: task.version,
        promptMarkdown: task.promptMarkdown,
        ...(task.starterCode === undefined ? {} : { starterCode: task.starterCode }),
        ...(task.language === undefined ? {} : { language: task.language }),
        ...(task.options === undefined ? {} : { options: toJson(task.options) }),
        ...(task.expectedAnswer === undefined
          ? {}
          : { expectedAnswer: toJson(task.expectedAnswer) }),
        rubric: toJson(task.rubric),
        hints: toJson(task.hints),
        acceptanceCriteria: toJson(task.acceptanceCriteria),
        metadata: toJson(task.metadata),
        sourcePack: pack.manifest.key,
        sourceVersion: pack.manifest.version,
        checksum: task.checksum,
        publishedAt: new Date(`${pack.manifest.createdAt}T00:00:00.000Z`),
        testCases: {
          create: task.testCases.map((testCase) => ({
            name: testCase.name,
            ...(testCase.input === undefined ? {} : { input: toJson(testCase.input) }),
            ...(testCase.expected === undefined ? {} : { expected: toJson(testCase.expected) }),
            testCode: testCase.testCode,
            hidden: testCase.hidden,
            position: testCase.position,
          })),
        },
      },
    });
    taskVersionsCreated += 1;
  }

  const taskVersions = await transaction.taskVersion.findMany({
    where: {
      OR: pack.tasks.map((task) => ({
        version: task.version,
        task: { stableKey: task.stableKey },
      })),
    },
    select: { id: true, version: true, task: { select: { stableKey: true } } },
  });
  const taskVersionIdByKey = new Map(
    taskVersions.map((taskVersion) => [
      `${taskVersion.task.stableKey}@${String(taskVersion.version)}`,
      taskVersion.id,
    ]),
  );

  let assessmentsCreated = 0;
  let assessmentsUnchanged = 0;
  for (const assessment of pack.assessments) {
    const current = await transaction.assessmentBlueprint.findUnique({
      where: { key_version: { key: assessment.key, version: assessment.version } },
      select: { checksum: true },
    });
    if (current !== null) {
      if (current.checksum !== assessment.checksum) {
        throw new Error(`${assessment.key}@${String(assessment.version)} имеет другой checksum`);
      }
      assessmentsUnchanged += 1;
      continue;
    }
    await transaction.assessmentBlueprint.create({
      data: {
        key: assessment.key,
        version: assessment.version,
        title: assessment.title,
        description: assessment.description,
        totalBlocks: assessment.totalBlocks,
        estimatedMin: assessment.estimatedMin,
        selectionRules: toJson(assessment.selectionRules),
        sourcePack: pack.manifest.key,
        sourceVersion: pack.manifest.version,
        checksum: assessment.checksum,
        status: contentStatusBySource[assessment.status],
        items: {
          create: assessment.items.map((item) => {
            const taskVersionId = taskVersionIdByKey.get(
              `${item.taskKey}@${String(item.taskVersion)}`,
            );
            if (taskVersionId === undefined) {
              throw new Error(
                `TaskVersion ${item.taskKey}@${String(item.taskVersion)} не найден для blueprint`,
              );
            }
            return {
              taskVersionId,
              blockIndex: item.blockIndex,
              position: item.position,
              required: item.required,
              ...(item.dimensionWeights === undefined
                ? {}
                : { dimensionWeights: toJson(item.dimensionWeights) }),
            };
          }),
        },
      },
    });
    assessmentsCreated += 1;
  }

  let sequencesCreated = 0;
  let sequencesUnchanged = 0;
  for (const sequence of pack.sequences) {
    const topicId = topicIdByKey.get(sequence.topicKey);
    if (topicId === undefined) {
      throw new Error(`Topic ${sequence.topicKey} не найден для sequence ${sequence.key}`);
    }
    const current = await transaction.learningSequenceBlueprint.findUnique({
      where: { key_version: { key: sequence.key, version: sequence.version } },
      select: { checksum: true },
    });
    if (current !== null) {
      if (current.checksum !== sequence.checksum) {
        throw new Error(`${sequence.key}@${String(sequence.version)} имеет другой checksum`);
      }
      sequencesUnchanged += 1;
      continue;
    }
    await transaction.learningSequenceBlueprint.create({
      data: {
        key: sequence.key,
        version: sequence.version,
        topicId,
        schemaVersion: sequence.schemaVersion,
        phase: sequence.phase,
        estimatedMinutes: sequence.estimatedMinutes,
        steps: toJson(sequence.steps),
        completionRule: toJson(sequence.completionRule),
        sourcePack: pack.manifest.key,
        sourceVersion: pack.manifest.version,
        checksum: sequence.checksum,
      },
    });
    sequencesCreated += 1;
  }

  await transaction.contentPack.create({
    data: {
      key: pack.manifest.key,
      version: pack.manifest.version,
      locale: pack.manifest.locale,
      status: contentStatusBySource[pack.manifest.status],
      checksum: pack.checksum,
      manifest: toJson(pack.manifest),
    },
  });

  return {
    packKey: pack.manifest.key,
    packVersion: pack.manifest.version,
    checksum: pack.checksum,
    alreadyImported: false,
    tracksUpserted,
    tracksReused,
    topicsUpserted,
    topicsReused,
    taskVersionsCreated,
    taskVersionsUnchanged,
    contentItemsCreated,
    contentItemsUnchanged,
    assessmentsCreated,
    assessmentsUnchanged,
    sequencesCreated,
    sequencesUnchanged,
  };
}

export async function importContentPack(
  prisma: PrismaClient,
  packOrPath: LoadedContentPack | string,
): Promise<ContentImportResult> {
  const pack = await resolvePack(packOrPath);
  const diff = await diffContentPack(prisma, pack);
  assertNoContentConflicts(diff);

  return prisma.$transaction((transaction) => importIntoTransaction(transaction, pack), {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 10_000,
    timeout: 60_000,
  });
}
