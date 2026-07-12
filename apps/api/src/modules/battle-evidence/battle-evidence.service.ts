import { Injectable } from '@nestjs/common';
import { DEFAULT_USER_ID, type EvidenceKind, Prisma } from '@skillforge/db';
import { DEFAULT_EVALUATOR_RELIABILITY } from '@skillforge/learning-engine';

import { asJsonInput, objectValue, stringArray } from '../../common/json.js';
import { conflict, notFound } from '../../common/api-error.js';
import { PrismaService } from '../../database/prisma.service.js';
import { MasteryService, initialEvidenceNormalization } from '../mastery/mastery.service.js';
import type {
  CreateExternalArtifactDto,
  ExternalArtifactPayloadDto,
  UpdateExternalArtifactDto,
} from './battle-evidence.dto.js';

const ARTIFACT_INCLUDE = {
  topicLinks: { include: { topic: { select: { key: true, defaultHalfLifeDays: true } } } },
  _count: { select: { evidence: true } },
} as const satisfies Prisma.ExternalArtifactInclude;

type ArtifactRecord = Prisma.ExternalArtifactGetPayload<{ include: typeof ARTIFACT_INCLUDE }>;

function clean(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

function artifactPayload(
  input: ExternalArtifactPayloadDto,
  topicKeys: readonly string[],
): Record<string, unknown> {
  return {
    topicKeys: [...topicKeys],
    ...(input.codeDiff === undefined ? {} : { codeDiff: input.codeDiff }),
    ...(input.checked === undefined ? {} : { checked: input.checked }),
    ...(input.externalAnalysis === undefined ? {} : { externalAnalysis: input.externalAnalysis }),
  };
}

@Injectable()
export class BattleEvidenceService {
  public constructor(
    private readonly database: PrismaService,
    private readonly mastery: MasteryService,
  ) {}

  public async create(input: CreateExternalArtifactDto): Promise<unknown> {
    const topics = await this.resolveTopics(input.payload.topicKeys);
    const artifact = await this.database.client.externalArtifact.create({
      data: {
        userId: DEFAULT_USER_ID,
        title: input.title.trim(),
        sourceType: input.sourceType,
        projectName: clean(input.projectName),
        repositoryUrl: clean(input.repositoryUrl),
        resultUrl: clean(input.resultUrl),
        description: input.description.trim(),
        acceptanceCriteria: asJsonInput(input.acceptanceCriteria.map((item) => item.trim())),
        beforeNotes: clean(input.beforeNotes),
        afterNotes: clean(input.afterNotes),
        aiUsageNotes: clean(input.aiUsageNotes),
        payload: asJsonInput(
          artifactPayload(
            input.payload,
            topics.map((topic) => topic.key),
          ),
        ),
        occurredAt: new Date(input.occurredAt),
        topicLinks: { create: topics.map((topic) => ({ topicId: topic.id })) },
      },
      include: ARTIFACT_INCLUDE,
    });
    return this.serialize(artifact);
  }

  public async list(): Promise<unknown[]> {
    const artifacts = await this.database.client.externalArtifact.findMany({
      where: { userId: DEFAULT_USER_ID },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: 100,
      include: ARTIFACT_INCLUDE,
    });
    return artifacts.map((artifact) => this.serialize(artifact));
  }

  public async get(id: string): Promise<unknown> {
    return this.serialize(await this.requireArtifact(id));
  }

  public async update(id: string, input: UpdateExternalArtifactDto): Promise<unknown> {
    const current = await this.requireArtifact(id);
    if (
      current._count.evidence > 0 &&
      ((input.sourceType !== undefined && input.sourceType !== current.sourceType) ||
        input.payload !== undefined)
    ) {
      throw conflict(
        'EXTERNAL_ARTIFACT_EVIDENCE_IMMUTABLE',
        'Нельзя менять источник или связанные темы после создания evidence',
      );
    }
    const topics = input.payload ? await this.resolveTopics(input.payload.topicKeys) : null;
    const artifact = await this.database.client.externalArtifact.update({
      where: { id },
      data: {
        ...(input.title === undefined ? {} : { title: input.title.trim() }),
        ...(input.sourceType === undefined ? {} : { sourceType: input.sourceType }),
        ...(input.projectName === undefined ? {} : { projectName: clean(input.projectName) }),
        ...(input.repositoryUrl === undefined ? {} : { repositoryUrl: clean(input.repositoryUrl) }),
        ...(input.resultUrl === undefined ? {} : { resultUrl: clean(input.resultUrl) }),
        ...(input.description === undefined ? {} : { description: input.description.trim() }),
        ...(input.acceptanceCriteria === undefined
          ? {}
          : {
              acceptanceCriteria: asJsonInput(input.acceptanceCriteria.map((item) => item.trim())),
            }),
        ...(input.beforeNotes === undefined ? {} : { beforeNotes: clean(input.beforeNotes) }),
        ...(input.afterNotes === undefined ? {} : { afterNotes: clean(input.afterNotes) }),
        ...(input.aiUsageNotes === undefined ? {} : { aiUsageNotes: clean(input.aiUsageNotes) }),
        ...(input.occurredAt === undefined ? {} : { occurredAt: new Date(input.occurredAt) }),
        ...(input.payload === undefined
          ? {}
          : {
              payload: asJsonInput(
                artifactPayload(input.payload, topics?.map((topic) => topic.key) ?? []),
              ),
              topicLinks: {
                deleteMany: {},
                create: topics?.map((topic) => ({ topicId: topic.id })) ?? [],
              },
            }),
      },
      include: ARTIFACT_INCLUDE,
    });
    return this.serialize(artifact);
  }

  public async remove(id: string): Promise<{ deleted: true }> {
    const artifact = await this.requireArtifact(id);
    if (artifact._count.evidence > 0) {
      throw conflict(
        'EXTERNAL_ARTIFACT_HAS_EVIDENCE',
        'Нельзя удалить результат, из которого уже создано evidence',
      );
    }
    await this.database.client.externalArtifact.delete({ where: { id } });
    return { deleted: true };
  }

  public async createEvidence(id: string): Promise<unknown> {
    return this.database.client.$transaction(async (transaction) => {
      const artifact = await transaction.externalArtifact.findFirst({
        where: { id, userId: DEFAULT_USER_ID },
        include: ARTIFACT_INCLUDE,
      });
      if (!artifact) throw notFound('EXTERNAL_ARTIFACT_NOT_FOUND', 'Внешний результат не найден');
      const kind: EvidenceKind = artifact.sourceType === 'LEETCODE' ? 'BATTLE' : 'TRANSFER';
      for (const link of artifact.topicLinks) {
        const normalized = initialEvidenceNormalization({
          rawScore: 100,
          reliability: DEFAULT_EVALUATOR_RELIABILITY.MANUAL,
          kind,
          helpLevel: 'NONE',
          halfLifeDays: link.topic.defaultHalfLifeDays,
        });
        await transaction.evidence.upsert({
          where: {
            externalArtifactId_topicId_kind: {
              externalArtifactId: artifact.id,
              topicId: link.topicId,
              kind,
            },
          },
          create: {
            userId: DEFAULT_USER_ID,
            topicId: link.topicId,
            externalArtifactId: artifact.id,
            kind,
            rawScore: 100,
            normalizedScore: normalized.normalizedScore,
            weight: normalized.weight,
            occurredAt: artifact.occurredAt,
            provenance: asJsonInput({
              externalArtifactId: artifact.id,
              confirmation: 'MANUAL',
              reliability: DEFAULT_EVALUATOR_RELIABILITY.MANUAL,
              sourceType: artifact.sourceType,
              resultUrl: artifact.resultUrl,
              acceptanceCriteria: stringArray(artifact.acceptanceCriteria),
            }),
          },
          update: {},
        });
      }
      await this.mastery.recomputeWithin(
        transaction,
        artifact.topicLinks.map((link) => link.topicId),
      );
      return {
        artifactId: artifact.id,
        kind,
        evidenceCount: artifact.topicLinks.length,
        idempotent: artifact._count.evidence > 0,
      };
    });
  }

  private async resolveTopics(topicKeys: readonly string[]) {
    const uniqueKeys = [...new Set(topicKeys.map((key) => key.trim()).filter(Boolean))];
    const topics = await this.database.client.topic.findMany({
      where: { key: { in: uniqueKeys }, status: 'ACTIVE' },
      select: { id: true, key: true },
    });
    const found = new Set(topics.map((topic) => topic.key));
    const unknown = uniqueKeys.filter((key) => !found.has(key));
    if (unknown.length > 0) {
      throw notFound(
        'EXTERNAL_ARTIFACT_TOPICS_NOT_FOUND',
        `Темы не найдены: ${unknown.join(', ')}`,
      );
    }
    return topics.sort(
      (left, right) => uniqueKeys.indexOf(left.key) - uniqueKeys.indexOf(right.key),
    );
  }

  private async requireArtifact(id: string): Promise<ArtifactRecord> {
    const artifact = await this.database.client.externalArtifact.findFirst({
      where: { id, userId: DEFAULT_USER_ID },
      include: ARTIFACT_INCLUDE,
    });
    if (!artifact) throw notFound('EXTERNAL_ARTIFACT_NOT_FOUND', 'Внешний результат не найден');
    return artifact;
  }

  private serialize(artifact: ArtifactRecord): unknown {
    const payload = objectValue(artifact.payload);
    return {
      id: artifact.id,
      title: artifact.title,
      sourceType: artifact.sourceType,
      projectName: artifact.projectName,
      repositoryUrl: artifact.repositoryUrl,
      resultUrl: artifact.resultUrl,
      description: artifact.description,
      acceptanceCriteria: stringArray(artifact.acceptanceCriteria),
      beforeNotes: artifact.beforeNotes,
      afterNotes: artifact.afterNotes,
      aiUsageNotes: artifact.aiUsageNotes,
      payload: { ...payload, topicKeys: artifact.topicLinks.map((link) => link.topic.key) },
      occurredAt: artifact.occurredAt.toISOString(),
      createdAt: artifact.createdAt.toISOString(),
      updatedAt: artifact.updatedAt.toISOString(),
      evidenceCount: artifact._count.evidence,
    };
  }
}
