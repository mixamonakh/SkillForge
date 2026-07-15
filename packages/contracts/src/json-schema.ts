import { zodToJsonSchema } from 'zod-to-json-schema';

import { EvaluationCoverageSchema, EvaluationResultV2Schema } from './evaluation.js';
import { ExportBundleV1, SkillForgeAnalysisV1 } from './import-export.js';
import { RunnerRequestSchema, RunnerResponseSchema } from './runner.js';

export const evaluationCoverageJsonSchema = zodToJsonSchema(EvaluationCoverageSchema, {
  name: 'EvaluationCoverage',
  target: 'jsonSchema7',
  $refStrategy: 'root',
});

export const evaluationResultV2JsonSchema = zodToJsonSchema(EvaluationResultV2Schema, {
  name: 'EvaluationResultV2',
  target: 'jsonSchema7',
  $refStrategy: 'root',
});

export const exportBundleV1JsonSchema = zodToJsonSchema(ExportBundleV1, {
  name: 'ExportBundleV1',
  target: 'jsonSchema7',
  $refStrategy: 'root',
});

export const skillForgeAnalysisV1JsonSchema = zodToJsonSchema(SkillForgeAnalysisV1, {
  name: 'SkillForgeAnalysisV1',
  target: 'jsonSchema7',
  $refStrategy: 'root',
});

export const runnerRequestJsonSchema = zodToJsonSchema(RunnerRequestSchema, {
  name: 'RunnerRequest',
  target: 'jsonSchema7',
  $refStrategy: 'root',
});

export const runnerResponseJsonSchema = zodToJsonSchema(RunnerResponseSchema, {
  name: 'RunnerResponse',
  target: 'jsonSchema7',
  $refStrategy: 'root',
});
