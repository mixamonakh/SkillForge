import { describe, expect, it } from 'vitest';

import { assertNoContentConflicts, type ContentDatabaseDiff } from '../src/content/diff.js';

function createDiff(overrides: Partial<ContentDatabaseDiff> = {}): ContentDatabaseDiff {
  return {
    pack: { key: 'js-baseline-v1', version: '1.0.0', checksum: 'pack-checksum' },
    alreadyImported: false,
    tracks: { create: 2, update: 0, reuse: 0, conflicts: 0 },
    topics: { create: 18, update: 0, reuse: 0, conflicts: 0 },
    tasks: { create: 72, unchanged: 0, conflicts: 0 },
    contentItems: { create: 18, unchanged: 0, conflicts: 0 },
    assessments: { create: 1, unchanged: 0, conflicts: 0 },
    sequences: { create: 0, unchanged: 0, conflicts: 0 },
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
          sequences: { create: 0, unchanged: 0, conflicts: 0 },
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

  it('запрещает несовместимое cross-pack переопределение shared topic', () => {
    expect(() =>
      assertNoContentConflicts(
        createDiff({
          topics: { create: 0, update: 0, reuse: 17, conflicts: 1 },
          conflictDetails: [
            {
              kind: 'topic',
              stableKey: 'cs.values-and-references',
              version: '1.0.0',
              existingChecksum: 'owner-semantics',
              incomingChecksum: 'foreign-semantics',
            },
          ],
        }),
      ),
    ).toThrow(/создайте новую version/iu);
  });
});
