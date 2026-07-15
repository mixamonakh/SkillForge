import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  AI_NUDGE_CONTRACT,
  GenerateNudgeInputSchema,
  type AiNudgeCandidate,
  type GenerateNudgeInput,
} from '@skillforge/ai-provider';
import type { AiRepository } from '@skillforge/db';

import { ApiError, notFound } from '../../common/api-error.js';
import { asJsonInput, stringArray } from '../../common/json.js';
import { PrismaService } from '../../database/prisma.service.js';
import { sha256 } from './ai-hashing.js';
import { AI_RUNTIME, type AiRuntime } from './ai-runtime.provider.js';
import {
  AI_USER_ID,
  assertAiFeature,
  createApiAiRepository,
  currentAiPeriod,
  estimateInputReservation,
  providerApiError,
  synchronizePrompt,
} from './ai-shared.js';

const MAXIMUM_NUDGE_OUTPUT_TOKENS = 4_000;
type NudgeProviderResult = Awaited<ReturnType<AiRuntime['provider']['generateNudge']>>;

function fragmentsFrom(value: unknown, result: string[] = []): string[] {
  if (result.length >= 100) return result;
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (normalized.length > 0) result.push(normalized.slice(0, 2_000));
  } else if (typeof value === 'number' && Number.isFinite(value)) {
    result.push(String(value));
  } else if (typeof value === 'boolean') {
    result.push(String(value));
  } else if (Array.isArray(value)) {
    for (const item of value) fragmentsFrom(item, result);
  } else if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value as Readonly<Record<string, unknown>>)) {
      fragmentsFrom(item, result);
    }
  }
  return [...new Set(result)].slice(0, 100);
}

type PersistedNudge = {
  attemptId: string;
  hintType: 'NUDGE';
  hint: string;
  warnings: string[];
  helpLevel: 'NUDGE';
  cacheHit: boolean;
  invocationId: string | null;
};

@Injectable()
export class AiHintService {
  private readonly repository: AiRepository;

  public constructor(
    @Inject(PrismaService) private readonly database: PrismaService,
    @Inject(AI_RUNTIME) private readonly runtime: AiRuntime,
  ) {
    this.repository = createApiAiRepository(database);
  }

  public async nudge(attemptId: string): Promise<PersistedNudge> {
    assertAiFeature(this.runtime, 'nudge');
    const attempt = await this.database.client.attempt.findFirst({
      where: { id: attemptId, userId: AI_USER_ID },
      include: {
        session: true,
        taskVersion: { include: { testCases: true, task: true } },
        aiInvocations: {
          where: { feature: 'NUDGE', status: { in: ['SUCCEEDED', 'CACHED'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (attempt === null) throw notFound('ATTEMPT_NOT_FOUND', 'Попытка не найдена');
    const hints = stringArray(attempt.hintsUsed);
    if (attempt.helpLevel === 'NUDGE' && hints[0] !== undefined) {
      return {
        attemptId,
        hintType: 'NUDGE',
        hint: hints[0],
        warnings: [],
        helpLevel: 'NUDGE',
        cacheHit: true,
        invocationId: attempt.aiInvocations[0]?.id ?? null,
      };
    }
    if (attempt.submittedAt !== null) {
      throw new ApiError(
        'AI_NUDGE_NOT_AVAILABLE',
        'Подсказка доступна только до отправки попытки',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    if (attempt.session.status !== 'ACTIVE') {
      throw new ApiError(
        'AI_NUDGE_NOT_AVAILABLE',
        'Подсказка доступна только в активной сессии',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    if (attempt.helpLevel !== 'NONE' || hints.length > 0) {
      throw new ApiError(
        'AI_NUDGE_NOT_AVAILABLE',
        'Для этой попытки уже использована другая помощь',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const forbiddenFragments = fragmentsFrom([
      attempt.taskVersion.expectedAnswer,
      attempt.taskVersion.acceptanceCriteria,
      attempt.taskVersion.testCases.map((testCase) => testCase.expected),
    ]);
    const input: GenerateNudgeInput = GenerateNudgeInputSchema.parse({
      attemptId,
      taskStableKey: attempt.taskVersion.task.stableKey,
      taskVersion: attempt.taskVersion.version,
      promptMarkdown: attempt.taskVersion.promptMarkdown,
      answerText: attempt.answerText,
      answerCode: attempt.answerCode,
      forbiddenFragments,
    });
    const prompt = await synchronizePrompt(this.repository, 'NUDGE');
    const model = this.runtime.modelFor('NUDGE');
    const answerHash = sha256({
      text: attempt.answerText,
      code: attempt.answerCode,
      selectedOptions: attempt.selectedOptions,
    });
    const inputHash = sha256({
      taskChecksum: attempt.taskVersion.checksum,
      answerHash,
      promptChecksum: prompt.checksum,
      contract: AI_NUDGE_CONTRACT,
    });
    const cacheKey = sha256({
      feature: 'NUDGE',
      attemptId,
      taskChecksum: attempt.taskVersion.checksum,
      answerHash,
      promptKey: prompt.key,
      promptVersion: prompt.version,
      model,
      contract: AI_NUDGE_CONTRACT,
    });
    const estimatedCostUsd = estimateInputReservation(
      this.runtime,
      input,
      MAXIMUM_NUDGE_OUTPUT_TOKENS,
    );
    const reservation = await this.repository.reserveInvocation({
      userId: AI_USER_ID,
      period: currentAiPeriod(),
      limitUsd: this.runtime.config.monthlyBudgetUsd,
      feature: 'NUDGE',
      provider: this.runtime.providerName,
      model,
      promptVersionId: prompt.id,
      inputHash,
      cacheKey,
      estimatedCostUsd,
      relatedAttemptId: attemptId,
      relatedTaskVersionId: attempt.taskVersionId,
    });
    if (reservation.outcome === 'REJECTED_BUDGET') {
      throw new ApiError(
        'AI_BUDGET_EXCEEDED',
        'AI-подсказка временно недоступна: месячный лимит исчерпан',
        HttpStatus.TOO_MANY_REQUESTS,
        { manualFallback: true, period: currentAiPeriod() },
      );
    }
    if (reservation.outcome === 'IN_PROGRESS') {
      throw new ApiError(
        'AI_INVOCATION_IN_PROGRESS',
        'Подсказка для этой попытки уже создаётся',
        HttpStatus.CONFLICT,
      );
    }
    if (reservation.outcome !== 'RESERVED') {
      const persisted = await this.persisted(attemptId, reservation.invocation.id);
      if (persisted !== null) return persisted;
      throw new ApiError(
        'AI_INVOCATION_INCOMPLETE',
        'Nudge invocation завершён без сохранённой подсказки',
        HttpStatus.CONFLICT,
      );
    }

    await this.repository.markInvocationRunning(reservation.invocation.id);
    let result: NudgeProviderResult;
    try {
      result = await this.runtime.provider.generateNudge(input, { model });
      const actualCostUsd = this.runtime.calculateCostUsd(result.usage);
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
    const saved = await this.database.client.attempt.updateMany({
      where: {
        id: attemptId,
        userId: AI_USER_ID,
        submittedAt: null,
        helpLevel: 'NONE',
      },
      data: { helpLevel: 'NUDGE', hintsUsed: asJsonInput([result.candidate.hint]) },
    });
    if (saved.count !== 1) {
      const persisted = await this.persisted(attemptId, reservation.invocation.id);
      if (persisted !== null) return persisted;
      throw new ApiError(
        'AI_NUDGE_STATE_CHANGED',
        'Attempt изменился до сохранения подсказки',
        HttpStatus.CONFLICT,
      );
    }
    return this.nudgeView(result.candidate, reservation.invocation.id, false);
  }

  private async persisted(attemptId: string, invocationId: string): Promise<PersistedNudge | null> {
    const attempt = await this.database.client.attempt.findFirst({
      where: { id: attemptId, userId: AI_USER_ID, helpLevel: 'NUDGE' },
      select: { hintsUsed: true },
    });
    const hint = stringArray(attempt?.hintsUsed)[0];
    return hint === undefined
      ? null
      : {
          attemptId,
          hintType: 'NUDGE',
          hint,
          warnings: [],
          helpLevel: 'NUDGE',
          cacheHit: true,
          invocationId,
        };
  }

  private nudgeView(
    candidate: AiNudgeCandidate,
    invocationId: string,
    cacheHit: boolean,
  ): PersistedNudge {
    return {
      attemptId: candidate.attemptId,
      hintType: candidate.hintType,
      hint: candidate.hint,
      warnings: candidate.warnings,
      helpLevel: 'NUDGE',
      cacheHit,
      invocationId,
    };
  }
}
