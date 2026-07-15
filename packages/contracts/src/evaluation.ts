import { z } from 'zod';

export const EvaluationCoverageSchema = z
  .object({
    evaluatedDimensions: z.array(z.string()),
    pendingDimensions: z.array(z.string()),
    unsupportedDimensions: z.array(z.string()),
    isFinal: z.boolean(),
  })
  .strict();

export const EvaluationResultV2Schema = z
  .object({
    evaluatorType: z.string(),
    evaluatorVersion: z.string(),
    score: z.number().min(0).max(100).nullable(),
    passed: z.boolean().nullable(),
    dimensionScores: z.record(z.string(), z.number().min(0).max(100)),
    coverage: EvaluationCoverageSchema,
    feedback: z.array(z.string()),
  })
  .strict();

export type EvaluationCoverage = z.infer<typeof EvaluationCoverageSchema>;
export type EvaluationResultV2 = z.infer<typeof EvaluationResultV2Schema>;
