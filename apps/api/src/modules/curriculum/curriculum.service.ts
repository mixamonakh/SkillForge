import { Injectable } from '@nestjs/common';
import { DEFAULT_USER_ID, type TopicStatus } from '@skillforge/db';

import { notFound } from '../../common/api-error.js';
import { objectValue } from '../../common/json.js';
import { PrismaService } from '../../database/prisma.service.js';
import { ContentLibraryService } from './content-library.service.js';
import type { ContentQueryDto, TopicQueryDto } from './curriculum.dto.js';

type TopicRecord = Awaited<ReturnType<CurriculumService['loadTopics']>>[number];

function relevance(metadata: unknown): number {
  const value = objectValue(metadata).yandexRelevance;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function topicSummary(topic: TopicRecord) {
  const state = topic.topicStates[0];
  return {
    key: topic.key,
    title: topic.title,
    shortDescription: topic.shortDescription,
    trackKey: topic.track.key,
    trackTitle: topic.track.title,
    status: state?.status ?? 'UNKNOWN',
    masteryEstimate: state?.masteryEstimate ?? null,
    masteryConfidence: state?.masteryConfidence ?? 0,
    evidenceCount: state?.evidenceCount ?? 0,
    needsReview: state?.needsReview ?? false,
    nextReviewAt: state?.nextReviewAt?.toISOString() ?? null,
    targetRelevance: relevance(topic.metadata),
    prerequisites: topic.prerequisites.map(({ prerequisite }) => ({
      key: prerequisite.key,
      title: prerequisite.title,
    })),
  };
}

@Injectable()
export class CurriculumService {
  public constructor(
    private readonly database: PrismaService,
    private readonly library: ContentLibraryService,
  ) {}

  public async tracks(): Promise<unknown[]> {
    const tracks = await this.database.client.track.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { position: 'asc' },
      include: {
        topics: {
          where: { status: 'ACTIVE' },
          include: { topicStates: { where: { userId: DEFAULT_USER_ID } } },
        },
      },
    });
    return tracks.map((track) => {
      const assessed = track.topics.filter(
        (topic) =>
          topic.topicStates[0]?.status !== undefined && topic.topicStates[0]?.status !== 'UNKNOWN',
      ).length;
      return {
        key: track.key,
        title: track.title,
        description: track.description,
        position: track.position,
        sourceVersion: track.sourceVersion,
        coverage: { assessed, total: track.topics.length },
      };
    });
  }

  public async track(trackKey: string): Promise<unknown> {
    const track = await this.database.client.track.findUnique({
      where: { key: trackKey },
      include: { topics: { where: { status: 'ACTIVE' }, orderBy: { position: 'asc' } } },
    });
    if (!track) throw notFound('TRACK_NOT_FOUND', 'Трек не найден');
    return {
      key: track.key,
      title: track.title,
      description: track.description,
      sourcePack: track.sourcePack,
      sourceVersion: track.sourceVersion,
      topics: track.topics.map((topic) => ({ key: topic.key, title: topic.title })),
    };
  }

  private loadTopics(query: TopicQueryDto = {}) {
    return this.database.client.topic.findMany({
      where: {
        status: 'ACTIVE',
        ...(query.track ? { track: { key: query.track } } : {}),
        ...(query.search
          ? {
              OR: [
                { key: { contains: query.search, mode: 'insensitive' as const } },
                { title: { contains: query.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
        ...(query.status || query.reviewDue !== undefined
          ? {
              topicStates: {
                some: {
                  userId: DEFAULT_USER_ID,
                  ...(query.status ? { status: query.status as TopicStatus } : {}),
                  ...(query.reviewDue === undefined ? {} : { needsReview: query.reviewDue }),
                },
              },
            }
          : {}),
      },
      orderBy: [{ track: { position: 'asc' } }, { position: 'asc' }],
      include: {
        track: true,
        topicStates: { where: { userId: DEFAULT_USER_ID }, take: 1 },
        prerequisites: {
          include: { prerequisite: { select: { key: true, title: true } } },
        },
      },
    });
  }

  public async topics(query: TopicQueryDto): Promise<unknown[]> {
    return (await this.loadTopics(query)).map(topicSummary);
  }

  public async topic(topicKey: string): Promise<unknown> {
    const topic = await this.database.client.topic.findUnique({
      where: { key: topicKey },
      include: {
        track: true,
        topicStates: { where: { userId: DEFAULT_USER_ID }, take: 1 },
        prerequisites: {
          include: { prerequisite: { select: { key: true, title: true } } },
        },
        contentItems: {
          where: { status: 'ACTIVE' },
          orderBy: [{ kind: 'asc' }, { stableKey: 'asc' }, { version: 'desc' }],
        },
        tasks: {
          where: { status: 'ACTIVE' },
          orderBy: { stableKey: 'asc' },
          include: { _count: { select: { versions: true } } },
        },
        evidence: {
          where: { userId: DEFAULT_USER_ID },
          orderBy: { occurredAt: 'desc' },
          take: 100,
        },
      },
    });
    if (!topic) throw notFound('TOPIC_NOT_FOUND', 'Тема не найдена');
    const misconceptionFindings = await this.database.client.evaluationMisconception.findMany({
      where: {
        evaluation: {
          userId: DEFAULT_USER_ID,
          evidence: { some: { topicId: topic.id } },
          supersededBy: null,
        },
      },
      include: { misconception: true },
    });
    const misconceptionCounts = new Map<
      string,
      { key: string; title: string; count: number; remediation: string }
    >();
    for (const finding of misconceptionFindings) {
      const current = misconceptionCounts.get(finding.misconceptionId);
      misconceptionCounts.set(finding.misconceptionId, {
        key: finding.misconception.key,
        title: finding.misconception.title,
        count: (current?.count ?? 0) + 1,
        remediation: finding.remediation,
      });
    }
    const evidenceByKind = topic.evidence.reduce<Record<string, number>>((counts, item) => {
      counts[item.kind] = (counts[item.kind] ?? 0) + 1;
      return counts;
    }, {});
    const state = topic.topicStates[0];
    return {
      ...topicSummary(topic),
      whyImportant: topic.whyImportant,
      atWork: topic.atWork,
      atInterview: topic.atInterview,
      explanation: state?.explanation ?? null,
      misconceptions: [...misconceptionCounts.values()].sort(
        (left, right) => right.count - left.count || left.key.localeCompare(right.key),
      ),
      evidenceByKind,
      lastEvidenceAt: state?.lastEvidenceAt?.toISOString() ?? null,
      content: topic.contentItems.map((item) => ({
        id: item.id,
        kind: item.kind,
        title: item.title,
        bodyMarkdown: item.bodyMarkdown,
      })),
      tasks: topic.tasks.map((task) => ({
        stableKey: task.stableKey,
        kind: task.kind,
        difficulty: task.difficulty,
        versions: task._count.versions,
      })),
      evidence: topic.evidence.map((item) => ({
        id: item.id,
        kind: item.kind,
        normalizedScore: item.normalizedScore,
        weight: item.weight,
        occurredAt: item.occurredAt.toISOString(),
        provenance: item.provenance,
      })),
    };
  }

  public async evidence(topicKey: string): Promise<unknown[]> {
    const topic = await this.database.client.topic.findUnique({
      where: { key: topicKey },
      select: { id: true },
    });
    if (!topic) throw notFound('TOPIC_NOT_FOUND', 'Тема не найдена');
    const evidence = await this.database.client.evidence.findMany({
      where: { userId: DEFAULT_USER_ID, topicId: topic.id },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: 250,
    });
    return evidence.map((item) => ({ ...item, occurredAt: item.occurredAt.toISOString() }));
  }

  public async content(query: ContentQueryDto): Promise<unknown> {
    return this.library.content(query);
  }
}
