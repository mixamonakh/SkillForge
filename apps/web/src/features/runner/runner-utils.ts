export const MAX_CONSOLE_LINES = 100;
export const MAX_CONSOLE_LINE_LENGTH = 2_000;

export type RunnerAssert = {
  (condition: unknown, message?: string): void;
  equal(actual: unknown, expected: unknown): void;
  deepEqual(actual: unknown, expected: unknown): void;
  notEqual(actual: unknown, expected: unknown): void;
};

export function printable(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function appendConsoleLine(lines: string[], values: unknown[], prefix = ''): void {
  if (lines.length >= MAX_CONSOLE_LINES) return;
  lines.push(`${prefix}${values.map(printable).join(' ')}`.slice(0, MAX_CONSOLE_LINE_LENGTH));
}

function structurallyEqual(actual: unknown, expected: unknown): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

export function createRunnerAssert(): RunnerAssert {
  const assertCondition = (condition: unknown, message = 'Ожидалось истинное условие') => {
    if (!condition) throw new Error(message);
  };
  const equal = (actual: unknown, expected: unknown) => {
    if (!Object.is(actual, expected)) {
      throw new Error(`Ожидалось ${printable(expected)}, получено ${printable(actual)}`);
    }
  };
  const deepEqual = (actual: unknown, expected: unknown) => {
    if (!structurallyEqual(actual, expected)) {
      throw new Error(`Ожидалось ${printable(expected)}, получено ${printable(actual)}`);
    }
  };
  const notEqual = (actual: unknown, expected: unknown) => {
    if (Object.is(actual, expected)) {
      throw new Error(`Значения не должны быть равны: ${printable(actual)}`);
    }
  };
  return Object.assign(assertCondition, { equal, deepEqual, notEqual });
}
