import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { format } from 'prettier';

import {
  learningSequenceBlueprintV1JsonSchema,
  taskPedagogyMetadataV2JsonSchema,
} from '../src/json-schema.ts';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const schemaDirectory = resolve(packageRoot, 'schemas');
const schemas = [
  ['task-pedagogy-metadata-v2.schema.json', taskPedagogyMetadataV2JsonSchema],
  ['learning-sequence-blueprint-v1.schema.json', learningSequenceBlueprintV1JsonSchema],
];

await mkdir(schemaDirectory, { recursive: true });
await Promise.all(
  schemas.map(async ([filename, schema]) => {
    const json = await format(JSON.stringify(schema), { parser: 'json' });
    await writeFile(resolve(schemaDirectory, filename), json, 'utf8');
  }),
);
