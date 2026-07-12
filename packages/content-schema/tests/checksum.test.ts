import { describe, expect, it } from 'vitest';

import { sha256, stableStringify } from '../src/index.js';

describe('stableStringify', () => {
  it('не зависит от порядка ключей объекта', () => {
    const left = { version: 1, task: { key: 'js.values.types', values: [1, 2] } };
    const right = { task: { values: [1, 2], key: 'js.values.types' }, version: 1 };

    expect(stableStringify(left)).toBe(stableStringify(right));
    expect(sha256(left)).toBe(sha256(right));
  });

  it('сохраняет порядок массивов', () => {
    expect(sha256(['A', 'B'])).not.toBe(sha256(['B', 'A']));
  });
});
