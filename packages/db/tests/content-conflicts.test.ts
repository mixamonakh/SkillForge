import { describe, expect, it } from 'vitest';

import { assertNoContentConflicts, type ContentDatabaseDiff } from '../src/content/diff.js';

function createDiff(overrides: Partial<ContentDatabaseDiff> = {}): ContentDatabaseDiff {
  return {
    pack: { key: 'js-baseline-v1', version: '1.0.0', checksum: 'pack-checksum' },
    alreadyImported: false,
    tasks: { create: 72, unchanged: 0, conflicts: 0 },
    contentItems: { create: 18, unchanged: 0, conflicts: 0 },
    assessments: { create: 1, unchanged: 0, conflicts: 0 },
    conflictDetails: [],
    ...overrides,
  };
}

describe('assertNoContentConflicts', () => {
  it('разрешает идемпотентный import без конфликтов', () => {
    expect(() =>
      assertNoContentConflicts(
        createDiff({
          alreadyImported: true,
          tasks: { create: 0, unchanged: 72, conflicts: 0 },
          contentItems: { create: 0, unchanged: 18, conflicts: 0 },
          assessments: { create: 0, unchanged: 1, conflicts: 0 },
        }),
      ),
    ).not.toThrow();
  });

  it('запрещает перезапись неизменяемой task version', () => {
    const conflict = {
      kind: 'task' as const,
      stableKey: 'js.values.types.predict-001',
      version: '1',
      existingChecksum: 'old',
      incomingChecksum: 'new',
    };

    expect(() =>
      assertNoContentConflicts(
        createDiff({
          tasks: { create: 0, unchanged: 71, conflicts: 1 },
          conflictDetails: [conflict],
        }),
      ),
    ).toThrow(/создайте новую version/iu);
  });
});
