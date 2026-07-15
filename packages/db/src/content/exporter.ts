import type { PrismaClient } from '../../generated/client/client.js';

export async function exportContentPackSnapshot(prisma: PrismaClient) {
  const [packs, tracks, topics, contentItems, tasks, assessments, sequences] = await Promise.all([
    prisma.contentPack.findMany({ orderBy: [{ key: 'asc' }, { version: 'asc' }] }),
    prisma.track.findMany({ orderBy: [{ position: 'asc' }, { key: 'asc' }] }),
    prisma.topic.findMany({
      orderBy: [{ track: { position: 'asc' } }, { position: 'asc' }, { key: 'asc' }],
      include: {
        track: { select: { key: true } },
        prerequisites: {
          include: { prerequisite: { select: { key: true } } },
          orderBy: { prerequisite: { key: 'asc' } },
        },
      },
    }),
    prisma.contentItem.findMany({
      orderBy: [{ stableKey: 'asc' }, { version: 'asc' }],
      include: { topic: { select: { key: true } } },
    }),
    prisma.task.findMany({
      orderBy: { stableKey: 'asc' },
      include: {
        topic: { select: { key: true } },
        versions: {
          orderBy: { version: 'asc' },
          include: { testCases: { orderBy: { position: 'asc' } } },
        },
      },
    }),
    prisma.assessmentBlueprint.findMany({
      orderBy: [{ key: 'asc' }, { version: 'asc' }],
      include: {
        items: {
          orderBy: [{ blockIndex: 'asc' }, { position: 'asc' }],
          include: {
            taskVersion: { include: { task: { select: { stableKey: true } } } },
          },
        },
      },
    }),
    prisma.learningSequenceBlueprint.findMany({
      orderBy: [{ key: 'asc' }, { version: 'asc' }],
      include: { topic: { select: { key: true } } },
    }),
  ]);

  return {
    schemaVersion: '1.0',
    exportedAt: new Date().toISOString(),
    packs,
    tracks,
    topics: topics.map((topic) => ({
      ...topic,
      trackKey: topic.track.key,
      track: undefined,
      prerequisiteKeys: topic.prerequisites.map((dependency) => dependency.prerequisite.key),
      prerequisites: undefined,
    })),
    contentItems: contentItems.map((item) => ({
      ...item,
      topicKey: item.topic.key,
      topic: undefined,
    })),
    tasks: tasks.map((task) => ({
      ...task,
      topicKey: task.topic.key,
      topic: undefined,
    })),
    assessments: assessments.map((assessment) => ({
      ...assessment,
      items: assessment.items.map((item) => ({
        ...item,
        taskKey: item.taskVersion.task.stableKey,
        taskVersionNumber: item.taskVersion.version,
        taskVersion: undefined,
      })),
    })),
    sequences: sequences.map((sequence) => ({
      ...sequence,
      topicKey: sequence.topic.key,
      topic: undefined,
    })),
  };
}

export type ContentPackSnapshot = Awaited<ReturnType<typeof exportContentPackSnapshot>>;
