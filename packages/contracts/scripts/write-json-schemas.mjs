import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  exportBundleV1JsonSchema,
  runnerRequestJsonSchema,
  runnerResponseJsonSchema,
  skillForgeAnalysisV1JsonSchema,
} from '../dist/json-schema.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const schemaDirectory = resolve(packageRoot, 'schemas');

await mkdir(schemaDirectory, { recursive: true });
const schemas = [
  ['export-bundle-v1.schema.json', exportBundleV1JsonSchema],
  ['skillforge-analysis-v1.schema.json', skillForgeAnalysisV1JsonSchema],
  ['runner-request.schema.json', runnerRequestJsonSchema],
  ['runner-response.schema.json', runnerResponseJsonSchema],
];

await Promise.all(
  schemas.map(([filename, schema]) =>
    writeFile(resolve(schemaDirectory, filename), `${JSON.stringify(schema, null, 2)}\n`, 'utf8'),
  ),
);
