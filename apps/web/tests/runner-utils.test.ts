import { describe, expect, it } from 'vitest';
import {
  appendConsoleLine,
  createRunnerAssert,
  MAX_CONSOLE_LINES,
  MAX_CONSOLE_LINE_LENGTH,
  printable,
} from '@/features/runner/runner-utils';

describe('runner console limits', () => {
  it('caps line count and individual output size', () => {
    const lines: string[] = [];
    for (let index = 0; index < MAX_CONSOLE_LINES + 20; index += 1) {
      appendConsoleLine(lines, ['x'.repeat(MAX_CONSOLE_LINE_LENGTH + 100), index]);
    }
    expect(lines).toHaveLength(MAX_CONSOLE_LINES);
    expect(lines.every((line) => line.length <= MAX_CONSOLE_LINE_LENGTH)).toBe(true);
  });

  it('serializes values without executing custom HTML and tolerates cycles', () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(printable({ html: '<img onerror=alert(1)>' })).toContain('<img');
    expect(printable(cyclic)).toBe('[object Object]');
  });

  it('implements the callable and Node-style assertion contract used by content harnesses', () => {
    const assert = createRunnerAssert();
    expect(() => assert(true)).not.toThrow();
    expect(() => assert.equal(1, 1)).not.toThrow();
    expect(() => assert.deepEqual({ value: [1, 2] }, { value: [1, 2] })).not.toThrow();
    expect(() => assert.notEqual(1, 2)).not.toThrow();
    expect(() => assert.equal(1, 2)).toThrow();
    expect(() => assert.deepEqual([1], [2])).toThrow();
    expect(() => assert.notEqual(1, 1)).toThrow();
  });
});
