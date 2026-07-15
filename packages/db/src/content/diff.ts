import { createVersionImportPlan, type LoadedContentPack } from '@skillforge/content-schema';

import type { PrismaClient } from '../../generated/client/client.js';
import {
  areSemanticsEqual,
  normalizedPrerequisiteKeys,
  semanticChecksum,
  type TopicSemantics,
  type TrackSemantics,
} from './ownership.js';
import { contentStatusBySource, resolvePack } from './pack.js';

export type ContentDatabaseDiff = {
  pack: { key: string; version: string; checksum: string };
  alreadyImported: boolean;
  tracks: { create: number; update: number; reuse: number; conflicts: number };
  topics: { create: number; update: number; reuse: number; conflicts: number };
  tasks: { create: number; unchanged: number; conflicts: number };
  contentItems: { create: number; unchanged: number; conflicts: number };
  assessments: { create: number; unchanged: number; conflicts: number };
  sequences: { create: number; unchanged: number; conflicts: number };
  conflictDetails: Array<{
    kind:
      | 'track'
      | 'topic'
      | 'topic-dependency'
      | 'task'
      | 'content-item'
      | 'assessment'
      | 'sequence'
      | 'pack';
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
  const [
    existingPack,
    existingTracks,
    existingTopics,
    taskVersions,
    contentItems,
    assessments,
    sequences,
  ] = await Promise.all([
    prisma.contentPack.findUnique({
      where: { key_version: { key: pack.manifest.key, version: pack.manifest.version } },
      select: { checksum: true },
    }),
    prisma.track.findMany({
      where: { key: { in: pack.tracks.map((track) => track.key) } },
      select: {
        key: true,
        title: true,
        description: true,
        position: true,
        status: true,
        sourcePack: true,
      },
    }),
    prisma.topic.findMany({
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
    prisma.learningSequenceBlueprint.findMany({
      where: { key: { in: pack.sequences.map((sequence) => sequence.key) } },
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
  const sequencePlan = createVersionImportPlan(
    pack.sequences.map((sequence) => ({
      ...sequence,
      stableKey: sequence.key,
    })),
    sequences.map((sequence) => ({
      stableKey: sequence.key,
      version: sequence.version,
      checksum: sequence.checksum,
    })),
  );

  const existingTrackByKey = new Map(existingTracks.map((track) => [track.key, track]));
  let tracksCreate = 0;
  let tracksUpdate = 0;
  let tracksReuse = 0;
  let trackConflicts = 0;
  const ownershipConflicts: ContentDatabaseDiff['conflictDetails'] = [];
  for (const track of pack.tracks) {
    const current = existingTrackByKey.get(track.key);
    if (current === undefined) {
      tracksCreate += 1;
      continue;
    }
    if (current.sourcePack === pack.manifest.key) {
      tracksUpdate += 1;
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
    if (areSemanticsEqual(existingSemantics, incomingSemantics)) {
      tracksReuse += 1;
      continue;
    }

    trackConflicts += 1;
    ownershipConflicts.push({
      kind: 'track',
      stableKey: track.key,
      version: pack.manifest.version,
      existingChecksum: semanticChecksum(existingSemantics),
      incomingChecksum: semanticChecksum(incomingSemantics),
    });
  }

  const existingTopicByKey = new Map(existingTopics.map((topic) => [topic.key, topic]));
  let topicsCreate = 0;
  let topicsUpdate = 0;
  let topicsReuse = 0;
  let topicConflicts = 0;
  for (const topic of pack.topics) {
    const current = existingTopicByKey.get(topic.key);
    if (current === undefined) {
      topicsCreate += 1;
      continue;
    }
    if (current.sourcePack === pack.manifest.key) {
      topicsUpdate += 1;
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
    const baseMatches = areSemanticsEqual(existingSemantics, incomingSemantics);
    const dependenciesMatch = areSemanticsEqual(existingPrerequisites, incomingPrerequisites);
    if (baseMatches && dependenciesMatch) {
      topicsReuse += 1;
      continue;
    }

    topicConflicts += 1;
    ownershipConflicts.push({
      kind: baseMatches ? 'topic-dependency' : 'topic',
      stableKey: topic.key,
      version: pack.manifest.version,
      existingChecksum: semanticChecksum({
        ...existingSemantics,
        prerequisites: existingPrerequisites,
      }),
      incomingChecksum: semanticChecksum({
        ...incomingSemantics,
        prerequisites: incomingPrerequisites,
      }),
    });
  }

  const conflictDetails: ContentDatabaseDiff['conflictDetails'] = [
    ...ownershipConflicts,
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
    ...sequencePlan.conflicts.map((conflict) => ({
      kind: 'sequence' as const,
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
    tracks: {
      create: tracksCreate,
      update: tracksUpdate,
      reuse: tracksReuse,
      conflicts: trackConflicts,
    },
    topics: {
      create: topicsCreate,
      update: topicsUpdate,
      reuse: topicsReuse,
      conflicts: topicConflicts,
    },
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
    sequences: {
      create: sequencePlan.create.length,
      unchanged: sequencePlan.unchanged.length,
      conflicts: sequencePlan.conflicts.length,
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
