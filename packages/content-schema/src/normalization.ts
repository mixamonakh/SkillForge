import type {
  CapabilityFamily,
  CognitiveLevel,
  ProductionLoad,
  SupportLevel,
  TaskMetadata,
  TaskPedagogyMetadataV2,
  TransferLevel,
} from './schema.js';

export type NormalizedTaskPedagogyMetadata = {
  sourceSchemaVersion: '1.0' | '2.0';
  evidenceFamilies: CapabilityFamily[];
  cognitiveLevel: CognitiveLevel | null;
  productionLoad: ProductionLoad | null;
  transferLevel: TransferLevel | null;
  supportLevel: SupportLevel | null;
  familyKey: string | null;
  learningOutcomeKeys: string[];
  misconceptionTags: string[];
  estimatedMinutes: number;
  targetRelevance: Record<string, number>;
  documentationUrls: string[];
  mixedEvidence: boolean;
};

export function isTaskPedagogyMetadataV2(
  metadata: TaskMetadata,
): metadata is TaskPedagogyMetadataV2 {
  return 'schemaVersion' in metadata && metadata.schemaVersion === '2.0';
}

/**
 * Converts both metadata generations into a stable read model without mutating
 * the parsed content. Legacy metadata intentionally receives no inferred
 * capability, transfer, or cognitive labels: those claims are not present in
 * js-baseline-v1 and must remain unknown until explicit evidence exists.
 */
export function normalizeTaskPedagogyMetadata(
  metadata: TaskMetadata,
): NormalizedTaskPedagogyMetadata {
  if (!isTaskPedagogyMetadataV2(metadata)) {
    return {
      sourceSchemaVersion: '1.0',
      evidenceFamilies: [],
      cognitiveLevel: null,
      productionLoad: null,
      transferLevel: null,
      supportLevel: null,
      familyKey: null,
      learningOutcomeKeys: [],
      misconceptionTags: [],
      estimatedMinutes: metadata.estimatedMinutes,
      targetRelevance: {},
      documentationUrls: [...metadata.documentationUrls],
      mixedEvidence: metadata.mixedEvidence,
    };
  }

  return {
    sourceSchemaVersion: '2.0',
    evidenceFamilies: [...metadata.evidenceFamilies],
    cognitiveLevel: metadata.cognitiveLevel,
    productionLoad: metadata.productionLoad,
    transferLevel: metadata.transferLevel,
    supportLevel: metadata.supportLevel,
    familyKey: metadata.familyKey,
    learningOutcomeKeys: [...metadata.learningOutcomeKeys],
    misconceptionTags: [...metadata.misconceptionTags],
    estimatedMinutes: metadata.estimatedMinutes,
    targetRelevance: { ...metadata.targetRelevance },
    documentationUrls: [...metadata.documentationUrls],
    mixedEvidence: metadata.mixedEvidence,
  };
}
