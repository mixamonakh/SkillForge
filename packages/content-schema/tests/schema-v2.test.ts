import { describe, expect, it } from 'vitest';

import {
  ContentItemSchema,
  LearningSequenceBlueprintSchema,
  TaskMetadataSchema,
  TaskPedagogyMetadataV2Schema,
  learningSequenceBlueprintV1JsonSchema,
  normalizeTaskPedagogyMetadata,
  supportsAppSchema,
  taskPedagogyMetadataV2JsonSchema,
} from '../src/index.js';

const legacyMetadata = {
  yandexRelevance: 4,
  estimatedMinutes: 7,
  mixedEvidence: true,
  documentationUrls: ['https://developer.mozilla.org/'],
};

const v2Metadata = {
  schemaVersion: '2.0',
  evidenceFamilies: ['TRACE', 'MECHANISM'],
  cognitiveLevel: 'CANONICAL_MECHANISM',
  productionLoad: 'NONE',
  transferLevel: 'NONE',
  supportLevel: 'NONE',
  familyKey: 'js.references.shared-object',
  learningOutcomeKeys: ['js.references.explain-shared-object'],
  misconceptionTags: ['assignment-copies-object'],
  estimatedMinutes: 3,
  targetRelevance: { 'target.js-frontend': 5 },
  documentationUrls: ['https://developer.mozilla.org/'],
  mixedEvidence: true,
} as const;

const sequence = {
  schemaVersion: '1.0',
  key: 'js.references.acquisition-v1',
  version: 1,
  topicKey: 'cs.values-and-references',
  phase: 'ACQUISITION',
  estimatedMinutes: 25,
  steps: [
    {
      kind: 'CONTENT',
      contentItemKey: 'js.references.canonical-model',
      version: 1,
    },
    {
      kind: 'TASK',
      taskKey: 'js.references.predict-basic-001',
      version: 1,
      purpose: 'PREDICT',
    },
  ],
  completionRule: {
    requiredSteps: 2,
    minimumNoHelpSuccesses: 1,
  },
} as const;

describe('content schema v2', () => {
  it('читает v1 metadata без изменения исходной формы', () => {
    const parsed = TaskMetadataSchema.parse(legacyMetadata);

    expect(parsed).toEqual(legacyMetadata);
    expect(parsed).not.toHaveProperty('schemaVersion');
  });

  it('нормализует v1 metadata без выдуманных capability labels', () => {
    const normalized = normalizeTaskPedagogyMetadata(TaskMetadataSchema.parse(legacyMetadata));

    expect(normalized).toMatchObject({
      sourceSchemaVersion: '1.0',
      evidenceFamilies: [],
      cognitiveLevel: null,
      productionLoad: null,
      transferLevel: null,
      supportLevel: null,
      familyKey: null,
      learningOutcomeKeys: [],
      misconceptionTags: [],
      targetRelevance: {},
    });
  });

  it('валидирует и нормализует полный metadata v2 contract', () => {
    const parsed = TaskPedagogyMetadataV2Schema.parse(v2Metadata);
    const normalized = normalizeTaskPedagogyMetadata(parsed);

    expect(normalized).toEqual({
      sourceSchemaVersion: '2.0',
      evidenceFamilies: ['TRACE', 'MECHANISM'],
      cognitiveLevel: 'CANONICAL_MECHANISM',
      productionLoad: 'NONE',
      transferLevel: 'NONE',
      supportLevel: 'NONE',
      familyKey: 'js.references.shared-object',
      learningOutcomeKeys: ['js.references.explain-shared-object'],
      misconceptionTags: ['assignment-copies-object'],
      estimatedMinutes: 3,
      targetRelevance: { 'target.js-frontend': 5 },
      documentationUrls: ['https://developer.mozilla.org/'],
      mixedEvidence: true,
    });
  });

  it('отклоняет неизвестные поля в v1 и v2 metadata', () => {
    expect(
      TaskMetadataSchema.safeParse({ ...legacyMetadata, inferredFamily: 'TRACE' }).success,
    ).toBe(false);
    expect(
      TaskMetadataSchema.safeParse({ ...v2Metadata, directMasteryStatus: 'MASTERED' }).success,
    ).toBe(false);
  });

  it('поддерживает v2 content kinds, сохраняя legacy kinds', () => {
    const baseItem = {
      stableKey: 'js.references.note',
      version: 1,
      topicKey: 'cs.values-and-references',
      title: 'Значения и ссылки',
      bodyMarkdown: 'Короткая canonical explanation.',
      status: 'active',
    } as const;

    expect(ContentItemSchema.safeParse({ ...baseItem, kind: 'CONCEPT_NOTE' }).success).toBe(true);
    expect(ContentItemSchema.safeParse({ ...baseItem, kind: 'THEORY' }).success).toBe(true);
  });

  it('валидирует strict versioned learning sequence contract', () => {
    expect(LearningSequenceBlueprintSchema.parse(sequence)).toEqual(sequence);
    expect(
      LearningSequenceBlueprintSchema.safeParse({ ...sequence, recommendationScore: 99 }).success,
    ).toBe(false);
    expect(
      LearningSequenceBlueprintSchema.safeParse({
        ...sequence,
        completionRule: { ...sequence.completionRule, requiredSteps: 3 },
      }).success,
    ).toBe(false);
    expect(
      LearningSequenceBlueprintSchema.safeParse({
        ...sequence,
        completionRule: { requiredSteps: 2, minimumNoHelpSuccesses: 2 },
      }).success,
    ).toBe(false);
  });

  it('поддерживает одновременно legacy и v2 app schema ranges', () => {
    expect(supportsAppSchema('>=1.0.0 <2.0.0')).toBe(true);
    expect(supportsAppSchema('>=2.0.0 <3.0.0')).toBe(true);
    expect(supportsAppSchema('>=3.0.0 <4.0.0')).toBe(false);
  });

  it('публикует strict JSON Schema artifacts', () => {
    expect(taskPedagogyMetadataV2JsonSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
    });
    expect(learningSequenceBlueprintV1JsonSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
    });
  });
});
