import { z } from 'zod';

export interface JsonDocumentLimits {
  maxBytes: number;
  maxDepth: number;
  maxArrayLength: number;
  maxObjectKeys: number;
  maxNodes: number;
  maxStringLength: number;
}

export const JSON_DOCUMENT_LIMITS: Readonly<JsonDocumentLimits> = Object.freeze({
  maxBytes: 5 * 1024 * 1024,
  maxDepth: 32,
  maxArrayLength: 10_000,
  maxObjectKeys: 2_000,
  maxNodes: 100_000,
  maxStringLength: 1_000_000,
});

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(JsonValueSchema),
  ]),
);

export class JsonDocumentError extends Error {
  public readonly code:
    | 'EMPTY_DOCUMENT'
    | 'DOCUMENT_TOO_LARGE'
    | 'MALFORMED_JSON'
    | 'INVALID_FENCE'
    | 'MULTIPLE_JSON_FENCES'
    | 'JSON_LIMIT_EXCEEDED'
    | 'UNSAFE_JSON_KEY';

  public constructor(code: JsonDocumentError['code'], message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'JsonDocumentError';
    this.code = code;
  }
}

const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const JSON_FENCE = /```[ \t]*(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```/gi;

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}

export function extractJsonSource(input: string): string {
  const withoutBom = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const trimmed = withoutBom.trim();
  if (trimmed.length === 0) {
    throw new JsonDocumentError('EMPTY_DOCUMENT', 'JSON document is empty');
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return trimmed;

  const matches = [...trimmed.matchAll(JSON_FENCE)];
  if (matches.length === 0) {
    throw new JsonDocumentError('INVALID_FENCE', 'Expected raw JSON or one fenced JSON block');
  }
  if (matches.length > 1) {
    throw new JsonDocumentError('MULTIPLE_JSON_FENCES', 'Only one fenced JSON block is allowed');
  }

  const source = matches[0]?.[1]?.trim();
  if (!source) {
    throw new JsonDocumentError('EMPTY_DOCUMENT', 'Fenced JSON document is empty');
  }
  return source;
}

export function assertJsonLimits(
  value: unknown,
  limits: Readonly<JsonDocumentLimits> = JSON_DOCUMENT_LIMITS,
): asserts value is JsonValue {
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 1 }];
  let nodeCount = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    nodeCount += 1;
    if (nodeCount > limits.maxNodes) {
      throw new JsonDocumentError(
        'JSON_LIMIT_EXCEEDED',
        `JSON has more than ${limits.maxNodes} nodes`,
      );
    }
    if (current.depth > limits.maxDepth) {
      throw new JsonDocumentError(
        'JSON_LIMIT_EXCEEDED',
        `JSON is deeper than ${limits.maxDepth} levels`,
      );
    }

    const item = current.value;
    if (item === null || typeof item === 'boolean') continue;
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) {
        throw new JsonDocumentError('MALFORMED_JSON', 'JSON numbers must be finite');
      }
      continue;
    }
    if (typeof item === 'string') {
      if (item.length > limits.maxStringLength) {
        throw new JsonDocumentError(
          'JSON_LIMIT_EXCEEDED',
          `JSON string exceeds ${limits.maxStringLength} characters`,
        );
      }
      continue;
    }
    if (typeof item !== 'object') {
      throw new JsonDocumentError('MALFORMED_JSON', 'Document contains a non-JSON value');
    }

    if (Array.isArray(item)) {
      if (item.length > limits.maxArrayLength) {
        throw new JsonDocumentError(
          'JSON_LIMIT_EXCEEDED',
          `JSON array exceeds ${limits.maxArrayLength} items`,
        );
      }
      for (let index = item.length - 1; index >= 0; index -= 1) {
        stack.push({ value: item[index], depth: current.depth + 1 });
      }
      continue;
    }

    const entries = Object.entries(item);
    if (entries.length > limits.maxObjectKeys) {
      throw new JsonDocumentError(
        'JSON_LIMIT_EXCEEDED',
        `JSON object exceeds ${limits.maxObjectKeys} keys`,
      );
    }
    for (const [key, child] of entries) {
      if (FORBIDDEN_KEYS.has(key)) {
        throw new JsonDocumentError('UNSAFE_JSON_KEY', `Unsafe JSON key: ${key}`);
      }
      stack.push({ value: child, depth: current.depth + 1 });
    }
  }
}

export function parseJsonDocument(
  input: string,
  limits: Readonly<JsonDocumentLimits> = JSON_DOCUMENT_LIMITS,
): JsonValue {
  if (utf8ByteLength(input) > limits.maxBytes) {
    throw new JsonDocumentError(
      'DOCUMENT_TOO_LARGE',
      `JSON input exceeds ${limits.maxBytes} bytes`,
    );
  }
  const source = extractJsonSource(input);
  let value: unknown;
  try {
    value = JSON.parse(source) as unknown;
  } catch (error) {
    throw new JsonDocumentError('MALFORMED_JSON', 'Could not parse JSON document', {
      cause: error,
    });
  }
  assertJsonLimits(value, limits);
  return value;
}

export function stringifyJsonDocument(value: unknown): string {
  assertJsonLimits(value);
  const serialized = JSON.stringify(value, null, 2);
  if (utf8ByteLength(serialized) > JSON_DOCUMENT_LIMITS.maxBytes) {
    throw new JsonDocumentError(
      'DOCUMENT_TOO_LARGE',
      `JSON output exceeds ${JSON_DOCUMENT_LIMITS.maxBytes} bytes`,
    );
  }
  return serialized;
}
