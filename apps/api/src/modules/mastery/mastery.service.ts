import { Injectable } from '@nestjs/common';
import {
  DEFAULT_USER_ID,
  type EvidenceKind,
  type HelpLevel,
  Prisma,
  type TaskKind,
} from '@skillforge/db';
import {
  DEFAULT_EVALUATOR_RELIABILITY,
  EVIDENCE_TYPE_WEIGHTS,
  MASTERY_ALGORITHM_VERSION,
  computeTopicState,
  normalizeEvidence,
  type TopicEvidenceInput,
  type TopicStateResult,
} from '@skillforge/learning-engine';

import { asJsonInput, objectValue } from '../../common/json.js';
import { PrismaService } from '../../database/prisma.service.js';

export function evidenceKindForTask(kind: TaskKind): EvidenceKind {
  switch (kind) {
    case 'CODE':
      return 'CODE_CORRECTNESS';
    case 'FIND_BUG':
      return 'DEBUGGING';
    case 'PREDICT_OUTPUT':
      return 'PREDICT_OUTPUT';
    case 'AI_REVIEW':
      return 'AI_REVIEW';
    case 'EXPLAIN':
    case 'COMPARE_SOLUTIONS':
      return 'EXPLANATION';
    case 'SINGLE_CHOICE':
    case 'MULTIPLE_CHOICE':
    case 'FLASHCARD':
      return 'RECALL';
  }
}

export function initialEvidenceNormalization(input: {
  rawScore: number;
  reliability: number;
  kind: EvidenceKind;
  helpLevel: HelpLevel;
  halfLifeDays: number;
}): { normalizedScore: number; weight: number } {
  return normalizeEvidence({
    rawScore: input.rawScore,
    evaluatorReliability: input.reliability,
    evidenceTypeWeight: EVIDENCE_TYPE_WEIGHTS[input.kind],
    helpLevel: input.helpLevel,
    ageDays: 0,
    halfLifeDays: input.halfLifeDays,
  });
}

@Injectable()
export class MasteryService {
  public constructor(private readonly database: PrismaService) {}

  public async recomputeTopicIds(topicIds: readonly string[]): Promise<void> {
    if (topicIds.length === 0) return;
    await this.database.client.$transaction((transaction) =>
      this.recomputeWithin(transaction, topicIds),
    );
  }

  public async recomputeWithin(
    transaction: Prisma.TransactionClient,
    topicIds: readonly string[],
    options: { overloaded?: boolean } = {},
  ): Promise<void> {
    const uniqueIds = [...new Set(topicIds)];
    for (const topicId of uniqueIds) {
      const state = await this.projectWithin(transaction, topicId, [], options);
      if (!state) continue;
      await transaction.topicState.upsert({
        where: { userId_topicId: { userId: DEFAULT_USER_ID, topicId } },
        create: {
          userId: DEFAULT_USER_ID,
          topicId,
          status: state.status,
          masteryEstimate: state.masteryEstimate,
          masteryConfidence: state.masteryConfidence,
          evidenceWeight: state.evidenceWeight,
          evidenceCount: state.evidenceCount,
          independentDays: state.independentDays,
          taskKindCount: state.taskKindCount,
          needsReview: state.needsReview,
          lastEvidenceAt: state.lastEvidenceAt ? new Date(state.lastEvidenceAt) : null,
          nextReviewAt: state.nextReviewAt ? new Date(state.nextReviewAt) : null,
          algorithmVersion: state.algorithmVersion,
          explanation: asJsonInput(state.explanation),
        },
        update: {
          status: state.status,
          masteryEstimate: state.masteryEstimate,
          masteryConfidence: state.masteryConfidence,
          evidenceWeight: state.evidenceWeight,
          evidenceCount: state.evidenceCount,
          independentDays: state.independentDays,
          taskKindCount: state.taskKindCount,
          needsReview: state.needsReview,
          lastEvidenceAt: state.lastEvidenceAt ? new Date(state.lastEvidenceAt) : null,
          nextReviewAt: state.nextReviewAt ? new Date(state.nextReviewAt) : null,
          algorithmVersion: state.algorithmVersion,
          explanation: asJsonInput(state.explanation),
        },
      });
      await transaction.reviewSchedule.deleteMany({
        where: { userId: DEFAULT_USER_ID, topicId, completedAt: null },
      });
      if (state.reviewSchedule) {
        await transaction.reviewSchedule.create({
          data: {
            userId: DEFAULT_USER_ID,
            topicId,
            dueAt: new Date(state.reviewSchedule.dueAt),
            reason: state.reviewSchedule.reason,
            intervalDays: state.reviewSchedule.intervalDays,
            algorithmVersion: state.reviewSchedule.algorithmVersion,
          },
        });
      }
    }
  }

  public async projectWithin(
    transaction: Prisma.TransactionClient,
    topicId: string,
    additions: readonly TopicEvidenceInput[] = [],
    options: { overloaded?: boolean } = {},
  ): Promise<TopicStateResult | null> {
    const topic = await transaction.topic.findUnique({
      where: { id: topicId },
      select: { id: true, defaultHalfLifeDays: true },
    });
    if (!topic) return null;
    const evidence = await transaction.evidence.findMany({
      where: {
        userId: DEFAULT_USER_ID,
        topicId,
        OR: [{ evaluationId: null }, { evaluation: { supersededBy: null } }],
      },
      orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
      include: {
        evaluation: {
          include: {
            attempt: {
              include: {
                taskVersion: { include: { task: { select: { kind: true, difficulty: true } } } },
              },
            },
          },
        },
      },
    });
    const engineInput: TopicEvidenceInput[] = evidence.map((item) => {
      const provenance = objectValue(item.provenance);
      const evaluation = item.evaluation;
      const attempt = evaluation?.attempt;
      const evaluatorType = evaluation?.evaluatorType ?? 'MANUAL';
      const evaluatorReliability =
        evaluation?.reliability ??
        (typeof provenance.reliability === 'number'
          ? provenance.reliability
          : DEFAULT_EVALUATOR_RELIABILITY[evaluatorType]);
      return {
        id: item.id,
        ...(attempt ? { attemptId: attempt.id } : {}),
        rawScore: item.rawScore,
        evaluatorType,
        evaluatorReliability,
        kind: item.kind,
        helpLevel: attempt?.helpLevel ?? 'NONE',
        occurredAt: item.occurredAt,
        halfLifeDays: topic.defaultHalfLifeDays,
        ...(attempt ? { taskKind: attempt.taskVersion.task.kind } : {}),
        ...(attempt ? { difficulty: attempt.taskVersion.task.difficulty } : {}),
        ...(evaluation?.passed === undefined ? {} : { passed: evaluation.passed }),
        submitted: attempt ? attempt.submittedAt !== null : true,
      };
    });
    return computeTopicState([...engineInput, ...additions], { now: new Date(), ...options });
  }

  public async snapshotWithin(
    transaction: Prisma.TransactionClient,
    scope: string,
    values: unknown,
  ): Promise<void> {
    await transaction.metricSnapshot.create({
      data: {
        userId: DEFAULT_USER_ID,
        algorithmVersion: MASTERY_ALGORITHM_VERSION,
        scope,
        values: asJsonInput(values),
      },
    });
  }
}
