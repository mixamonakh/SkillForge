import { Injectable } from '@nestjs/common';
import { DEFAULT_USER_ID } from '@skillforge/db';
import {
  CAPABILITY_PROFILE_ALGORITHM_VERSION,
  computeTopicCapabilityProfile,
  type CapabilityCoverage,
  type CapabilityEvidenceInput,
  type TopicCapabilityProfile,
} from '@skillforge/learning-engine';

import { notFound } from '../../common/api-error.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  capabilityInputFromEvidence,
  pendingCapabilityInput,
  type CapabilityAttemptSource,
} from './capability-evidence.js';

type TopicDescriptor = {
  id: string;
  key: string;
  defaultHalfLifeDays: number;
};

export type UserCapabilitySummary = {
  algorithmVersion: string;
  topics: TopicCapabilityProfile[];
  coverage: {
    topicCount: number;
    capabilityStates: Record<CapabilityCoverage, number>;
  };
};

@Injectable()
export class CapabilityProjectionService {
  public constructor(private readonly database: PrismaService) {}

  public async topicProfile(topicKey: string): Promise<TopicCapabilityProfile> {
    const topic = await this.database.client.topic.findUnique({
      where: { key: topicKey },
      select: { id: true, key: true, defaultHalfLifeDays: true },
    });
    if (!topic) throw notFound('TOPIC_NOT_FOUND', 'Тема не найдена');

    const inputs = await this.inputsByTopic([topic]);
    return computeTopicCapabilityProfile(topic.key, inputs.get(topic.id) ?? []);
  }

  public async userSummary(): Promise<UserCapabilitySummary> {
    const topics = await this.database.client.topic.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ track: { position: 'asc' } }, { position: 'asc' }],
      select: { id: true, key: true, defaultHalfLifeDays: true },
    });
    const inputs = await this.inputsByTopic(topics);
    const profiles = topics.map((topic) =>
      computeTopicCapabilityProfile(topic.key, inputs.get(topic.id) ?? []),
    );
    const capabilityStates: Record<CapabilityCoverage, number> = {
      NOT_TESTED: 0,
      INSUFFICIENT: 0,
      SUFFICIENT: 0,
    };
    for (const profile of profiles) {
      for (const state of Object.values(profile.capabilities)) {
        capabilityStates[state.coverage] += 1;
      }
    }

    return {
      algorithmVersion: CAPABILITY_PROFILE_ALGORITHM_VERSION,
      topics: profiles,
      coverage: { topicCount: topics.length, capabilityStates },
    };
  }

  private async inputsByTopic(
    topics: readonly TopicDescriptor[],
  ): Promise<Map<string, CapabilityEvidenceInput[]>> {
    const result = new Map(topics.map((topic) => [topic.id, [] as CapabilityEvidenceInput[]]));
    if (topics.length === 0) return result;

    const topicIds = topics.map((topic) => topic.id);
    const halfLifeByTopic = new Map(
      topics.map((topic) => [topic.id, topic.defaultHalfLifeDays] as const),
    );
    const [evidence, attempts] = await Promise.all([
      this.database.client.evidence.findMany({
        where: {
          userId: DEFAULT_USER_ID,
          topicId: { in: topicIds },
          OR: [
            { evaluationId: null },
            {
              evaluation: {
                userId: DEFAULT_USER_ID,
                supersededBy: null,
                attempt: { userId: DEFAULT_USER_ID },
              },
            },
          ],
        },
        orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
        select: {
          topicId: true,
          kind: true,
          rawScore: true,
          occurredAt: true,
          provenance: true,
          evaluation: {
            select: {
              evaluatorType: true,
              reliability: true,
              passed: true,
              attempt: {
                select: {
                  helpLevel: true,
                  taskVersion: {
                    select: { metadata: true, task: { select: { kind: true } } },
                  },
                },
              },
            },
          },
        },
      }),
      this.database.client.attempt.findMany({
        where: {
          userId: DEFAULT_USER_ID,
          submittedAt: { not: null },
          taskVersion: { task: { topicId: { in: topicIds } } },
        },
        orderBy: [{ submittedAt: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          sessionItemId: true,
          sequence: true,
          helpLevel: true,
          submittedAt: true,
          taskVersion: {
            select: {
              metadata: true,
              rubric: true,
              task: { select: { topicId: true, kind: true } },
            },
          },
          evaluations: {
            where: { userId: DEFAULT_USER_ID, supersededBy: null },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { evaluatorType: true, dimensionScores: true, rubricResult: true },
          },
        },
      }),
    ]);

    for (const item of evidence) {
      const halfLifeDays = halfLifeByTopic.get(item.topicId);
      if (halfLifeDays === undefined) continue;
      result.get(item.topicId)?.push(capabilityInputFromEvidence(item, halfLifeDays));
    }

    const latestSequenceBySessionItem = new Map<string, number>();
    for (const attempt of attempts) {
      if (attempt.sessionItemId === null) continue;
      latestSequenceBySessionItem.set(
        attempt.sessionItemId,
        Math.max(latestSequenceBySessionItem.get(attempt.sessionItemId) ?? 0, attempt.sequence),
      );
    }
    for (const attempt of attempts) {
      if (attempt.submittedAt === null) continue;
      if (
        attempt.sessionItemId !== null &&
        attempt.sequence < (latestSequenceBySessionItem.get(attempt.sessionItemId) ?? 0)
      ) {
        continue;
      }
      const topicId = attempt.taskVersion.task.topicId;
      const halfLifeDays = halfLifeByTopic.get(topicId);
      if (halfLifeDays === undefined) continue;
      const source: CapabilityAttemptSource = {
        topicId,
        taskKind: attempt.taskVersion.task.kind,
        metadata: attempt.taskVersion.metadata,
        rubric: attempt.taskVersion.rubric,
        helpLevel: attempt.helpLevel,
        submittedAt: attempt.submittedAt,
        evaluation: attempt.evaluations[0] ?? null,
      };
      const pending = pendingCapabilityInput(source, halfLifeDays);
      if (pending !== null) result.get(topicId)?.push(pending);
    }

    return result;
  }
}
