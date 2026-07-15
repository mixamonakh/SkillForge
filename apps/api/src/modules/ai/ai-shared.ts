import { HttpStatus } from '@nestjs/common';
import {
  AiProviderError,
  promptForFeature,
  type AiPromptDefinition,
  type SupportedAiFeature,
} from '@skillforge/ai-provider';
import {
  AiPersistenceError,
  createAiRepository,
  DEFAULT_USER_ID,
  type AiRepository,
  type Prisma,
} from '@skillforge/db';

import { ApiError } from '../../common/api-error.js';
import type { PrismaService } from '../../database/prisma.service.js';
import { type AiRuntime } from './ai-runtime.provider.js';

export const AI_REPOSITORY = Symbol('AI_REPOSITORY');

export function apiDatabaseSchema(): string {
  const rawUrl = process.env.DATABASE_URL;
  const value = rawUrl ? new URL(rawUrl).searchParams.get('schema')?.trim() : undefined;
  const schema = value || 'public';
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(schema)) {
    throw new TypeError('DATABASE_URL schema has an invalid identifier');
  }
  return schema;
}

export function createApiAiRepository(database: PrismaService): AiRepository {
  return createAiRepository(database.client, {
    databaseSchema: apiDatabaseSchema(),
  });
}

export async function setApiTransactionSchema(
  transaction: Prisma.TransactionClient,
): Promise<void> {
  await transaction.$executeRawUnsafe(`SET LOCAL search_path TO "${apiDatabaseSchema()}"`);
}

export function currentAiPeriod(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

export function money(value: { toString(): string } | number | null): number | null {
  if (value === null) return null;
  const parsed = Number(typeof value === 'number' ? value : value.toString());
  return Number.isFinite(parsed) ? parsed : null;
}

export function roundedReservation(value: number): number {
  return Math.ceil((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

export function estimateInputReservation(
  runtime: AiRuntime,
  input: unknown,
  maximumOutputTokens: number,
): number {
  if (runtime.config.pricing === null) return 0;
  // A BPE token cannot contain less than one UTF-8 byte. Counting every byte as a token is a
  // conservative upper bound without sending the answer to a tokenizer or log.
  const maximumInputTokens = Buffer.byteLength(JSON.stringify(input), 'utf8');
  return roundedReservation(
    runtime.calculateCostUsd({
      inputTokens: maximumInputTokens,
      cachedInputTokens: 0,
      outputTokens: maximumOutputTokens,
    }),
  );
}

export function assertAiFeature(runtime: AiRuntime, feature: 'attemptEvaluation' | 'nudge'): void {
  if (runtime.config.mode !== 'api-assisted' || !runtime.config.features[feature]) {
    throw new ApiError(
      'AI_PROVIDER_DISABLED',
      'API-assisted функция выключена; ручной export/import остаётся доступен',
      HttpStatus.SERVICE_UNAVAILABLE,
      { manualFallback: true, feature },
    );
  }
}

export async function synchronizePrompt(
  repository: AiRepository,
  feature: SupportedAiFeature,
): Promise<AiPromptDefinition & { id: string }> {
  const prompt = promptForFeature(feature);
  const registered = await repository.registerPromptVersion({
    key: prompt.key,
    version: prompt.version,
    feature,
    systemPrompt: prompt.systemPrompt,
    schemaVersion: prompt.schemaVersion,
    checksum: prompt.checksum,
    active: true,
  });
  const active = registered.promptVersion.active
    ? registered.promptVersion
    : await repository.setPromptVersionActive(registered.promptVersion.id, true);
  return { ...prompt, id: active.id };
}

export function providerApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof AiProviderError) {
    const invalid =
      error.code === 'AI_PROVIDER_RESPONSE_INVALID' || error.code === 'AI_PROVIDER_DOMAIN_INVALID';
    return new ApiError(
      invalid ? 'AI_RESULT_INVALID' : 'AI_PROVIDER_FAILED',
      invalid
        ? 'Provider вернул результат, не прошедший локальную проверку'
        : 'AI provider временно недоступен; используй ручной workflow',
      HttpStatus.BAD_GATEWAY,
      { providerCode: error.code, manualFallback: true },
    );
  }
  if (error instanceof AiPersistenceError) {
    if (error.code === 'AI_INVALID_TRANSITION') {
      return new ApiError(
        'AI_DRAFT_TRANSITION_INVALID',
        'AI draft находится в несовместимом состоянии',
        HttpStatus.CONFLICT,
      );
    }
    return new ApiError('AI_PERSISTENCE_FAILED', error.message, HttpStatus.CONFLICT);
  }
  return new ApiError(
    'AI_PROVIDER_FAILED',
    'AI provider временно недоступен; используй ручной workflow',
    HttpStatus.BAD_GATEWAY,
    { manualFallback: true },
  );
}

export const AI_USER_ID = DEFAULT_USER_ID;
