import { describe, expect, it } from 'vitest';

import { createVersionImportPlan } from '../src/index.js';

describe('createVersionImportPlan', () => {
  it('считает повторный импорт с тем же checksum идемпотентным', () => {
    const version = { stableKey: 'js.values.types.predict-001', version: 1, checksum: 'same' };
    const plan = createVersionImportPlan([version], [version]);

    expect(plan.create).toEqual([]);
    expect(plan.unchanged).toEqual([version]);
    expect(plan.conflicts).toEqual([]);
  });

  it('запрещает тихую перезапись существующей версии', () => {
    const plan = createVersionImportPlan(
      [{ stableKey: 'js.values.types.predict-001', version: 1, checksum: 'new' }],
      [{ stableKey: 'js.values.types.predict-001', version: 1, checksum: 'old' }],
    );

    expect(plan.conflicts).toEqual([
      {
        stableKey: 'js.values.types.predict-001',
        version: 1,
        existingChecksum: 'old',
        incomingChecksum: 'new',
      },
    ]);
  });
});
