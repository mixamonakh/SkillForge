import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

const migrationPath = path.resolve(
  process.cwd(),
  'prisma/migrations/20260715002000_ai_platform/migration.sql',
);

let migrationSql = '';

beforeAll(async () => {
  migrationSql = await readFile(migrationPath, 'utf8');
});

describe('AI platform additive migration contract', () => {
  it('создаёт exact enums и четыре versioned/audited AI models', () => {
    expect(migrationSql).toContain('CREATE TYPE "AiFeature"');
    expect(migrationSql).toContain('CREATE TYPE "AiInvocationStatus"');
    expect(migrationSql).toContain('CREATE TYPE "AiEvaluationDraftStatus"');
    expect(migrationSql).toContain('CREATE TABLE "AiPromptVersion"');
    expect(migrationSql).toContain('CREATE TABLE "AiInvocation"');
    expect(migrationSql).toContain('CREATE TABLE "AiEvaluationDraft"');
    expect(migrationSql).toContain('CREATE TABLE "AiBudgetPeriod"');
  });

  it('фиксирует hard budget, canonical cache owner и immutable prompt constraints', () => {
    expect(migrationSql).toContain('"spentUsd" + "reservedUsd" <= "limitUsd"');
    expect(migrationSql).toContain('"AiInvocation_cacheKey_provider_result_key"');
    expect(migrationSql).toMatch(
      /WHERE "cacheKey" IS NOT NULL\s+AND "status" IN \('RESERVED', 'RUNNING', 'SUCCEEDED'\)/u,
    );
    expect(migrationSql).toContain('"AiEvaluationDraft_lifecycle_check"');
    expect(migrationSql).toContain('"prevent_ai_prompt_version_mutation"');
    expect(migrationSql).toContain('BEFORE UPDATE OR DELETE ON "AiPromptVersion"');
  });

  it('не переписывает и не удаляет valuable legacy data', () => {
    expect(migrationSql).not.toMatch(/\b(?:TRUNCATE|DROP TABLE|DROP COLUMN)\b/iu);
    expect(migrationSql).not.toMatch(
      /(?:UPDATE|DELETE FROM)\s+"(?:Attempt|Evaluation|Evidence|MetricSnapshot|ImportBatch|TaskVersion|LearningSession)"/iu,
    );
    expect(migrationSql).not.toMatch(
      /ALTER TABLE\s+"(?:Attempt|Evaluation|Evidence|MetricSnapshot|ImportBatch|TaskVersion|LearningSession)"/iu,
    );
  });

  it('не создаёт дубликаты raw answer/provider payload в AI audit tables', () => {
    expect(migrationSql).not.toContain('"answerText"');
    expect(migrationSql).not.toContain('"answerCode"');
    expect(migrationSql).not.toContain('"rawProviderPayload"');
    expect(migrationSql).not.toContain('"providerPayload"');
    expect(migrationSql).toContain('"inputHash" TEXT NOT NULL');
    expect(migrationSql).toContain('"normalizedJson" JSONB NOT NULL');
  });
});
