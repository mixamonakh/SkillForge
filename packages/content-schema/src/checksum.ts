import { createHash } from 'node:crypto';

function normalizeForJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeForJson(item));
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, normalizeForJson(item)]),
    );
  }

  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeForJson(value));
}

export function sha256(value: unknown): string {
  return createHash('sha256').update(stableStringify(value), 'utf8').digest('hex');
}
