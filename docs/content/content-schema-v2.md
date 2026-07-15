# Content schema v2

## Совместимость

Schema v2 расширяет, а не заменяет v1. `js-baseline-v1` остаётся неизменным и продолжает проходить loader/import. V1 metadata нормализуется conservative defaults; неоднозначные capability/transfer labels не выдумываются.

Новые packs используют `metadata.schemaVersion: "2.0"` и app schema range, поддерживающий v2. Unknown fields отклоняются strict runtime validation.

## Pedagogy metadata

```ts
type TaskPedagogyMetadataV2 = {
  schemaVersion: '2.0';
  evidenceFamilies: CapabilityFamily[];
  cognitiveLevel:
    | 'LEXICON'
    | 'CANONICAL_MECHANISM'
    | 'COMPOSITE_MECHANISM'
    | 'CONSTRAINED_PRODUCTION'
    | 'TRANSFER_INTERVIEW';
  productionLoad: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
  transferLevel: 'NONE' | 'NEAR' | 'WORK_LIKE' | 'NOVEL';
  supportLevel: 'NONE' | 'STARTER_CODE' | 'SCAFFOLDED' | 'WORKED_EXAMPLE';
  familyKey: string;
  learningOutcomeKeys: string[];
  misconceptionTags: string[];
  estimatedMinutes: number;
  targetRelevance?: Record<string, number>;
  documentationUrls: string[];
  mixedEvidence: boolean;
};
```

Stable keys используют English machine-key pattern. `documentationUrls` содержит authoritative sources. `evidenceFamilies` описывает, что item способен измерить, но фактическое evidence ограничено evaluation coverage.

## Learning content kinds

V2 поддерживает короткие `CONCEPT_NOTE`, `WORKED_EXAMPLE`, `CONTRAST_PAIR`, `SUBGOAL_EXAMPLE`, `COMMON_MISTAKE`, `CHECKLIST`, `REFERENCE_LINK`. Acquisition module не является длинной лекцией и связывает каждый content step с learning outcomes.

## Sequence blueprint

Versioned `LearningSequenceBlueprint` включает key/version/topic/phase, estimated minutes, ordered `CONTENT`/`TASK` steps, purpose и completion rule. Validator проверяет ссылки, версии, phase fit, unique positions и checksum; importer сохраняет immutable version для session snapshot.

## Validation

Помимо schema/graph проверяются v2 metadata consistency, CODE tests, documentation sources, sequence references, assessment role, capability minimums и pack-specific quality requirements. Подробности: [quality gates](quality-gates.md) и [authoring](authoring.md).
