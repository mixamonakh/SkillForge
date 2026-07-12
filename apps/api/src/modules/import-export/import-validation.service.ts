import { createHash } from 'node:crypto';

import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ContractValidationError,
  JsonDocumentError,
  SkillForgeAnalysisV1,
  parseSkillForgeAnalysisV1,
  stringifyJsonDocument,
} from '@skillforge/contracts';
import { DEFAULT_USER_ID, Prisma } from '@skillforge/db';

import { ApiError, notFound } from '../../common/api-error.js';
import { asJsonInput } from '../../common/json.js';
import { PrismaService } from '../../database/prisma.service.js';

function checksum(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

@Injectable()
export class ImportValidationService {
  public constructor(private readonly database: PrismaService) {}

  public async validate(payload: string, source: string): Promise<unknown> {
    let analysis: SkillForgeAnalysisV1;
    try {
      analysis = parseSkillForgeAnalysisV1(payload);
    } catch (error) {
      if (error instanceof ContractValidationError) {
        throw new ApiError(
          'IMPORT_SCHEMA_INVALID',
          'Analysis JSON не соответствует skillforge-analysis-v1',
          HttpStatus.BAD_REQUEST,
          { issues: error.issues },
        );
      }
      if (error instanceof JsonDocumentError) {
        throw new ApiError(error.code, error.message, HttpStatus.BAD_REQUEST);
      }
      throw error;
    }
    const normalized = stringifyJsonDocument(analysis);
    const digest = checksum(normalized);
    const existing = await this.database.client.importBatch.findUnique({
      where: { userId_checksum: { userId: DEFAULT_USER_ID, checksum: digest } },
    });
    if (existing) {
      return this.validationResponse(existing, [
        'Этот checksum уже зарегистрирован; повторное применение не создаст evidence.',
      ]);
    }
    const sourceBundle = await this.database.client.exportBundle.findFirst({
      where: { id: analysis.sourceBundleId, userId: DEFAULT_USER_ID },
      select: { id: true },
    });
    const warnings = [
      ...(sourceBundle
        ? []
        : ['Source bundle не найден локально; attempt/topic matching будет показан в preview.']),
      ...(analysis.attemptEvaluations.some((item) => item.reliability > 0.65)
        ? ['External AI reliability будет ограничена значением 0.65.']
        : []),
    ];
    try {
      const batch = await this.database.client.importBatch.create({
        data: {
          userId: DEFAULT_USER_ID,
          schemaVersion: analysis.schemaVersion,
          source,
          sourceBundleId: analysis.sourceBundleId,
          status: 'VALIDATED',
          checksum: digest,
          rawPayload: asJsonInput(analysis),
          normalized: asJsonInput(analysis),
          validationErrors: asJsonInput([]),
        },
      });
      return this.validationResponse(batch, warnings);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicate = await this.database.client.importBatch.findUniqueOrThrow({
          where: { userId_checksum: { userId: DEFAULT_USER_ID, checksum: digest } },
        });
        return this.validationResponse(duplicate, [
          'Этот checksum уже зарегистрирован; повторное применение не создаст evidence.',
        ]);
      }
      throw error;
    }
  }

  public async list(): Promise<unknown[]> {
    const batches = await this.database.client.importBatch.findMany({
      where: { userId: DEFAULT_USER_ID },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });
    return batches.map((batch) => ({
      id: batch.id,
      status: batch.status,
      source: batch.source,
      checksum: batch.checksum,
      createdAt: batch.createdAt.toISOString(),
      appliedAt: batch.appliedAt?.toISOString() ?? null,
    }));
  }

  public async get(importId: string): Promise<unknown> {
    const batch = await this.database.client.importBatch.findFirst({
      where: { id: importId, userId: DEFAULT_USER_ID },
    });
    if (!batch) throw notFound('IMPORT_NOT_FOUND', 'Import batch не найден');
    const normalized = SkillForgeAnalysisV1.safeParse(batch.normalized);
    return {
      id: batch.id,
      status: batch.status,
      source: batch.source,
      sourceBundleId: batch.sourceBundleId,
      checksum: batch.checksum,
      preview: batch.preview,
      validationErrors: batch.validationErrors,
      normalizedJson: normalized.success ? stringifyJsonDocument(normalized.data) : null,
      createdAt: batch.createdAt.toISOString(),
      appliedAt: batch.appliedAt?.toISOString() ?? null,
    };
  }

  private validationResponse(
    batch: {
      id: string;
      schemaVersion: string;
      sourceBundleId: string | null;
      normalized: Prisma.JsonValue | null;
    },
    warnings: string[],
  ): unknown {
    const normalized = SkillForgeAnalysisV1.safeParse(batch.normalized);
    return {
      importId: batch.id,
      schemaVersion: batch.schemaVersion,
      sourceBundleId: batch.sourceBundleId,
      warnings,
      normalizedJson: normalized.success ? stringifyJsonDocument(normalized.data) : null,
    };
  }
}
