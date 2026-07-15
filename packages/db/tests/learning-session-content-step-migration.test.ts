import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

const migrationPath = path.resolve(
  process.cwd(),
  'prisma/migrations/20260715001000_learning_session_content_steps/migration.sql',
);

let migrationSql = '';

beforeAll(async () => {
  migrationSql = await readFile(migrationPath, 'utf8');
});

describe('LearningSessionContentStep additive migration contract', () => {
  it('создаёт отдельное immutable content-step storage с ownership и ordering constraints', () => {
    expect(migrationSql).toContain('CREATE TABLE "LearningSessionContentStep"');
    expect(migrationSql).toContain('"sessionId" UUID NOT NULL');
    expect(migrationSql).toContain('"contentItemId" UUID NOT NULL');
    expect(migrationSql).toContain('"sequencePosition" INTEGER NOT NULL');
    expect(migrationSql).toContain('"snapshot" JSONB NOT NULL');
    expect(migrationSql).toContain('"completedAt" TIMESTAMP(3)');
    expect(migrationSql).toContain('"LearningSessionContentStep_sessionId_sequencePosition_key"');
    expect(migrationSql).toContain('REFERENCES "LearningSession"("id") ON DELETE CASCADE');
    expect(migrationSql).toContain('REFERENCES "ContentItem"("id") ON DELETE RESTRICT');
  });

  it('не переписывает и не удаляет существующие пользовательские данные', () => {
    expect(migrationSql).not.toMatch(/^\s*(?:UPDATE|DELETE\s+FROM|TRUNCATE)\b/imu);
    expect(migrationSql).not.toMatch(/DROP\s+(?:TABLE|COLUMN)/iu);
    expect(migrationSql).not.toMatch(
      /ALTER\s+TABLE\s+"(?:LearningSession|SessionItem|Attempt|Evaluation|Evidence|ImportBatch)"/iu,
    );
    expect(migrationSql).not.toContain('"planSnapshot"');
    expect(migrationSql).not.toContain('"answerText"');
    expect(migrationSql).not.toContain('"answerCode"');
  });
});
