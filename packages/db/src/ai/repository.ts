import { randomUUID } from 'node:crypto';

import {
  Prisma,
  type AiBudgetPeriod,
  type AiEvaluationDraft,
  type AiInvocation,
  type AiPromptVersion,
  type PrismaClient,
} from '../../generated/client/client.js';
import type {
  AiEvaluationDraftTransitionResult,
  AiInvocationTransitionResult,
  AiMoneyInput,
  AiRepositoryOptions,
  CachedAiEvaluation,
  CreateAiEvaluationDraftInput,
  ReconcileAiInvocationInput,
  RegisterAiPromptVersionInput,
  RegisterAiPromptVersionResult,
  ReserveAiInvocationInput,
  ReserveAiInvocationResult,
} from './types.js';
import { AiPersistenceError } from './types.js';

const TRANSACTION_ATTEMPTS = 5;
const TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  maxWait: 10_000,
  timeout: 30_000,
} as const;

type TransactionClient = Prisma.TransactionClient;

type PreparedReserveInput = Omit<
  ReserveAiInvocationInput,
  'id' | 'limitUsd' | 'estimatedCostUsd'
> & {
  id: string;
  limitUsd: Prisma.Decimal;
  estimatedCostUsd: Prisma.Decimal;
};

function assertNonEmpty(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new AiPersistenceError('AI_INPUT_INVALID', `${field} не может быть пустым`);
  }
}

function assertPeriod(period: string): void {
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/u.test(period)) {
    throw new AiPersistenceError('AI_INPUT_INVALID', 'period должен иметь формат YYYY-MM');
  }
}

function assertOptionalNonNegativeInteger(value: number | undefined, field: string): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
    throw new AiPersistenceError(
      'AI_INPUT_INVALID',
      `${field} должен быть неотрицательным целым числом`,
    );
  }
}

function normalizeMoney(value: AiMoneyInput, scale: number, field: string): Prisma.Decimal {
  let decimal: Prisma.Decimal;
  try {
    decimal = new Prisma.Decimal(value);
  } catch {
    throw new AiPersistenceError('AI_INPUT_INVALID', `${field} должен быть денежным числом`);
  }

  if (!decimal.isFinite() || decimal.isNegative() || decimal.decimalPlaces() > scale) {
    throw new AiPersistenceError(
      'AI_INPUT_INVALID',
      `${field} должен быть неотрицательным числом с точностью до ${scale} знаков`,
    );
  }

  return decimal;
}

function isRetryableTransactionError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2002' || error.code === 'P2034')
  );
}

function assertPromptMatches(existing: AiPromptVersion, input: RegisterAiPromptVersionInput): void {
  if (
    existing.key !== input.key ||
    existing.version !== input.version ||
    existing.feature !== input.feature ||
    existing.systemPrompt !== input.systemPrompt ||
    existing.schemaVersion !== input.schemaVersion ||
    existing.checksum !== input.checksum
  ) {
    throw new AiPersistenceError(
      'AI_PROMPT_VERSION_CONFLICT',
      `Prompt ${input.key}@${input.version} уже существует с другим immutable содержимым`,
    );
  }
}

function assertInvocationMatches(existing: AiInvocation, input: PreparedReserveInput): void {
  if (
    existing.userId !== input.userId ||
    existing.feature !== input.feature ||
    existing.provider !== input.provider ||
    existing.model !== input.model ||
    existing.promptVersionId !== input.promptVersionId ||
    existing.inputHash !== input.inputHash ||
    existing.cacheKey !== input.cacheKey ||
    existing.relatedAttemptId !== (input.relatedAttemptId ?? null) ||
    (input.relatedTaskVersionId !== undefined &&
      existing.relatedTaskVersionId !== input.relatedTaskVersionId) ||
    (existing.status !== 'CACHED' && !existing.estimatedCostUsd.equals(input.estimatedCostUsd))
  ) {
    throw new AiPersistenceError(
      'AI_INVOCATION_CONFLICT',
      `Invocation ${input.id} уже используется другим запросом`,
    );
  }
}

export class AiRepository {
  readonly #prisma: PrismaClient;
  readonly #databaseSchema: string;

  constructor(prisma: PrismaClient, options: AiRepositoryOptions = {}) {
    this.#prisma = prisma;
    this.#databaseSchema = options.databaseSchema ?? 'public';
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(this.#databaseSchema)) {
      throw new AiPersistenceError('AI_INPUT_INVALID', 'databaseSchema имеет недопустимый формат');
    }
  }

  async registerPromptVersion(
    input: RegisterAiPromptVersionInput,
  ): Promise<RegisterAiPromptVersionResult> {
    assertNonEmpty(input.key, 'key');
    assertNonEmpty(input.systemPrompt, 'systemPrompt');
    assertNonEmpty(input.schemaVersion, 'schemaVersion');
    assertNonEmpty(input.checksum, 'checksum');
    if (!Number.isSafeInteger(input.version) || input.version <= 0) {
      throw new AiPersistenceError(
        'AI_INPUT_INVALID',
        'prompt version должен быть положительным целым числом',
      );
    }

    try {
      const promptVersion = await this.#prisma.aiPromptVersion.create({
        data: {
          id: input.id ?? randomUUID(),
          key: input.key,
          version: input.version,
          feature: input.feature,
          systemPrompt: input.systemPrompt,
          schemaVersion: input.schemaVersion,
          checksum: input.checksum,
          active: input.active ?? false,
        },
      });
      return { promptVersion, created: true };
    } catch (error) {
      if (!isRetryableTransactionError(error)) {
        throw error;
      }

      const existing = await this.#prisma.aiPromptVersion.findUnique({
        where: { key_version: { key: input.key, version: input.version } },
      });
      if (existing === null) {
        throw error;
      }
      assertPromptMatches(existing, input);
      return { promptVersion: existing, created: false };
    }
  }

  async setPromptVersionActive(id: string, active: boolean): Promise<AiPromptVersion> {
    return this.#prisma.aiPromptVersion.update({ where: { id }, data: { active } });
  }

  async findCachedEvaluation(cacheKey: string, userId: string): Promise<CachedAiEvaluation | null> {
    assertNonEmpty(cacheKey, 'cacheKey');
    const sourceInvocation = await this.#prisma.aiInvocation.findFirst({
      where: {
        cacheKey,
        userId,
        status: 'SUCCEEDED',
        evaluationDraft: { isNot: null },
      },
      orderBy: { createdAt: 'asc' },
      include: { evaluationDraft: true },
    });

    if (sourceInvocation?.evaluationDraft === null || sourceInvocation === null) {
      return null;
    }

    return { sourceInvocation, draft: sourceInvocation.evaluationDraft };
  }

  async reserveInvocation(input: ReserveAiInvocationInput): Promise<ReserveAiInvocationResult> {
    const prepared = this.#prepareReserveInput(input);
    return this.#runAtomicTransaction((transaction) =>
      this.#reserveInTransaction(transaction, prepared),
    );
  }

  async markInvocationRunning(invocationId: string): Promise<AiInvocationTransitionResult> {
    return this.#runAtomicTransaction(async (transaction) => {
      const invocation = await this.#lockInvocation(transaction, invocationId);
      const budgetPeriod = await transaction.aiBudgetPeriod.findUniqueOrThrow({
        where: { id: invocation.budgetPeriodId },
      });

      if (invocation.status === 'RUNNING') {
        return { invocation, budgetPeriod, changed: false };
      }
      if (invocation.status !== 'RESERVED') {
        throw new AiPersistenceError(
          'AI_INVALID_TRANSITION',
          `Invocation ${invocationId} нельзя перевести из ${invocation.status} в RUNNING`,
        );
      }

      const updated = await transaction.aiInvocation.update({
        where: { id: invocationId },
        data: { status: 'RUNNING' },
      });
      return { invocation: updated, budgetPeriod, changed: true };
    });
  }

  async reconcileInvocation(
    input: ReconcileAiInvocationInput,
  ): Promise<AiInvocationTransitionResult> {
    const actualCostUsd = normalizeMoney(input.actualCostUsd, 6, 'actualCostUsd');
    assertOptionalNonNegativeInteger(input.inputTokens, 'inputTokens');
    assertOptionalNonNegativeInteger(input.cachedInputTokens, 'cachedInputTokens');
    assertOptionalNonNegativeInteger(input.outputTokens, 'outputTokens');
    assertOptionalNonNegativeInteger(input.latencyMs, 'latencyMs');

    return this.#runAtomicTransaction(async (transaction) => {
      const invocation = await this.#lockInvocation(transaction, input.invocationId);

      if (invocation.status === 'SUCCEEDED') {
        if (invocation.actualCostUsd?.equals(actualCostUsd) !== true) {
          throw new AiPersistenceError(
            'AI_INVOCATION_CONFLICT',
            `Invocation ${input.invocationId} уже reconciled с другой стоимостью`,
          );
        }
        const budgetPeriod = await transaction.aiBudgetPeriod.findUniqueOrThrow({
          where: { id: invocation.budgetPeriodId },
        });
        return { invocation, budgetPeriod, changed: false };
      }

      if (invocation.status !== 'RESERVED' && invocation.status !== 'RUNNING') {
        throw new AiPersistenceError(
          'AI_INVALID_TRANSITION',
          `Invocation ${input.invocationId} нельзя reconcile из ${invocation.status}`,
        );
      }
      if (actualCostUsd.greaterThan(invocation.estimatedCostUsd)) {
        throw new AiPersistenceError(
          'AI_RECONCILE_EXCEEDS_RESERVATION',
          `Фактическая стоимость Invocation ${input.invocationId} превышает maximum reservation`,
        );
      }

      await this.#lockBudgetPeriod(transaction, invocation.budgetPeriodId);
      const updatedRows = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        UPDATE "AiBudgetPeriod"
        SET "reservedUsd" = "reservedUsd" - ${invocation.estimatedCostUsd.toFixed(6)}::numeric,
            "spentUsd" = "spentUsd" + ${actualCostUsd.toFixed(6)}::numeric,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${invocation.budgetPeriodId}::uuid
          AND "reservedUsd" >= ${invocation.estimatedCostUsd.toFixed(6)}::numeric
          AND "spentUsd" + "reservedUsd" - ${invocation.estimatedCostUsd.toFixed(
            6,
          )}::numeric + ${actualCostUsd.toFixed(6)}::numeric <= "limitUsd"
        RETURNING "id"
      `);
      if (updatedRows.length !== 1) {
        throw new AiPersistenceError(
          'AI_BUDGET_INVARIANT',
          `Budget reservation для Invocation ${input.invocationId} отсутствует или повреждён`,
        );
      }

      const updated = await transaction.aiInvocation.update({
        where: { id: input.invocationId },
        data: {
          status: 'SUCCEEDED',
          actualCostUsd,
          ...(input.inputTokens === undefined ? {} : { inputTokens: input.inputTokens }),
          ...(input.cachedInputTokens === undefined
            ? {}
            : { cachedInputTokens: input.cachedInputTokens }),
          ...(input.outputTokens === undefined ? {} : { outputTokens: input.outputTokens }),
          ...(input.latencyMs === undefined ? {} : { latencyMs: input.latencyMs }),
          completedAt: new Date(),
        },
      });
      const budgetPeriod = await transaction.aiBudgetPeriod.findUniqueOrThrow({
        where: { id: invocation.budgetPeriodId },
      });
      return { invocation: updated, budgetPeriod, changed: true };
    });
  }

  async releaseInvocation(
    invocationId: string,
    errorCode: string,
  ): Promise<AiInvocationTransitionResult> {
    assertNonEmpty(errorCode, 'errorCode');

    return this.#runAtomicTransaction(async (transaction) => {
      const invocation = await this.#lockInvocation(transaction, invocationId);
      if (invocation.status === 'FAILED' || invocation.status === 'REJECTED_BUDGET') {
        const budgetPeriod = await transaction.aiBudgetPeriod.findUniqueOrThrow({
          where: { id: invocation.budgetPeriodId },
        });
        return { invocation, budgetPeriod, changed: false };
      }
      if (invocation.status !== 'RESERVED' && invocation.status !== 'RUNNING') {
        throw new AiPersistenceError(
          'AI_INVALID_TRANSITION',
          `Reservation ${invocationId} нельзя освободить из ${invocation.status}`,
        );
      }

      await this.#lockBudgetPeriod(transaction, invocation.budgetPeriodId);
      const updatedRows = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        UPDATE "AiBudgetPeriod"
        SET "reservedUsd" = "reservedUsd" - ${invocation.estimatedCostUsd.toFixed(6)}::numeric,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${invocation.budgetPeriodId}::uuid
          AND "reservedUsd" >= ${invocation.estimatedCostUsd.toFixed(6)}::numeric
        RETURNING "id"
      `);
      if (updatedRows.length !== 1) {
        throw new AiPersistenceError(
          'AI_BUDGET_INVARIANT',
          `Budget reservation для Invocation ${invocationId} отсутствует или повреждён`,
        );
      }

      const updated = await transaction.aiInvocation.update({
        where: { id: invocationId },
        data: { status: 'FAILED', errorCode, completedAt: new Date() },
      });
      const budgetPeriod = await transaction.aiBudgetPeriod.findUniqueOrThrow({
        where: { id: invocation.budgetPeriodId },
      });
      return { invocation: updated, budgetPeriod, changed: true };
    });
  }

  async createEvaluationDraft(
    input: CreateAiEvaluationDraftInput,
  ): Promise<AiEvaluationDraftTransitionResult> {
    return this.#runAtomicTransaction(async (transaction) => {
      const invocation = await this.#lockInvocation(transaction, input.invocationId);
      const existing = await transaction.aiEvaluationDraft.findUnique({
        where: { invocationId: input.invocationId },
      });
      if (existing !== null) {
        if (existing.attemptId !== input.attemptId) {
          throw new AiPersistenceError(
            'AI_INVOCATION_CONFLICT',
            `Invocation ${input.invocationId} уже связан с другим draft`,
          );
        }
        return { draft: existing, changed: false };
      }
      if (invocation.status !== 'SUCCEEDED' && invocation.status !== 'CACHED') {
        throw new AiPersistenceError(
          'AI_INVALID_TRANSITION',
          `Draft нельзя создать для Invocation в статусе ${invocation.status}`,
        );
      }
      if (invocation.relatedAttemptId !== input.attemptId) {
        throw new AiPersistenceError(
          'AI_INVOCATION_CONFLICT',
          'Draft attemptId не совпадает с invocation relatedAttemptId',
        );
      }

      const draft = await transaction.aiEvaluationDraft.create({
        data: {
          id: input.id ?? randomUUID(),
          invocationId: input.invocationId,
          attemptId: input.attemptId,
          status: 'PENDING',
          normalizedJson: input.normalizedJson,
          ...(input.preview === undefined ? {} : { preview: input.preview }),
        },
      });
      return { draft, changed: true };
    });
  }

  async updateEvaluationDraftPreview(
    draftId: string,
    preview: Prisma.InputJsonValue,
  ): Promise<AiEvaluationDraftTransitionResult> {
    return this.#runAtomicTransaction(async (transaction) => {
      const draft = await this.#lockDraft(transaction, draftId);
      if (draft.status !== 'PENDING') {
        throw new AiPersistenceError(
          'AI_INVALID_TRANSITION',
          `Preview draft ${draftId} нельзя изменить из ${draft.status}`,
        );
      }
      const updated = await transaction.aiEvaluationDraft.update({
        where: { id: draftId },
        data: { preview },
      });
      return { draft: updated, changed: true };
    });
  }

  async applyEvaluationDraft(
    draftId: string,
    evaluationId: string,
  ): Promise<AiEvaluationDraftTransitionResult> {
    return this.#runAtomicTransaction((transaction) =>
      this.#applyEvaluationDraft(transaction, draftId, evaluationId),
    );
  }

  async applyEvaluationDraftInTransaction(
    transaction: TransactionClient,
    draftId: string,
    evaluationId: string,
  ): Promise<AiEvaluationDraftTransitionResult> {
    await this.#setTransactionSchema(transaction);
    return this.#applyEvaluationDraft(transaction, draftId, evaluationId);
  }

  async rejectEvaluationDraft(draftId: string): Promise<AiEvaluationDraftTransitionResult> {
    return this.#runAtomicTransaction((transaction) =>
      this.#rejectEvaluationDraft(transaction, draftId),
    );
  }

  async rejectEvaluationDraftInTransaction(
    transaction: TransactionClient,
    draftId: string,
  ): Promise<AiEvaluationDraftTransitionResult> {
    await this.#setTransactionSchema(transaction);
    return this.#rejectEvaluationDraft(transaction, draftId);
  }

  async rollbackEvaluationDraft(
    draftId: string,
    rollbackEvaluationId: string,
  ): Promise<AiEvaluationDraftTransitionResult> {
    return this.#runAtomicTransaction((transaction) =>
      this.#rollbackEvaluationDraft(transaction, draftId, rollbackEvaluationId),
    );
  }

  async rollbackEvaluationDraftInTransaction(
    transaction: TransactionClient,
    draftId: string,
    rollbackEvaluationId: string,
  ): Promise<AiEvaluationDraftTransitionResult> {
    await this.#setTransactionSchema(transaction);
    return this.#rollbackEvaluationDraft(transaction, draftId, rollbackEvaluationId);
  }

  async #applyEvaluationDraft(
    transaction: TransactionClient,
    draftId: string,
    evaluationId: string,
  ): Promise<AiEvaluationDraftTransitionResult> {
    const draft = await this.#lockDraft(transaction, draftId);
    if (draft.status === 'APPLIED') {
      if (draft.appliedEvaluationId !== evaluationId) {
        throw new AiPersistenceError(
          'AI_INVOCATION_CONFLICT',
          `Draft ${draftId} уже применён через другую Evaluation`,
        );
      }
      return { draft, changed: false };
    }
    if (draft.status !== 'PENDING') {
      throw new AiPersistenceError(
        'AI_INVALID_TRANSITION',
        `Draft ${draftId} нельзя применить из ${draft.status}`,
      );
    }

    const evaluation = await transaction.evaluation.findUnique({ where: { id: evaluationId } });
    if (evaluation === null || evaluation.attemptId !== draft.attemptId) {
      throw new AiPersistenceError(
        'AI_INVOCATION_CONFLICT',
        'Applied Evaluation должна принадлежать тому же Attempt, что и draft',
      );
    }

    const updated = await transaction.aiEvaluationDraft.update({
      where: { id: draftId },
      data: { status: 'APPLIED', appliedEvaluationId: evaluationId, appliedAt: new Date() },
    });
    return { draft: updated, changed: true };
  }

  async #rejectEvaluationDraft(
    transaction: TransactionClient,
    draftId: string,
  ): Promise<AiEvaluationDraftTransitionResult> {
    const draft = await this.#lockDraft(transaction, draftId);
    if (draft.status === 'REJECTED') {
      return { draft, changed: false };
    }
    if (draft.status !== 'PENDING') {
      throw new AiPersistenceError(
        'AI_INVALID_TRANSITION',
        `Draft ${draftId} нельзя отклонить из ${draft.status}`,
      );
    }

    const updated = await transaction.aiEvaluationDraft.update({
      where: { id: draftId },
      data: { status: 'REJECTED', rejectedAt: new Date() },
    });
    return { draft: updated, changed: true };
  }

  async #rollbackEvaluationDraft(
    transaction: TransactionClient,
    draftId: string,
    rollbackEvaluationId: string,
  ): Promise<AiEvaluationDraftTransitionResult> {
    const draft = await this.#lockDraft(transaction, draftId);
    if (draft.status === 'ROLLED_BACK') {
      if (draft.rollbackEvaluationId !== rollbackEvaluationId) {
        throw new AiPersistenceError(
          'AI_INVOCATION_CONFLICT',
          `Draft ${draftId} уже rolled back другой Evaluation`,
        );
      }
      return { draft, changed: false };
    }
    if (draft.status !== 'APPLIED' || draft.appliedEvaluationId === null) {
      throw new AiPersistenceError(
        'AI_INVALID_TRANSITION',
        `Draft ${draftId} нельзя rollback из ${draft.status}`,
      );
    }

    const rollbackEvaluation = await transaction.evaluation.findUnique({
      where: { id: rollbackEvaluationId },
    });
    if (
      rollbackEvaluation === null ||
      rollbackEvaluation.attemptId !== draft.attemptId ||
      rollbackEvaluation.supersedesId !== draft.appliedEvaluationId
    ) {
      throw new AiPersistenceError(
        'AI_INVOCATION_CONFLICT',
        'Rollback Evaluation должна компенсировать applied Evaluation того же Attempt',
      );
    }

    const updated = await transaction.aiEvaluationDraft.update({
      where: { id: draftId },
      data: {
        status: 'ROLLED_BACK',
        rollbackEvaluationId,
        rolledBackAt: new Date(),
      },
    });
    return { draft: updated, changed: true };
  }

  #prepareReserveInput(input: ReserveAiInvocationInput): PreparedReserveInput {
    assertPeriod(input.period);
    assertNonEmpty(input.provider, 'provider');
    assertNonEmpty(input.model, 'model');
    assertNonEmpty(input.inputHash, 'inputHash');
    assertNonEmpty(input.cacheKey, 'cacheKey');
    return {
      ...input,
      id: input.id ?? randomUUID(),
      limitUsd: normalizeMoney(input.limitUsd, 2, 'limitUsd'),
      estimatedCostUsd: normalizeMoney(input.estimatedCostUsd, 6, 'estimatedCostUsd'),
    };
  }

  async #reserveInTransaction(
    transaction: TransactionClient,
    input: PreparedReserveInput,
  ): Promise<ReserveAiInvocationResult> {
    const existing = await transaction.aiInvocation.findUnique({ where: { id: input.id } });
    if (existing !== null) {
      const locked = await this.#lockInvocation(transaction, input.id);
      assertInvocationMatches(locked, input);
      const budgetPeriod = await transaction.aiBudgetPeriod.findUniqueOrThrow({
        where: { id: locked.budgetPeriodId },
      });
      return this.#existingReservationResult(transaction, locked, budgetPeriod);
    }

    const promptVersion = await transaction.aiPromptVersion.findUnique({
      where: { id: input.promptVersionId },
    });
    if (promptVersion === null || promptVersion.feature !== input.feature) {
      throw new AiPersistenceError(
        'AI_INVOCATION_CONFLICT',
        'Prompt version отсутствует или не соответствует AI feature',
      );
    }

    let relatedTaskVersionId = input.relatedTaskVersionId;
    if (input.relatedAttemptId !== undefined) {
      const attempt = await transaction.attempt.findUnique({
        where: { id: input.relatedAttemptId },
        select: { userId: true, taskVersionId: true },
      });
      if (attempt === null || attempt.userId !== input.userId) {
        throw new AiPersistenceError(
          'AI_INVOCATION_CONFLICT',
          'related Attempt отсутствует или принадлежит другому User',
        );
      }
      if (relatedTaskVersionId !== undefined && relatedTaskVersionId !== attempt.taskVersionId) {
        throw new AiPersistenceError(
          'AI_INVOCATION_CONFLICT',
          'related TaskVersion не совпадает с Attempt',
        );
      }
      relatedTaskVersionId = attempt.taskVersionId;
    }

    const budgetPeriod = await this.#ensureAndLockBudgetPeriod(transaction, input);
    const cached = await this.#findCachedEvaluation(transaction, input.cacheKey, input.userId);
    if (cached !== null) {
      if (
        cached.sourceInvocation.promptVersionId !== input.promptVersionId ||
        cached.sourceInvocation.model !== input.model ||
        cached.sourceInvocation.provider !== input.provider ||
        cached.sourceInvocation.inputHash !== input.inputHash
      ) {
        throw new AiPersistenceError(
          'AI_INVOCATION_CONFLICT',
          'cacheKey collision: provider metadata не совпадает',
        );
      }

      const invocation = await transaction.aiInvocation.create({
        data: {
          id: input.id,
          userId: input.userId,
          feature: input.feature,
          status: 'CACHED',
          provider: input.provider,
          model: input.model,
          promptVersionId: input.promptVersionId,
          promptKey: promptVersion.key,
          promptVersion: promptVersion.version,
          inputHash: input.inputHash,
          cacheKey: input.cacheKey,
          cacheSourceInvocationId: cached.sourceInvocation.id,
          budgetPeriodId: budgetPeriod.id,
          estimatedCostUsd: new Prisma.Decimal(0),
          actualCostUsd: new Prisma.Decimal(0),
          relatedAttemptId: input.relatedAttemptId ?? null,
          relatedTaskVersionId: relatedTaskVersionId ?? null,
          completedAt: new Date(),
        },
      });
      return {
        outcome: 'CACHE_HIT',
        invocation,
        budgetPeriod,
        sourceInvocation: cached.sourceInvocation,
        sourceDraft: cached.draft,
      };
    }

    const inProgress = await transaction.aiInvocation.findFirst({
      where: { cacheKey: input.cacheKey, status: { in: ['RESERVED', 'RUNNING'] } },
      orderBy: { createdAt: 'asc' },
    });
    if (inProgress !== null) {
      if (inProgress.userId !== input.userId) {
        throw new AiPersistenceError(
          'AI_INVOCATION_CONFLICT',
          'cacheKey уже используется другим User',
        );
      }
      return {
        outcome: 'IN_PROGRESS',
        invocation: inProgress,
        budgetPeriod,
        sourceInvocation: inProgress,
      };
    }

    const reservedRows = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      UPDATE "AiBudgetPeriod"
      SET "reservedUsd" = "reservedUsd" + ${input.estimatedCostUsd.toFixed(6)}::numeric,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${budgetPeriod.id}::uuid
        AND "spentUsd" + "reservedUsd" + ${input.estimatedCostUsd.toFixed(6)}::numeric <= "limitUsd"
      RETURNING "id"
    `);
    if (reservedRows.length === 0) {
      const invocation = await transaction.aiInvocation.create({
        data: {
          id: input.id,
          userId: input.userId,
          feature: input.feature,
          status: 'REJECTED_BUDGET',
          provider: input.provider,
          model: input.model,
          promptVersionId: input.promptVersionId,
          promptKey: promptVersion.key,
          promptVersion: promptVersion.version,
          inputHash: input.inputHash,
          cacheKey: input.cacheKey,
          budgetPeriodId: budgetPeriod.id,
          estimatedCostUsd: input.estimatedCostUsd,
          relatedAttemptId: input.relatedAttemptId ?? null,
          relatedTaskVersionId: relatedTaskVersionId ?? null,
          errorCode: 'AI_BUDGET_EXHAUSTED',
          completedAt: new Date(),
        },
      });
      return { outcome: 'REJECTED_BUDGET', invocation, budgetPeriod };
    }

    const invocation = await transaction.aiInvocation.create({
      data: {
        id: input.id,
        userId: input.userId,
        feature: input.feature,
        status: 'RESERVED',
        provider: input.provider,
        model: input.model,
        promptVersionId: input.promptVersionId,
        promptKey: promptVersion.key,
        promptVersion: promptVersion.version,
        inputHash: input.inputHash,
        cacheKey: input.cacheKey,
        budgetPeriodId: budgetPeriod.id,
        estimatedCostUsd: input.estimatedCostUsd,
        relatedAttemptId: input.relatedAttemptId ?? null,
        relatedTaskVersionId: relatedTaskVersionId ?? null,
      },
    });
    const updatedBudgetPeriod = await transaction.aiBudgetPeriod.findUniqueOrThrow({
      where: { id: budgetPeriod.id },
    });
    return { outcome: 'RESERVED', invocation, budgetPeriod: updatedBudgetPeriod };
  }

  async #existingReservationResult(
    transaction: TransactionClient,
    invocation: AiInvocation,
    budgetPeriod: AiBudgetPeriod,
  ): Promise<ReserveAiInvocationResult> {
    if (invocation.status === 'RESERVED' || invocation.status === 'RUNNING') {
      return { outcome: 'IN_PROGRESS', invocation, budgetPeriod };
    }
    if (invocation.status === 'REJECTED_BUDGET') {
      return { outcome: 'REJECTED_BUDGET', invocation, budgetPeriod };
    }
    if (invocation.status === 'CACHED') {
      if (invocation.cacheSourceInvocationId === null) {
        throw new AiPersistenceError(
          'AI_BUDGET_INVARIANT',
          `Cached Invocation ${invocation.id} не содержит source`,
        );
      }
      const sourceInvocation = await transaction.aiInvocation.findUniqueOrThrow({
        where: { id: invocation.cacheSourceInvocationId },
      });
      const sourceDraft = await transaction.aiEvaluationDraft.findUnique({
        where: { invocationId: sourceInvocation.id },
      });
      if (sourceDraft === null) {
        throw new AiPersistenceError(
          'AI_BUDGET_INVARIANT',
          `Cached Invocation ${invocation.id} не имеет normalized draft source`,
        );
      }
      const draft = await transaction.aiEvaluationDraft.findUnique({
        where: { invocationId: invocation.id },
      });
      return {
        outcome: 'CACHE_HIT',
        invocation,
        budgetPeriod,
        sourceInvocation,
        sourceDraft,
        ...(draft === null ? {} : { draft }),
      };
    }

    const draft = await transaction.aiEvaluationDraft.findUnique({
      where: { invocationId: invocation.id },
    });
    return {
      outcome: 'ALREADY_FINALIZED',
      invocation,
      budgetPeriod,
      ...(draft === null ? {} : { sourceInvocation: invocation, draft }),
      ...(draft === null ? {} : { sourceDraft: draft }),
    };
  }

  async #findCachedEvaluation(
    transaction: TransactionClient,
    cacheKey: string,
    userId: string,
  ): Promise<CachedAiEvaluation | null> {
    const sourceInvocation = await transaction.aiInvocation.findFirst({
      where: {
        cacheKey,
        userId,
        status: 'SUCCEEDED',
        evaluationDraft: { isNot: null },
      },
      orderBy: { createdAt: 'asc' },
      include: { evaluationDraft: true },
    });
    if (sourceInvocation?.evaluationDraft === null || sourceInvocation === null) {
      return null;
    }
    return { sourceInvocation, draft: sourceInvocation.evaluationDraft };
  }

  async #ensureAndLockBudgetPeriod(
    transaction: TransactionClient,
    input: PreparedReserveInput,
  ): Promise<AiBudgetPeriod> {
    const budgetPeriodId = randomUUID();
    await transaction.$executeRaw(Prisma.sql`
      INSERT INTO "AiBudgetPeriod" (
        "id", "userId", "period", "limitUsd", "spentUsd", "reservedUsd", "updatedAt"
      ) VALUES (
        ${budgetPeriodId}::uuid,
        ${input.userId}::uuid,
        ${input.period},
        ${input.limitUsd.toFixed(2)}::numeric,
        0,
        0,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT ("userId", "period") DO NOTHING
    `);

    const lockedRows = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "AiBudgetPeriod"
      WHERE "userId" = ${input.userId}::uuid AND "period" = ${input.period}
      FOR UPDATE
    `);
    const id = lockedRows[0]?.id;
    if (id === undefined) {
      throw new AiPersistenceError(
        'AI_BUDGET_INVARIANT',
        `Budget period ${input.period} не удалось создать или заблокировать`,
      );
    }
    return transaction.aiBudgetPeriod.findUniqueOrThrow({ where: { id } });
  }

  async #lockInvocation(
    transaction: TransactionClient,
    invocationId: string,
  ): Promise<AiInvocation> {
    const lockedRows = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "AiInvocation" WHERE "id" = ${invocationId}::uuid FOR UPDATE
    `);
    if (lockedRows.length !== 1) {
      throw new AiPersistenceError('AI_INPUT_INVALID', `Invocation ${invocationId} не найден`);
    }
    return transaction.aiInvocation.findUniqueOrThrow({ where: { id: invocationId } });
  }

  async #lockBudgetPeriod(transaction: TransactionClient, budgetPeriodId: string): Promise<void> {
    const lockedRows = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "AiBudgetPeriod" WHERE "id" = ${budgetPeriodId}::uuid FOR UPDATE
    `);
    if (lockedRows.length !== 1) {
      throw new AiPersistenceError(
        'AI_BUDGET_INVARIANT',
        `Budget period ${budgetPeriodId} не найден`,
      );
    }
  }

  async #lockDraft(transaction: TransactionClient, draftId: string): Promise<AiEvaluationDraft> {
    const lockedRows = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "AiEvaluationDraft" WHERE "id" = ${draftId}::uuid FOR UPDATE
    `);
    if (lockedRows.length !== 1) {
      throw new AiPersistenceError('AI_INPUT_INVALID', `AI draft ${draftId} не найден`);
    }
    return transaction.aiEvaluationDraft.findUniqueOrThrow({ where: { id: draftId } });
  }

  async #runAtomicTransaction<T>(work: (transaction: TransactionClient) => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.#prisma.$transaction(async (transaction) => {
          await this.#setTransactionSchema(transaction);
          return work(transaction);
        }, TRANSACTION_OPTIONS);
      } catch (error) {
        lastError = error;
        if (!isRetryableTransactionError(error) || attempt === TRANSACTION_ATTEMPTS) {
          throw error;
        }
      }
    }

    throw lastError;
  }

  async #setTransactionSchema(transaction: TransactionClient): Promise<void> {
    await transaction.$executeRawUnsafe(`SET LOCAL search_path TO "${this.#databaseSchema}"`);
  }
}

export function createAiRepository(
  prisma: PrismaClient,
  options?: AiRepositoryOptions,
): AiRepository {
  return new AiRepository(prisma, options);
}
