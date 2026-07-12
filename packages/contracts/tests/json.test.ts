import { describe, expect, it } from 'vitest';

import {
  assertJsonLimits,
  extractJsonSource,
  JsonDocumentError,
  parseJsonDocument,
  stringifyJsonDocument,
  type JsonDocumentLimits,
  JSON_DOCUMENT_LIMITS,
} from '../src/index.js';

describe('untrusted JSON parsing', () => {
  it('extracts exactly one JSON fence from a Markdown wrapper', () => {
    expect(extractJsonSource('Пояснение\n\n```json\n{"ok":true}\n```\n')).toBe('{"ok":true}');
    expect(() => extractJsonSource('```json\n{}\n```\n```json\n{}\n```')).toThrow(
      expect.objectContaining({ code: 'MULTIPLE_JSON_FENCES' }),
    );
  });

  it('rejects excessive depth, arrays, nodes and unsafe object keys', () => {
    const tightLimits: JsonDocumentLimits = {
      ...JSON_DOCUMENT_LIMITS,
      maxDepth: 2,
      maxArrayLength: 2,
      maxNodes: 4,
    };
    expect(() => parseJsonDocument('{"a":{"b":true}}', tightLimits)).toThrow(JsonDocumentError);
    expect(() => parseJsonDocument('[1,2,3]', tightLimits)).toThrow(JsonDocumentError);
    expect(() => parseJsonDocument('{"__proto__":{}}')).toThrow(
      expect.objectContaining({ code: 'UNSAFE_JSON_KEY' }),
    );
    expect(() => assertJsonLimits([1, 2, 3, 4], tightLimits)).toThrow(JsonDocumentError);
  });

  it('rejects non-JSON inputs without attempting permissive parsing', () => {
    expect(() => parseJsonDocument('const value = { ok: true };')).toThrow(
      expect.objectContaining({ code: 'INVALID_FENCE' }),
    );
  });

  it('handles BOM, raw arrays and all UTF-8 byte-width branches deterministically', () => {
    expect(parseJsonDocument('\uFEFF [true,null,1,"я","€","😀"]')).toEqual([
      true,
      null,
      1,
      'я',
      '€',
      '😀',
    ]);
    const invalidSurrogate = '\ud800';
    expect(parseJsonDocument(JSON.stringify({ value: invalidSurrogate }))).toEqual({
      value: invalidSurrogate,
    });
  });

  it.each([
    ['', 'EMPTY_DOCUMENT'],
    ['```json\n\n```', 'EMPTY_DOCUMENT'],
    ['{"broken":}', 'MALFORMED_JSON'],
  ])('rejects invalid document %j as %s', (input, code) => {
    expect(() => parseJsonDocument(input)).toThrow(expect.objectContaining({ code }));
  });

  it('enforces byte, string, object-key and finite-number limits', () => {
    const tiny: JsonDocumentLimits = {
      ...JSON_DOCUMENT_LIMITS,
      maxBytes: 4,
      maxStringLength: 2,
      maxObjectKeys: 1,
    };
    expect(() => parseJsonDocument('"яя"', tiny)).toThrow(
      expect.objectContaining({ code: 'DOCUMENT_TOO_LARGE' }),
    );
    expect(() => assertJsonLimits('abc', tiny)).toThrow(
      expect.objectContaining({ code: 'JSON_LIMIT_EXCEEDED' }),
    );
    expect(() => assertJsonLimits({ a: 1, b: 2 }, tiny)).toThrow(
      expect.objectContaining({ code: 'JSON_LIMIT_EXCEEDED' }),
    );
    expect(() => assertJsonLimits(Number.POSITIVE_INFINITY, tiny)).toThrow(
      expect.objectContaining({ code: 'MALFORMED_JSON' }),
    );
    expect(() => assertJsonLimits(undefined, tiny)).toThrow(
      expect.objectContaining({ code: 'MALFORMED_JSON' }),
    );
  });

  it.each(['constructor', 'prototype'])('rejects the unsafe %s key', (key) => {
    expect(() => parseJsonDocument(`{"${key}":{}}`)).toThrow(
      expect.objectContaining({ code: 'UNSAFE_JSON_KEY' }),
    );
  });

  it('stringifies valid data and rejects oversized output', () => {
    expect(stringifyJsonDocument({ ok: true })).toBe('{\n  "ok": true\n}');
    expect(() =>
      stringifyJsonDocument({ payload: 'x'.repeat(JSON_DOCUMENT_LIMITS.maxBytes) }),
    ).toThrow(expect.objectContaining({ code: 'JSON_LIMIT_EXCEEDED' }));
  });
});
