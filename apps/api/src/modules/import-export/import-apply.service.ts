import { Injectable } from '@nestjs/common';
import { SkillForgeAnalysisV1 } from '@skillforge/contracts';
import { DEFAULT_USER_ID, Prisma, type EvidenceKind } from '@skillforge/db';

import { invalidState, notFound } from '../../common/api-error.js';
import { asJsonInput, objectValue } from '../../common/json.js';
import { PrismaService } from '../../database/prisma.service.js';
import { MasteryService, initialEvidenceNormalization } from '../mastery/mastery.service.js';
import {
  storedSuppressedExternalEvaluationEffects,
  suppressedExternalEvaluationEffect,
  type SuppressedExternalEvaluationEffect,
} from './external-evaluation-policy.js';
import { parseImportSourceScope } from './import-source-scope.js';

@Injectable()
export class ImportApplyService {
  public constructor(
    private readonly database: PrismaService,
    private readonly mastery: MasteryService,
  ) {}

  public async apply(importId: string): Promise<unknown> {
    return this.database.client.$transaction(async (transaction) => {
      await transaction.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT "id" FROM "ImportBatch" WHERE "id" = ${importId}::uuid FOR UPDATE`,
      );
      const batch = await transaction.importBatch.findFirst({
        where: { id: importId, userId: DEFAULT_USER_ID },
      });
      if (!batch) throw notFound('IMPORT_NOT_FOUND', 'Import batch не найден');
      if (batch.status === 'APPLIED') {
        return {
          importId: batch.id,
          status: batch.status,
          appliedAt: batch.appliedAt?.toISOString() ?? null,
          suppressedEvaluationEffects: storedSuppressedExternalEvaluationEffects(batch.preview),
          idempotent: true,
        };
      }
      if (batch.status !== 'PREVIEWED') {
        throw invalidState('IMPORT_NOT_PREVIEWED', 'Перед применением import обязателен preview');
      }
      const parsed = SkillForgeAnalysisV1.safeParse(batch.normalized);
      if (!parsed.success) {
        throw invalidState(
          'IMPORT_NORMALIZED_INVALID',
          'Normalized import не соответствует schema',
        );
      }
      const analysis = parsed.data;
      const sourceBundle = await transaction.exportBundle.findFirst({
        where: { id: analysis.sourceBundleId, userId: DEFAULT_USER_ID },
        select: { payload: true },
      });
      const sourceScope = parseImportSourceScope(sourceBundle?.payload);
      const allowedAttemptIds = sourceScope
        ? analysis.attemptEvaluations
            .map((item) => item.attemptId)
            .filter((id) => sourceScope.attemptTopicById.has(id))
        : [];
      const attempts = await transaction.attempt.findMany({
        where: {
          userId: DEFAULT_USER_ID,
          id: { in: allowedAttemptIds },
        },
        include: {
          taskVersion: { include: { task: { include: { topic: true } } } },
          session: {
            select: { assessmentRun: { select: { snapshot: true } } },
          },
        },
      });
      const topicKeys = [
        ...new Set(
          analysis.attemptEvaluations.flatMap((evaluation) =>
            evaluation.topicEvidence.map((item) => item.topicKey),
          ),
        ),
      ];
      const allowedTopicKeys = sourceScope
        ? topicKeys.filter((key) => sourceScope.topicKeys.has(key))
        : [];
      const topics = await transaction.topic.findMany({
        where: { key: { in: allowedTopicKeys } },
      });
      const attemptById = new Map(attempts.map((attempt) => [attempt.id, attempt]));
      const topicByKey = new Map(topics.map((topic) => [topic.key, topic]));
      const affectedTopicIds = new Set<string>();
      const suppressedEvaluationEffects: SuppressedExternalEvaluationEffect[] = [];
      let evaluationsCreated = 0;
      let evidenceCreated = 0;
      for (const imported of analysis.attemptEvaluations) {
        const attempt = attemptById.get(imported.attemptId);
        if (!attempt) continue;
        const suppressedEffect = suppressedExternalEvaluationEffect({
          attemptId: attempt.id,
          assessmentSnapshot: attempt.session.assessmentRun?.snapshot,
          requestedEvidenceItems: imported.topicEvidence.length,
        });
        if (suppressedEffect !== null) suppressedEvaluationEffects.push(suppressedEffect);
        const reliability = Math.min(0.65, imported.reliability);
        const evaluation = await transaction.evaluation.create({
          data: {
            attemptId: attempt.id,
            userId: DEFAULT_USER_ID,
            importBatchId: batch.id,
            evaluatorType: 'EXTERNAL_AI',
            evaluatorVersion: 'skillforge-analysis-v1',
            rawScore: imported.overallScore,
            passed: imported.passed,
            reliability,
            dimensionScores: asJsonInput(imported.dimensions),
            feedbackMarkdown: imported.feedbackMarkdown,
            rubricResult: asJsonInput({
              advisory: true,
              contract: analysis.contract,
              evidencePolicy: suppressedEffect ?? {
                evidenceAction: 'CREATE',
                topicStateAction: 'RECOMPUTE',
                masteryAction: 'RECOMPUTE',
              },
            }),
            externalReference: analysis.sourceBundleId,
          },
        });
        evaluationsCreated += 1;
        const misconceptionIds = new Set<string>();
        for (const finding of imported.misconceptions) {
          const misconception = await transaction.misconception.upsert({
            where: { key: finding.key },
            create: {
              key: finding.key,
              title: finding.title,
              description: finding.evidence,
              remediation: finding.remediation,
            },
            update: {
              title: finding.title,
              description: finding.evidence,
              remediation: finding.remediation,
            },
          });
          if (misconceptionIds.has(misconception.id)) continue;
          misconceptionIds.add(misconception.id);
          await transaction.evaluationMisconception.create({
            data: {
              evaluationId: evaluation.id,
              misconceptionId: misconception.id,
              evidence: finding.evidence,
              remediation: finding.remediation,
            },
          });
        }
        const evidenceByComposite = new Map(
          imported.topicEvidence.map((item) => [`${item.topicKey}:${item.kind}`, item]),
        );
        if (suppressedEffect !== null) continue;
        for (const item of evidenceByComposite.values()) {
          const topic = topicByKey.get(item.topicKey);
          if (!topic || sourceScope?.attemptTopicById.get(attempt.id) !== item.topicKey) continue;
          const normalized = initialEvidenceNormalization({
            rawScore: item.score,
            reliability,
            kind: item.kind as EvidenceKind,
            helpLevel: attempt.helpLevel,
            halfLifeDays: topic.defaultHalfLifeDays,
          });
          await transaction.evidence.create({
            data: {
              userId: DEFAULT_USER_ID,
              topicId: topic.id,
              evaluationId: evaluation.id,
              kind: item.kind,
              rawScore: item.score,
              normalizedScore: normalized.normalizedScore,
              weight: normalized.weight,
              occurredAt: new Date(analysis.evaluator.analyzedAt),
              provenance: asJsonInput({
                advisory: true,
                importBatchId: batch.id,
                sourceBundleId: analysis.sourceBundleId,
                attemptId: attempt.id,
                reliability,
              }),
            },
          });
          evidenceCreated += 1;
          affectedTopicIds.add(topic.id);
          for (const misconceptionId of misconceptionIds) {
            await transaction.topicMisconception.upsert({
              where: { topicId_misconceptionId: { topicId: topic.id, misconceptionId } },
              create: { topicId: topic.id, misconceptionId },
              update: {},
            });
          }
        }
      }
      if (affectedTopicIds.size > 0) {
        await this.mastery.recomputeWithin(transaction, [...affectedTopicIds]);
        await this.mastery.snapshotWithin(transaction, `import:${batch.id}`, {
          sourceBundleId: analysis.sourceBundleId,
          affectedTopicIds: [...affectedTopicIds],
          summary: analysis.summary,
        });
      }
      const appliedAt = new Date();
      await transaction.importBatch.update({
        where: { id: batch.id },
        data: { status: 'APPLIED', appliedAt },
      });
      return {
        importId: batch.id,
        status: 'APPLIED',
        appliedAt: appliedAt.toISOString(),
        evaluationsCreated,
        evidenceCreated,
        suppressedEvaluationEffects,
        affectedTopics: affectedTopicIds.size,
        idempotent: false,
      };
    });
  }

  public async rollback(importId: string): Promise<unknown> {
    return this.database.client.$transaction(async (transaction) => {
      await transaction.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT "id" FROM "ImportBatch" WHERE "id" = ${importId}::uuid FOR UPDATE`,
      );
      const batch = await transaction.importBatch.findFirst({
        where: { id: importId, userId: DEFAULT_USER_ID },
      });
      if (!batch) throw notFound('IMPORT_NOT_FOUND', 'Import batch не найден');
      if (batch.status === 'REJECTED' && objectValue(batch.validationErrors).rollback === true) {
        return { importId: batch.id, status: 'REJECTED', rolledBack: true, idempotent: true };
      }
      if (batch.status !== 'APPLIED' || !batch.appliedAt) {
        throw invalidState('IMPORT_NOT_APPLIED', 'Отменить можно только применённый import');
      }
      const newer = await transaction.importBatch.findFirst({
        where: {
          userId: DEFAULT_USER_ID,
          status: 'APPLIED',
          appliedAt: { gt: batch.appliedAt },
        },
        select: { id: true },
      });
      if (newer) {
        throw invalidState(
          'IMPORT_ROLLBACK_NOT_LATEST',
          'Сначала отмени более новый применённый import',
        );
      }
      const importedEvidence = await transaction.evidence.findMany({
        where: { evaluation: { importBatchId: batch.id } },
        select: { topicId: true },
      });
      const affectedTopicIds = [...new Set(importedEvidence.map((item) => item.topicId))];
      await transaction.evidence.deleteMany({
        where: { evaluation: { importBatchId: batch.id } },
      });
      await transaction.evaluation.deleteMany({ where: { importBatchId: batch.id } });
      if (affectedTopicIds.length > 0) {
        await this.mastery.recomputeWithin(transaction, affectedTopicIds);
      }
      const rolledBackAt = new Date();
      await transaction.importBatch.update({
        where: { id: batch.id },
        data: {
          status: 'REJECTED',
          appliedAt: null,
          validationErrors: asJsonInput({
            rollback: true,
            rolledBackAt: rolledBackAt.toISOString(),
            reason: 'user-requested-compensating-action',
          }),
        },
      });
      if (affectedTopicIds.length > 0) {
        await this.mastery.snapshotWithin(transaction, `import-rollback:${batch.id}`, {
          importId: batch.id,
          affectedTopicIds,
          rolledBackAt: rolledBackAt.toISOString(),
        });
      }
      return {
        importId: batch.id,
        status: 'REJECTED',
        rolledBack: true,
        affectedTopics: affectedTopicIds.length,
        idempotent: false,
      };
    });
  }
}
