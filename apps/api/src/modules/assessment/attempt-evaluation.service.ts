import { HttpStatus, Injectable } from '@nestjs/common';
import { RunnerResponseSchema } from '@skillforge/contracts';
import { DEFAULT_USER_ID, EvaluatorType } from '@skillforge/db';

import { ApiError, conflict, invalidState, notFound } from '../../common/api-error.js';
import { bindRunnerResult, currentRunnerResult } from '../../common/bound-runner-result.js';
import { asJsonInput } from '../../common/json.js';
import { PrismaService } from '../../database/prisma.service.js';
import { parseAssessmentSnapshot, serializeAttempt } from '../learning/task-view.js';
import {
  MasteryService,
  evidenceKindForTask,
  initialEvidenceNormalization,
} from '../mastery/mastery.service.js';
import {
  choiceScore,
  exactOutputScore,
  pendingExternalReview,
  runnerScore,
} from './deterministic-evaluation.js';

@Injectable()
export class AttemptEvaluationService {
  public constructor(
    private readonly database: PrismaService,
    private readonly mastery: MasteryService,
  ) {}

  public async persistRunnerResult(
    attemptId: string,
    revision: number,
    rawResult: unknown,
  ): Promise<unknown> {
    const parsed = RunnerResponseSchema.safeParse(rawResult);
    if (!parsed.success) {
      throw new ApiError(
        'RUNNER_RESULT_INVALID',
        'Результат browser worker не соответствует protocol',
        HttpStatus.BAD_REQUEST,
        { issues: parsed.error.issues },
      );
    }
    const attempt = await this.database.client.attempt.findFirst({
      where: { id: attemptId, userId: DEFAULT_USER_ID },
      include: { taskVersion: { include: { task: true } } },
    });
    if (!attempt) throw notFound('ATTEMPT_NOT_FOUND', 'Попытка не найдена');
    if (attempt.taskVersion.task.kind !== 'CODE') {
      throw invalidState('RUNNER_NOT_ALLOWED', 'Runner result допустим только для code task');
    }
    if (attempt.submittedAt) {
      throw invalidState('ATTEMPT_ALREADY_SUBMITTED', 'Отправленная попытка неизменяема');
    }
    if (attempt.revision !== revision) {
      throw conflict('RUNNER_REVISION_CONFLICT', 'Код изменился во время выполнения тестов', {
        expectedRevision: attempt.revision,
        receivedRevision: revision,
      });
    }
    const updated = await this.database.client.attempt.updateMany({
      where: { id: attemptId, revision, submittedAt: null },
      data: {
        runnerOutput: asJsonInput(bindRunnerResult(parsed.data, revision, attempt.answerCode)),
      },
    });
    if (updated.count !== 1) {
      const current = await this.database.client.attempt.findUnique({ where: { id: attemptId } });
      throw conflict('RUNNER_REVISION_CONFLICT', 'Код изменился во время выполнения тестов', {
        expectedRevision: current?.revision ?? null,
        receivedRevision: revision,
      });
    }
    const saved = await this.database.client.attempt.findUniqueOrThrow({
      where: { id: attemptId },
    });
    return serializeAttempt(saved);
  }

  public async submit(attemptId: string): Promise<unknown> {
    return this.database.client.$transaction(async (transaction) => {
      const attempt = await transaction.attempt.findFirst({
        where: { id: attemptId, userId: DEFAULT_USER_ID },
        include: {
          evaluations: { orderBy: { createdAt: 'desc' } },
          session: { include: { assessmentRun: true } },
          sessionItem: true,
          taskVersion: { include: { task: { include: { topic: true } } } },
        },
      });
      if (!attempt) throw notFound('ATTEMPT_NOT_FOUND', 'Попытка не найдена');
      if (!['ACTIVE', 'PAUSED'].includes(attempt.session.status)) {
        throw invalidState('SESSION_NOT_ACTIVE', 'Сессия не находится в активном состоянии');
      }
      if (attempt.submittedAt && attempt.evaluations.length > 0) {
        return { attempt: serializeAttempt(attempt), evaluation: attempt.evaluations[0] };
      }
      const taskKind = attempt.taskVersion.task.kind;
      const currentRunner =
        taskKind === 'CODE' ? currentRunnerResult(attempt.runnerOutput, attempt.answerCode) : null;
      if (taskKind === 'CODE' && !currentRunner) {
        throw invalidState(
          'CODE_RUN_REQUIRED',
          'Перед отправкой запусти тесты для текущей версии кода',
        );
      }
      const submittedAt = attempt.submittedAt ?? new Date();
      await transaction.attempt.update({ where: { id: attempt.id }, data: { submittedAt } });
      let evaluatorType: 'EXACT_MATCH' | 'TEST_RUNNER' | null = null;
      let rawScore: number | null = null;
      if (taskKind === 'SINGLE_CHOICE' || taskKind === 'MULTIPLE_CHOICE') {
        evaluatorType = 'EXACT_MATCH';
        rawScore = choiceScore(attempt.selectedOptions, attempt.taskVersion.expectedAnswer);
      } else if (taskKind === 'PREDICT_OUTPUT') {
        evaluatorType = 'EXACT_MATCH';
        rawScore = exactOutputScore(attempt.answerText, attempt.taskVersion.expectedAnswer);
      } else if (taskKind === 'CODE') {
        evaluatorType = 'TEST_RUNNER';
        rawScore = runnerScore(currentRunner);
      }
      let evaluation: unknown = null;
      if (evaluatorType && rawScore !== null) {
        const reliability = evaluatorType === 'TEST_RUNNER' ? 1 : 0.95;
        const kind = evidenceKindForTask(taskKind);
        const previousEvaluation = attempt.sessionItemId
          ? await transaction.evaluation.findFirst({
              where: {
                userId: DEFAULT_USER_ID,
                attempt: { sessionItemId: attempt.sessionItemId, id: { not: attempt.id } },
                supersededBy: null,
              },
              orderBy: { createdAt: 'desc' },
            })
          : null;
        const created = await transaction.evaluation.create({
          data: {
            attemptId: attempt.id,
            userId: DEFAULT_USER_ID,
            evaluatorType: evaluatorType as EvaluatorType,
            evaluatorVersion:
              evaluatorType === 'TEST_RUNNER' ? 'browser-worker-v1.0' : 'exact-match-v1.0',
            rawScore,
            passed: rawScore >= 100,
            reliability,
            dimensionScores: asJsonInput({ [kind]: rawScore }),
            rubricResult: asJsonInput({ deterministic: true }),
            ...(previousEvaluation ? { supersedesId: previousEvaluation.id } : {}),
          },
        });
        const normalized = initialEvidenceNormalization({
          rawScore,
          reliability,
          kind,
          helpLevel: attempt.helpLevel,
          halfLifeDays: attempt.taskVersion.task.topic.defaultHalfLifeDays,
        });
        await transaction.evidence.create({
          data: {
            userId: DEFAULT_USER_ID,
            topicId: attempt.taskVersion.task.topic.id,
            evaluationId: created.id,
            kind,
            rawScore,
            normalizedScore: normalized.normalizedScore,
            weight: normalized.weight,
            occurredAt: submittedAt,
            provenance: asJsonInput({
              evaluator: evaluatorType,
              evaluatorVersion: created.evaluatorVersion,
              attemptId: attempt.id,
              taskVersionId: attempt.taskVersionId,
            }),
          },
        });
        await this.mastery.recomputeWithin(transaction, [attempt.taskVersion.task.topic.id]);
        evaluation = created;
      }
      await transaction.learningSession.update({
        where: { id: attempt.sessionId },
        data: {
          lastStepLabel: `${attempt.taskVersion.task.topic.title}: ${attempt.taskVersion.task.stableKey}`,
        },
      });
      const assessmentRun = attempt.session.assessmentRun;
      if (assessmentRun && attempt.sessionItemId) {
        const snapshot = parseAssessmentSnapshot(assessmentRun.snapshot);
        const current = snapshot?.items.find(
          (item) => item.sessionItemId === attempt.sessionItemId,
        );
        if (snapshot && current) {
          const nextInBlock = snapshot.items.find(
            (item) => item.blockIndex === current.blockIndex && item.position > current.position,
          );
          await transaction.assessmentRun.update({
            where: { id: assessmentRun.id },
            data: {
              currentBlock: current.blockIndex,
              currentPosition: nextInBlock?.position ?? current.position,
            },
          });
        }
      }
      const saved = await transaction.attempt.findUniqueOrThrow({ where: { id: attempt.id } });
      return {
        attempt: serializeAttempt(saved),
        evaluation,
        pendingExternalReview: pendingExternalReview(taskKind),
      };
    });
  }

  public async evaluations(attemptId: string): Promise<unknown[]> {
    const attempt = await this.database.client.attempt.findFirst({
      where: { id: attemptId, userId: DEFAULT_USER_ID },
      select: { id: true },
    });
    if (!attempt) throw notFound('ATTEMPT_NOT_FOUND', 'Попытка не найдена');
    return this.database.client.evaluation.findMany({
      where: { attemptId },
      orderBy: { createdAt: 'desc' },
      include: { evidence: true },
    });
  }
}
