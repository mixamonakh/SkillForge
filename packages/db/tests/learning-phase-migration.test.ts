import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

const migrationPath = path.resolve(
  process.cwd(),
  'prisma/migrations/20260715000000_learning_sequences_and_phases/migration.sql',
);

let migrationSql = '';

beforeAll(async () => {
  migrationSql = await readFile(migrationPath, 'utf8');
});

describe('LearningPhase safe migration contract', () => {
  it('добавляет nullable column, выполняет backfill и только затем ставит NOT NULL', () => {
    const addColumnAt = migrationSql.indexOf('ADD COLUMN "learningPhase" "LearningPhase";');
    const backfillAt = migrationSql.indexOf('UPDATE "LearningSession"');
    const notNullAt = migrationSql.indexOf('ALTER COLUMN "learningPhase" SET NOT NULL;');

    expect(addColumnAt).toBeGreaterThanOrEqual(0);
    expect(backfillAt).toBeGreaterThan(addColumnAt);
    expect(notNullAt).toBeGreaterThan(backfillAt);
  });

  it.each([
    ['ASSESSMENT', 'CALIBRATION'],
    ['TRAINING', 'ACQUISITION'],
    ['REVIEW', 'CONSOLIDATION'],
    ['RETURN', 'CONSOLIDATION'],
    ['INTERVIEW', 'TRANSFER'],
    ['BATTLE', 'TRANSFER'],
  ])('фиксирует mapping %s -> %s', (mode, phase) => {
    expect(migrationSql).toContain(`WHEN '${mode}' THEN '${phase}'::"LearningPhase"`);
  });

  it('не удаляет существующие sessions, attempts или snapshots', () => {
    expect(migrationSql).not.toMatch(
      /DELETE\s+FROM\s+"(?:LearningSession|Attempt)"|DROP\s+TABLE\s+"(?:LearningSession|Attempt)"/iu,
    );
    expect(migrationSql).not.toContain('SET "planSnapshot"');
  });
});
