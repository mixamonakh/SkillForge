import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  AI_ATTEMPT_EVALUATION_CONTRACT,
  AiAttemptEvaluationCandidateSchema,
  EvaluateAttemptInputSchema,
  validateAttemptEvaluationCandidate,
  type AiAttemptEvaluationCandidate,
  type EvaluateAttemptInput,
} from '@skillforge/ai-provider';
import { EVIDENCE_KINDS, EvaluationCoverageSchema, type EvidenceKind } from '@skillforge/contracts';
import { AiEvaluationDraftStatus, Prisma, type AiRepository } from '@skillforge/db';
import type { TopicEvidenceInput, TopicStateResult } from '@skillforge/learning-engine';

import { ApiError, notFound } from '../../common/api-error.js';
import { asJsonInput, objectValue, stringArray } from '../../common/json.js';
import { PrismaService } from '../../database/prisma.service.js';
import { isPrebaselineSnapshot } from '../assessment/prebaseline-snapshot.js';
import { MasteryService, initialEvidenceNormalization } from '../mastery/mastery.service.js';
import { sha256 } from './ai-hashing.js';
import { AI_RUNTIME, type AiRuntime } from './ai-runtime.provider.js';
import {
  AI_USER_ID,
  assertAiFeature,
  createApiAiRepository,
  currentAiPeriod,
  estimateInputReservation,
  money,
  providerApiError,
  setApiTransactionSchema,
  synchronizePrompt,
} from './ai-shared.js';

const evidenceKindSet = new Set<string>(EVIDENCE_KINDS);
const LOCAL_EVALUATORS = ['EXACT_MATCH', 'TEST_RUNNER'] as const;
const MAXIMUM_EVALUATION_OUTPUT_TOKENS = 4_000;

type AttemptWithAiContext = Awaited<ReturnType<AiEvaluationService['findAttempt']>>;
type AttemptProviderResult = Awaited<ReturnType<AiRuntime['provider']['evaluateAttempt']>>;

type ProjectedState = {
  status: string;
  masteryEstimate: number | null;
  masteryConfidence: number;
  evidenceCount: number;
};

function numericRecord(value: unknown): Record<string, number> {
  return Object.fromEntries(
    Object.entries(objectValue(value)).filter(
      (entry): entry is [string, number] =>
        typeof entry[1] === 'number' && Number.isFinite(entry[1]),
    ),
  );
}

function rubricDimensions(rubric: unknown): string[] {
  return Object.entries(objectValue(objectValue(rubric).dimensions))
    .filter(([, weight]) => typeof weight === 'number' && Number.isFinite(weight) && weight > 0)
    .map(([dimension]) => dimension)
    .sort();
}

function stateView(state: TopicStateResult | null): ProjectedState | null {
  return state === null
    ? null
    : {
        status: state.status,
        masteryEstimate: state.masteryEstimate,
        masteryConfidence: state.masteryConfidence,
        evidenceCount: state.evidenceCount,
      };
}

function attemptCandidateInput(attempt: NonNullable<AttemptWithAiContext>): EvaluateAttemptInput {
  const alreadyEvaluated = new Set(
    attempt.evaluations.flatMap((evaluation) =>
      Object.keys(numericRecord(evaluation.dimensionScores)),
    ),
  );
  const allowedDimensions = rubricDimensions(attempt.taskVersion.rubric).filter(
    (dimension) => !alreadyEvaluated.has(dimension),
  );
  const metadata = objectValue(attempt.taskVersion.metadata);
  const allowedMisconceptionKeys = [
    ...new Set([
      ...stringArray(metadata.misconceptionTags),
      ...attempt.taskVersion.task.topic.misconceptionLinks.map((item) => item.misconception.key),
    ]),
  ].sort();
  const allowedEvidenceKinds = allowedDimensions.filter((dimension): dimension is EvidenceKind =>
    evidenceKindSet.has(dimension),
  );
  return EvaluateAttemptInputSchema.parse({
    attemptId: attempt.id,
    task: {
      stableKey: attempt.taskVersion.task.stableKey,
      version: attempt.taskVersion.version,
      checksum: attempt.taskVersion.checksum,
      topicKey: attempt.taskVersion.task.topic.key,
      promptMarkdown: attempt.taskVersion.promptMarkdown,
      rubric: attempt.taskVersion.rubric,
      expectedAnswer: attempt.taskVersion.expectedAnswer,
      acceptanceCriteria: stringArray(attempt.taskVersion.acceptanceCriteria),
      allowedDimensions,
      allowedMisconceptionKeys,
      allowedEvidenceKinds,
    },
    answer: {
      text: attempt.answerText,
      code: attempt.answerCode,
      selectedOptionIds: stringArray(attempt.selectedOptions),
      helpLevel: attempt.helpLevel,
    },
  });
}

function deterministicEvaluationView(attempt: NonNullable<AttemptWithAiContext>): unknown[] {
  return attempt.evaluations
    .filter((evaluation) => LOCAL_EVALUATORS.includes(evaluation.evaluatorType as never))
    .map((evaluation) => {
      const storedCoverage = EvaluationCoverageSchema.safeParse(
        objectValue(evaluation.rubricResult).coverage,
      );
      return {
        id: evaluation.id,
        evaluatorType: evaluation.evaluatorType,
        evaluatorVersion: evaluation.evaluatorVersion,
        rawScore: evaluation.rawScore,
        passed: evaluation.passed,
        reliability: evaluation.reliability,
        dimensionScores: numericRecord(evaluation.dimensionScores),
        coverage: storedCoverage.success
          ? storedCoverage.data
          : {
              evaluatedDimensions: Object.keys(numericRecord(evaluation.dimensionScores)),
              pendingDimensions: [],
              unsupportedDimensions: [],
              isFinal: false,
            },
      };
    });
}

function evidenceInputs(
  attempt: NonNullable<AttemptWithAiContext>,
  candidate: AiAttemptEvaluationCandidate,
): TopicEvidenceInput[] {
  return candidate.evidenceCandidates.map((item) => ({
    attemptId: attempt.id,
    rawScore: candidate.dimensionScores[item.kind] ?? candidate.score,
    evaluatorType: 'API_AI',
    evaluatorReliability: candidate.reliability * item.strength,
    kind: item.kind,
    helpLevel: attempt.helpLevel,
    occurredAt: attempt.submittedAt ?? attempt.updatedAt,
    halfLifeDays: attempt.taskVersion.task.topic.defaultHalfLifeDays,
    taskKind: attempt.taskVersion.task.kind,
    difficulty: attempt.taskVersion.task.difficulty,
    passed: candidate.passed,
    submitted: true,
  }));
}

function assertUniqueEvidence(candidate: AiAttemptEvaluationCandidate): void {
  const keys = candidate.evidenceCandidates.map((item) => `${item.topicKey}:${item.kind}`);
  if (new Set(keys).size !== keys.length) {
    throw new ApiError(
      'AI_RESULT_INVALID',
      'AI candidate содержит повторяющиеся evidence entries',
      HttpStatus.BAD_GATEWAY,
      { manualFallback: true },
    );
  }
}

@Injectable()
export class AiEvaluationService {
  private readonly repository: AiRepository;

  public constructor(
    @Inject(PrismaService) private readonly database: PrismaService,
    @Inject(MasteryService) private readonly mastery: MasteryService,
    @Inject(AI_RUNTIME) private readonly runtime: AiRuntime,
  ) {
    this.repository = createApiAiRepository(database);
  }

  public async evaluate(attemptId: string): Promise<unknown> {
    assertAiFeature(this.runtime, 'attemptEvaluation');
    const attempt = await this.findAttempt(attemptId);
    if (attempt === null) throw notFound('ATTEMPT_NOT_FOUND', 'Попытка не найдена');
    if (attempt.submittedAt === null) {
      throw new ApiError(
        'ATTEMPT_NOT_SUBMITTED',
        'AI evaluation доступна только после отправки попытки',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    let input: EvaluateAttemptInput;
    try {
      input = attemptCandidateInput(attempt);
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('allowedDimensions') ||
          error.message.includes('allowedEvidenceKinds'))
      ) {
        throw new ApiError(
          'AI_REVIEW_NOT_REQUIRED',
          'У этой попытки нет pending rubric dimensions для AI review',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      throw error;
    }
    if (input.task.allowedDimensions.length === 0 || input.task.allowedEvidenceKinds.length === 0) {
      throw new ApiError(
        'AI_REVIEW_NOT_REQUIRED',
        'У этой попытки нет pending rubric dimensions для AI review',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const prompt = await synchronizePrompt(this.repository, 'ATTEMPT_EVALUATION');
    const model = this.runtime.modelFor('ATTEMPT_EVALUATION');
    const answerHash = sha256(input.answer);
    const rubricHash = sha256(attempt.taskVersion.rubric);
    const inputHash = sha256({
      taskChecksum: attempt.taskVersion.checksum,
      answerHash,
      rubricHash,
      promptChecksum: prompt.checksum,
    });
    const cacheKey = sha256({
      feature: 'ATTEMPT_EVALUATION',
      taskChecksum: attempt.taskVersion.checksum,
      answerHash,
      rubricHash,
      promptKey: prompt.key,
      promptVersion: prompt.version,
      model,
      contract: AI_ATTEMPT_EVALUATION_CONTRACT,
    });

    const existing = await this.database.client.aiEvaluationDraft.findFirst({
      where: {
        attemptId,
        status: { in: [AiEvaluationDraftStatus.PENDING, AiEvaluationDraftStatus.APPLIED] },
        invocation: { cacheKey },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (existing !== null) return this.get(existing.id);

    const estimatedCostUsd = estimateInputReservation(
      this.runtime,
      input,
      MAXIMUM_EVALUATION_OUTPUT_TOKENS,
    );
    const reservation = await this.repository.reserveInvocation({
      userId: AI_USER_ID,
      period: currentAiPeriod(),
      limitUsd: this.runtime.config.monthlyBudgetUsd,
      feature: 'ATTEMPT_EVALUATION',
      provider: this.runtime.providerName,
      model,
      promptVersionId: prompt.id,
      inputHash,
      cacheKey,
      estimatedCostUsd,
      relatedAttemptId: attempt.id,
      relatedTaskVersionId: attempt.taskVersionId,
    });
    if (reservation.outcome === 'REJECTED_BUDGET') {
      throw new ApiError(
        'AI_BUDGET_EXCEEDED',
        'API-проверка временно недоступна: месячный лимит исчерпан',
        HttpStatus.TOO_MANY_REQUESTS,
        { manualFallback: true, period: currentAiPeriod() },
      );
    }
    if (reservation.outcome === 'IN_PROGRESS') {
      throw new ApiError(
        'AI_INVOCATION_IN_PROGRESS',
        'Идентичная AI-проверка уже выполняется',
        HttpStatus.CONFLICT,
      );
    }

    if (reservation.outcome === 'CACHE_HIT') {
      const racedExisting = await this.database.client.aiEvaluationDraft.findFirst({
        where: {
          attemptId,
          status: { in: [AiEvaluationDraftStatus.PENDING, AiEvaluationDraftStatus.APPLIED] },
          invocation: { cacheKey },
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (racedExisting !== null) return this.get(racedExisting.id);
      const source = reservation.sourceDraft;
      if (source === undefined) {
        throw new ApiError('AI_CACHE_INVALID', 'Cache source отсутствует', HttpStatus.CONFLICT);
      }
      const parsed = AiAttemptEvaluationCandidateSchema.parse(source.normalizedJson);
      const candidate = validateAttemptEvaluationCandidate(input, { ...parsed, attemptId });
      assertUniqueEvidence(candidate);
      const preview = await this.preview(attempt, candidate, {
        estimatedUsd: 0,
        actualUsd: 0,
        cacheHit: true,
      });
      const created = await this.repository.createEvaluationDraft({
        invocationId: reservation.invocation.id,
        attemptId,
        normalizedJson: asJsonInput(candidate),
        preview: asJsonInput(preview),
      });
      return this.get(created.draft.id);
    }

    if (reservation.outcome === 'ALREADY_FINALIZED') {
      if (reservation.draft !== undefined) return this.get(reservation.draft.id);
      throw new ApiError(
        'AI_INVOCATION_INCOMPLETE',
        'AI invocation не содержит draft',
        HttpStatus.CONFLICT,
      );
    }

    await this.repository.markInvocationRunning(reservation.invocation.id);
    let result: AttemptProviderResult;
    let actualCostUsd: number;
    try {
      result = await this.runtime.provider.evaluateAttempt(input, { model });
      assertUniqueEvidence(result.candidate);
      actualCostUsd = this.runtime.calculateCostUsd(result.usage);
      await this.repository.reconcileInvocation({
        invocationId: reservation.invocation.id,
        actualCostUsd,
        inputTokens: result.usage.inputTokens,
        cachedInputTokens: result.usage.cachedInputTokens,
        outputTokens: result.usage.outputTokens,
        latencyMs: result.latencyMs,
      });
    } catch (error) {
      try {
        await this.repository.releaseInvocation(
          reservation.invocation.id,
          error instanceof Error ? error.name.slice(0, 120) : 'AI_PROVIDER_ERROR',
        );
      } catch (releaseError) {
        throw providerApiError(releaseError);
      }
      throw providerApiError(error);
    }
    const preview = await this.preview(attempt, result.candidate, {
      estimatedUsd: estimatedCostUsd,
      actualUsd: actualCostUsd,
      cacheHit: false,
    });
    const created = await this.repository.createEvaluationDraft({
      invocationId: reservation.invocation.id,
      attemptId,
      normalizedJson: asJsonInput(result.candidate),
      preview: asJsonInput(preview),
    });
    return this.get(created.draft.id);
  }

  public async get(draftId: string): Promise<unknown> {
    const record = await this.database.client.aiEvaluationDraft.findFirst({
      where: { id: draftId, attempt: { userId: AI_USER_ID } },
      include: {
        invocation: true,
        attempt: {
          include: {
            evaluations: {
              where: { supersededBy: null },
              orderBy: { createdAt: 'asc' },
            },
            taskVersion: {
              include: {
                task: {
                  include: {
                    topic: {
                      include: { misconceptionLinks: { include: { misconception: true } } },
                    },
                  },
                },
              },
            },
            session: { include: { assessmentRun: true } },
          },
        },
      },
    });
    if (record === null) throw notFound('AI_DRAFT_NOT_FOUND', 'AI evaluation draft не найден');
    const candidate = AiAttemptEvaluationCandidateSchema.parse(record.normalizedJson);
    const preview = objectValue(record.preview);
    return {
      draft: {
        id: record.id,
        attemptId: record.attemptId,
        status: record.status,
        createdAt: record.createdAt.toISOString(),
        appliedAt: record.appliedAt?.toISOString() ?? null,
        rejectedAt: record.rejectedAt?.toISOString() ?? null,
        rolledBackAt: record.rolledBackAt?.toISOString() ?? null,
        appliedEvaluationId: record.appliedEvaluationId,
        rollbackEvaluationId: record.rollbackEvaluationId,
      },
      invocation: {
        id: record.invocation.id,
        status: record.invocation.status,
        provider: record.invocation.provider,
        model: record.invocation.model,
        promptKey: record.invocation.promptKey,
        promptVersion: record.invocation.promptVersion,
        estimatedCostUsd: money(record.invocation.estimatedCostUsd) ?? 0,
        actualCostUsd: money(record.invocation.actualCostUsd),
        cacheHit: record.invocation.status === 'CACHED',
        cacheSourceInvocationId: record.invocation.cacheSourceInvocationId,
      },
      candidate,
      preview,
      actions: {
        canApply: record.status === 'PENDING',
        canReject: record.status === 'PENDING',
        canRollback: record.status === 'APPLIED',
      },
    };
  }

  public async apply(draftId: string): Promise<unknown> {
    await this.database.client.$transaction(async (transaction) => {
      await setApiTransactionSchema(transaction);
      await transaction.$queryRaw(Prisma.sql`
        SELECT "id" FROM "AiEvaluationDraft" WHERE "id" = ${draftId}::uuid FOR UPDATE
      `);
      const record = await transaction.aiEvaluationDraft.findFirst({
        where: { id: draftId, attempt: { userId: AI_USER_ID } },
        include: {
          invocation: true,
          attempt: {
            include: {
              evaluations: { where: { supersededBy: null }, orderBy: { createdAt: 'asc' } },
              taskVersion: {
                include: {
                  task: {
                    include: {
                      topic: {
                        include: { misconceptionLinks: { include: { misconception: true } } },
                      },
                    },
                  },
                },
              },
              session: { include: { assessmentRun: true } },
            },
          },
        },
      });
      if (record === null) throw notFound('AI_DRAFT_NOT_FOUND', 'AI evaluation draft не найден');
      if (record.status === 'APPLIED') return;
      if (record.status !== 'PENDING') {
        throw new ApiError(
          'AI_DRAFT_TRANSITION_INVALID',
          'Применить можно только pending AI draft',
          HttpStatus.CONFLICT,
        );
      }
      const candidate = AiAttemptEvaluationCandidateSchema.parse(record.normalizedJson);
      assertUniqueEvidence(candidate);
      let currentInput: EvaluateAttemptInput;
      try {
        currentInput = attemptCandidateInput(record.attempt);
        validateAttemptEvaluationCandidate(currentInput, candidate);
      } catch {
        throw new ApiError(
          'AI_PREVIEW_STALE',
          'Rubric coverage изменилась после создания preview; запроси новую проверку',
          HttpStatus.CONFLICT,
        );
      }
      const prebaseline = isPrebaselineSnapshot(record.attempt.session.assessmentRun?.snapshot);
      const evaluation = await transaction.evaluation.create({
        data: {
          attemptId: record.attemptId,
          userId: AI_USER_ID,
          evaluatorType: 'API_AI',
          evaluatorVersion: `${record.invocation.promptKey}@${String(record.invocation.promptVersion)}`,
          rawScore: candidate.score,
          passed: candidate.passed,
          reliability: candidate.reliability,
          dimensionScores: asJsonInput(candidate.dimensionScores),
          feedbackMarkdown: candidate.feedbackMarkdown,
          rubricResult: asJsonInput({
            contract: candidate.contract,
            coverage: candidate.coverage,
            correctObservations: candidate.correctObservations,
            errors: candidate.errors,
            warnings: candidate.warnings,
            misconceptions: candidate.misconceptions,
            advisory: true,
            prebaselineSuppressed: prebaseline,
          }),
          externalReference: `ai-invocation:${record.invocationId}`,
        },
      });
      const affectedTopicIds = new Set<string>();
      if (!prebaseline) {
        for (const item of candidate.evidenceCandidates) {
          const rawScore = candidate.dimensionScores[item.kind] ?? candidate.score;
          const reliability = candidate.reliability * item.strength;
          const normalized = initialEvidenceNormalization({
            rawScore,
            reliability,
            kind: item.kind,
            helpLevel: record.attempt.helpLevel,
            halfLifeDays: record.attempt.taskVersion.task.topic.defaultHalfLifeDays,
          });
          await transaction.evidence.create({
            data: {
              userId: AI_USER_ID,
              topicId: record.attempt.taskVersion.task.topic.id,
              evaluationId: evaluation.id,
              kind: item.kind,
              rawScore,
              normalizedScore: normalized.normalizedScore,
              weight: normalized.weight,
              occurredAt: record.attempt.submittedAt ?? record.attempt.updatedAt,
              provenance: asJsonInput({
                advisory: true,
                provider: record.invocation.provider,
                model: record.invocation.model,
                promptKey: record.invocation.promptKey,
                promptVersion: record.invocation.promptVersion,
                invocationId: record.invocationId,
                draftId: record.id,
                strength: item.strength,
                explanation: item.explanation,
              }),
            },
          });
          affectedTopicIds.add(record.attempt.taskVersion.task.topic.id);
        }
      }
      await this.repository.applyEvaluationDraftInTransaction(transaction, draftId, evaluation.id);
      if (affectedTopicIds.size > 0) {
        await this.mastery.recomputeWithin(transaction, [...affectedTopicIds]);
        await this.mastery.snapshotWithin(transaction, `ai-apply:${draftId}`, {
          draftId,
          evaluationId: evaluation.id,
          affectedTopicIds: [...affectedTopicIds],
        });
      }
    });
    return this.get(draftId);
  }

  public async reject(draftId: string): Promise<unknown> {
    const owned = await this.database.client.aiEvaluationDraft.findFirst({
      where: { id: draftId, attempt: { userId: AI_USER_ID } },
      select: { id: true },
    });
    if (owned === null) throw notFound('AI_DRAFT_NOT_FOUND', 'AI evaluation draft не найден');
    try {
      await this.repository.rejectEvaluationDraft(draftId);
    } catch (error) {
      throw providerApiError(error);
    }
    return this.get(draftId);
  }

  public async rollback(draftId: string): Promise<unknown> {
    await this.database.client.$transaction(async (transaction) => {
      await setApiTransactionSchema(transaction);
      await transaction.$queryRaw(Prisma.sql`
        SELECT "id" FROM "AiEvaluationDraft" WHERE "id" = ${draftId}::uuid FOR UPDATE
      `);
      const record = await transaction.aiEvaluationDraft.findFirst({
        where: { id: draftId, attempt: { userId: AI_USER_ID } },
        include: {
          attempt: {
            include: {
              session: { include: { assessmentRun: true } },
              taskVersion: { include: { task: { include: { topic: true } } } },
            },
          },
        },
      });
      if (record === null) throw notFound('AI_DRAFT_NOT_FOUND', 'AI evaluation draft не найден');
      if (record.status === 'ROLLED_BACK') return;
      if (record.status !== 'APPLIED' || record.appliedEvaluationId === null) {
        throw new ApiError(
          'AI_DRAFT_TRANSITION_INVALID',
          'Rollback доступен только для applied AI draft',
          HttpStatus.CONFLICT,
        );
      }
      const compensating = await transaction.evaluation.create({
        data: {
          attemptId: record.attemptId,
          userId: AI_USER_ID,
          evaluatorType: 'API_AI',
          evaluatorVersion: 'ai-compensation-v1',
          rawScore: null,
          passed: null,
          reliability: 0,
          dimensionScores: {},
          feedbackMarkdown: 'AI evaluation отменена компенсирующей записью.',
          rubricResult: asJsonInput({
            compensation: true,
            draftId,
            supersededEvaluationId: record.appliedEvaluationId,
          }),
          supersedesId: record.appliedEvaluationId,
          externalReference: `ai-rollback:${draftId}`,
        },
      });
      await this.repository.rollbackEvaluationDraftInTransaction(
        transaction,
        draftId,
        compensating.id,
      );
      if (!isPrebaselineSnapshot(record.attempt.session.assessmentRun?.snapshot)) {
        await this.mastery.recomputeWithin(transaction, [record.attempt.taskVersion.task.topic.id]);
        await this.mastery.snapshotWithin(transaction, `ai-rollback:${draftId}`, {
          draftId,
          compensationEvaluationId: compensating.id,
          affectedTopicIds: [record.attempt.taskVersion.task.topic.id],
        });
      }
    });
    return this.get(draftId);
  }

  private async preview(
    attempt: NonNullable<AttemptWithAiContext>,
    candidate: AiAttemptEvaluationCandidate,
    cost: { estimatedUsd: number; actualUsd: number | null; cacheHit: boolean },
  ): Promise<unknown> {
    const prebaseline = isPrebaselineSnapshot(attempt.session.assessmentRun?.snapshot);
    const projectedChanges = prebaseline
      ? []
      : await this.database.client.$transaction(async (transaction) => {
          const current = await this.mastery.projectWithin(
            transaction,
            attempt.taskVersion.task.topic.id,
          );
          const projected = await this.mastery.projectWithin(
            transaction,
            attempt.taskVersion.task.topic.id,
            evidenceInputs(attempt, candidate),
          );
          return [
            {
              topicKey: attempt.taskVersion.task.topic.key,
              current: stateView(current),
              projected: stateView(projected),
            },
          ];
        });
    return {
      deterministicEvaluations: deterministicEvaluationView(attempt),
      candidateEvidence: candidate.evidenceCandidates,
      projectedChanges,
      prebaselineSuppressed: prebaseline,
      cost,
    };
  }

  private findAttempt(attemptId: string) {
    return this.database.client.attempt.findFirst({
      where: { id: attemptId, userId: AI_USER_ID },
      include: {
        evaluations: {
          where: { supersededBy: null },
          orderBy: { createdAt: 'asc' },
        },
        taskVersion: {
          include: {
            task: {
              include: {
                topic: { include: { misconceptionLinks: { include: { misconception: true } } } },
              },
            },
          },
        },
        session: { include: { assessmentRun: true } },
      },
    });
  }
}
