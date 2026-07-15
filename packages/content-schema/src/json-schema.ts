import { z } from 'zod';

import { LearningSequenceBlueprintSchema, TaskPedagogyMetadataV2Schema } from './schema.js';

const jsonSchemaOptions = {
  target: 'draft-07',
  io: 'input',
} as const;

export const taskPedagogyMetadataV2JsonSchema = z.toJSONSchema(
  TaskPedagogyMetadataV2Schema,
  jsonSchemaOptions,
);

export const learningSequenceBlueprintV1JsonSchema = z.toJSONSchema(
  LearningSequenceBlueprintSchema,
  jsonSchemaOptions,
);
