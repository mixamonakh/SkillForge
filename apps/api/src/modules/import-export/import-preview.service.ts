import { Injectable } from '@nestjs/common';
import { SkillForgeAnalysisV1 } from '@skillforge/contracts';
import { DEFAULT_USER_ID } from '@skillforge/db';
import type { TopicEvidenceInput } from '@skillforge/learning-engine';

import { invalidState, notFound } from '../../common/api-error.js';
import { asJsonInput } from '../../common/json.js';
import { PrismaService } from '../../database/prisma.service.js';
import { MasteryService } from '../mastery/mastery.service.js';
import { suppressedExternalEvaluationEffect } from './external-evaluation-policy.js';
import { parseImportSourceScope } from './import-source-scope.js';

@Injectable()
export class ImportPreviewService {
  public constructor(
    private readonly database: PrismaService,
    private readonly mastery: MasteryService,
  ) {}

  public async preview(importId: string): Promise<unknown> {
    const batch = await this.database.client.importBatch.findFirst({
      where: { id: importId, userId: DEFAULT_USER_ID },
    });
    if (!batch) throw notFound('IMPORT_NOT_FOUND', 'Import batch не найден');
    if (batch.status === 'APPLIED' && batch.preview) return batch.preview;
    if (!['VALIDATED', 'PREVIEWED'].includes(batch.status)) {
      throw invalidState('IMPORT_NOT_VALIDATED', 'Import должен сначала пройти schema validation');
    }
    const parsed = SkillForgeAnalysisV1.safeParse(batch.normalized);
    if (!parsed.success) {
      throw invalidState('IMPORT_NORMALIZED_INVALID', 'Normalized import не соответствует schema');
    }
    const analysis = parsed.data;
    const attemptIds = analysis.attemptEvaluations.map((item) => item.attemptId);
    const topicKeys = [
      ...new Set(
        analysis.attemptEvaluations.flatMap((evaluation) =>
          evaluation.topicEvidence.map((item) => item.topicKey),
        ),
      ),
    ];
    const sourceBundle = await this.database.client.exportBundle.findFirst({
      where: { id: analysis.sourceBundleId, userId: DEFAULT_USER_ID },
      select: { payload: true },
    });
    const sourceScope = parseImportSourceScope(sourceBundle?.payload);
    const allowedAttemptIds = sourceScope
      ? attemptIds.filter((id) => sourceScope.attemptTopicById.has(id))
      : [];
    const allowedTopicKeys = sourceScope
      ? topicKeys.filter((key) => sourceScope.topicKeys.has(key))
      : [];
    const [attempts, topics] = await Promise.all([
      this.database.client.attempt.findMany({
        where: { userId: DEFAULT_USER_ID, id: { in: allowedAttemptIds } },
        include: {
          taskVersion: { include: { task: true } },
          session: {
            select: { assessmentRun: { select: { snapshot: true } } },
          },
        },
      }),
      this.database.client.topic.findMany({
        where: { key: { in: allowedTopicKeys } },
        include: { topicStates: { where: { userId: DEFAULT_USER_ID }, take: 1 } },
      }),
    ]);
    const attemptById = new Map(attempts.map((attempt) => [attempt.id, attempt]));
    const topicByKey = new Map(topics.map((topic) => [topic.key, topic]));
    const suppressedEvaluationEffects = analysis.attemptEvaluations.flatMap((evaluation) => {
      const attempt = attemptById.get(evaluation.attemptId);
      if (!attempt) return [];
      const effect = suppressedExternalEvaluationEffect({
        attemptId: attempt.id,
        assessmentSnapshot: attempt.session.assessmentRun?.snapshot,
        requestedEvidenceItems: evaluation.topicEvidence.length,
      });
      return effect === null ? [] : [effect];
    });
    const suppressedAttemptIds = new Set(
      suppressedEvaluationEffects.map((effect) => effect.attemptId),
    );
    const additionsByTopic = new Map<string, TopicEvidenceInput[]>();
    const uniqueEvidence = new Set<string>();
    for (const evaluation of analysis.attemptEvaluations) {
      const attempt = attemptById.get(evaluation.attemptId);
      if (!attempt) continue;
      if (suppressedAttemptIds.has(attempt.id)) continue;
      for (const evidence of evaluation.topicEvidence) {
        const topic = topicByKey.get(evidence.topicKey);
        const uniqueKey = `${attempt.id}:${evidence.topicKey}:${evidence.kind}`;
        if (
          !topic ||
          sourceScope?.attemptTopicById.get(attempt.id) !== evidence.topicKey ||
          uniqueEvidence.has(uniqueKey)
        ) {
          continue;
        }
        uniqueEvidence.add(uniqueKey);
        const additions = additionsByTopic.get(topic.id) ?? [];
        additions.push({
          attemptId: attempt.id,
          rawScore: evidence.score,
          evaluatorType: 'EXTERNAL_AI',
          evaluatorReliability: Math.min(0.65, evaluation.reliability),
          kind: evidence.kind,
          helpLevel: attempt.helpLevel,
          occurredAt: analysis.evaluator.analyzedAt,
          halfLifeDays: topic.defaultHalfLifeDays,
          taskKind: attempt.taskVersion.task.kind,
          difficulty: attempt.taskVersion.task.difficulty,
          passed: evaluation.passed,
          submitted: attempt.submittedAt !== null,
        });
        additionsByTopic.set(topic.id, additions);
      }
    }
    const projectedTopics = await this.database.client.$transaction(async (transaction) => {
      const projected = [];
      for (const topic of topics) {
        const additions = additionsByTopic.get(topic.id);
        if (!additions?.length) continue;
        const state = await this.mastery.projectWithin(transaction, topic.id, additions);
        if (!state) continue;
        const current = topic.topicStates[0];
        projected.push({
          topicKey: topic.key,
          title: topic.title,
          currentStatus: current?.status ?? 'UNKNOWN',
          projectedStatus: state.status,
          currentEstimate: current?.masteryEstimate ?? null,
          projectedEstimate: state.masteryEstimate,
        });
      }
      return projected;
    });
    const unknownAttempts = attemptIds.filter((id) => !attemptById.has(id));
    const unknownTopics = topicKeys.filter((key) => !topicByKey.has(key));
    const warnings = [
      ...analysis.warnings,
      ...(!sourceBundle
        ? ['Source bundle не найден: все ссылки считаются неизвестными и не создадут evidence.']
        : !sourceScope
          ? ['Source bundle повреждён: все ссылки считаются неизвестными и не создадут evidence.']
          : []),
      ...(unknownAttempts.length
        ? [`Неизвестных attempts: ${String(unknownAttempts.length)}.`]
        : []),
      ...(unknownTopics.length
        ? [`Неизвестные topics не будут применены: ${unknownTopics.join(', ')}.`]
        : []),
      ...(analysis.attemptEvaluations.some((item) => item.reliability > 0.65)
        ? ['External AI reliability ограничена до 0.65.']
        : []),
      ...(suppressedEvaluationEffects.length > 0
        ? [
            `Pre-baseline safety: ${String(suppressedEvaluationEffects.length)} Evaluation будут сохранены только для audit; Evidence SUPPRESSED, TopicState/mastery NO_MUTATION.`,
          ]
        : []),
    ];
    const preview = {
      importId: batch.id,
      sourceBundleId: analysis.sourceBundleId,
      matchedAttempts: attempts.length,
      unknownAttempts,
      unknownTopics,
      warnings,
      evaluationsToCreate: analysis.attemptEvaluations.filter((item) =>
        attemptById.has(item.attemptId),
      ).length,
      evidenceToCreate: [...additionsByTopic.values()].reduce(
        (total, additions) => total + additions.length,
        0,
      ),
      suppressedEvaluationEffects,
      projectedTopics,
      recommendations: analysis.recommendations
        .filter(
          (item) => sourceScope?.topicKeys.has(item.topicKey) && topicByKey.has(item.topicKey),
        )
        .map((item) => ({ topicKey: item.topicKey, priority: item.priority, reason: item.reason })),
    };
    await this.database.client.importBatch.update({
      where: { id: batch.id },
      data: { status: 'PREVIEWED', preview: asJsonInput(preview) },
    });
    return preview;
  }
}
