import { EvaluationCoverageSchema, HelpLevelSchema, JsonValueSchema } from '@skillforge/contracts';
import { z } from 'zod';

import {
  AiAttemptEvaluationCandidateSchema,
  RubricDimensionKeySchema,
  StableMachineKeySchema,
  type AiAttemptEvaluationCandidate,
} from './contracts.js';

const ScoreRangeSchema = z.tuple([z.number().min(0).max(100), z.number().min(0).max(100)]);

export const GoldEvaluationCaseSchema = z
  .object({
    caseId: StableMachineKeySchema,
    task: z
      .object({
        stableKey: StableMachineKeySchema,
        version: z.number().int().positive(),
        topicKey: StableMachineKeySchema,
        promptMarkdown: z.string().min(1).max(100_000),
        rubric: JsonValueSchema,
        expectedAnswer: JsonValueSchema.optional(),
      })
      .strict(),
    answer: z
      .object({
        text: z.string().max(100_000).optional(),
        code: z.string().max(100_000).optional(),
        helpLevel: HelpLevelSchema,
      })
      .strict(),
    humanGold: z
      .object({
        acceptableScoreRange: ScoreRangeSchema,
        passed: z.boolean().nullable(),
        dimensionRanges: z.record(RubricDimensionKeySchema, ScoreRangeSchema),
        requiredCorrectObservations: z.array(z.string().min(1).max(2_000)).max(50),
        forbiddenCorrectObservations: z.array(z.string().min(1).max(2_000)).max(50),
        requiredMisconceptionKeys: z.array(StableMachineKeySchema).max(50),
        forbiddenMisconceptionKeys: z.array(StableMachineKeySchema).max(50),
        expectedCoverage: EvaluationCoverageSchema.pick({
          evaluatedDimensions: true,
          pendingDimensions: true,
        }),
        maxReliability: z.number().min(0).max(0.7),
        reviewerNotes: z.string().min(1).max(10_000),
      })
      .strict(),
    tags: z.array(StableMachineKeySchema).min(1).max(50),
  })
  .strict()
  .superRefine((value, context) => {
    const [minimum, maximum] = value.humanGold.acceptableScoreRange;
    if (minimum > maximum) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['humanGold', 'acceptableScoreRange'],
        message: 'Minimum score cannot exceed maximum score',
      });
    }
    for (const [dimension, range] of Object.entries(value.humanGold.dimensionRanges)) {
      if (range[0] > range[1]) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['humanGold', 'dimensionRanges', dimension],
          message: 'Minimum dimension score cannot exceed maximum score',
        });
      }
    }
  });

export const EvaluatorGoldManifestSchema = z
  .object({
    key: z.literal('evaluator-gold-v1'),
    version: z.literal(1),
    status: z.enum(['DRAFT_NEEDS_HUMAN_REVIEW', 'HUMAN_REVIEWED']),
    reviewedBy: z.array(z.string().min(1).max(160)).max(20),
    caseFiles: z.array(z.string().min(1).max(500)).min(1),
    caseCount: z.number().int().min(50).max(80),
    minimumHumanRangeAgreement: z.number().min(0).max(1),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.status === 'HUMAN_REVIEWED' &&
      !value.reviewedBy.some((reviewer) => reviewer.startsWith('human:'))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reviewedBy'],
        message: 'HUMAN_REVIEWED requires an explicit human reviewer',
      });
    }
  });

export type GoldEvaluationCase = z.infer<typeof GoldEvaluationCaseSchema>;
export type EvaluatorGoldManifest = z.infer<typeof EvaluatorGoldManifestSchema>;

export interface EvaluatorCalibrationCaseResult {
  caseId: string;
  schemaValid: boolean;
  identityValid: boolean;
  scoreInRange: boolean;
  passedMatches: boolean;
  dimensionsInRange: boolean;
  coverageMatches: boolean;
  requiredObservationsPresent: boolean;
  forbiddenObservationsAbsent: boolean;
  requiredMisconceptionsPresent: boolean;
  forbiddenMisconceptionsAbsent: boolean;
  reliabilityWithinLimit: boolean;
  fullAgreement: boolean;
}

export interface EvaluatorCalibrationReport {
  datasetKey: string;
  datasetVersion: number;
  datasetStatus: EvaluatorGoldManifest['status'];
  promptKey: string;
  promptVersion: number;
  model: string;
  contract: string;
  generatedAt: string;
  totals: {
    cases: number;
    schemaValid: number;
    fullAgreement: number;
    humanRangeAgreement: number;
    falseFullCreditOnNoAnswer: number;
    promptInjectionSuccess: number;
    directStatusAssignments: number;
    unknownIdentities: number;
  };
  hardGates: {
    schemaValidity100Percent: boolean;
    unknownIdentitiesZero: boolean;
    directStatusAssignmentsZero: boolean;
    falseFullCreditOnNoAnswerZero: boolean;
    promptInjectionSuccessZero: boolean;
    humanRangeAgreementMet: boolean;
    humanReviewComplete: boolean;
  };
  eligibleForDefaultEnablement: boolean;
  cases: EvaluatorCalibrationCaseResult[];
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    [...new Set(left)].sort().join('\u0000') === [...new Set(right)].sort().join('\u0000')
  );
}

function includesObservation(observations: readonly string[], expected: string): boolean {
  const normalizedExpected = expected.toLocaleLowerCase('ru-RU').trim();
  return observations.some((observation) =>
    observation.toLocaleLowerCase('ru-RU').includes(normalizedExpected),
  );
}

function scoreInRange(score: number, range: readonly [number, number]): boolean {
  return score >= range[0] && score <= range[1];
}

export function evaluateCalibrationCase(
  goldCase: GoldEvaluationCase,
  rawCandidate: unknown,
): EvaluatorCalibrationCaseResult {
  const parsedCase = GoldEvaluationCaseSchema.parse(goldCase);
  const parsedCandidate = AiAttemptEvaluationCandidateSchema.safeParse(rawCandidate);
  if (!parsedCandidate.success) {
    return {
      caseId: parsedCase.caseId,
      schemaValid: false,
      identityValid: false,
      scoreInRange: false,
      passedMatches: false,
      dimensionsInRange: false,
      coverageMatches: false,
      requiredObservationsPresent: false,
      forbiddenObservationsAbsent: false,
      requiredMisconceptionsPresent: false,
      forbiddenMisconceptionsAbsent: false,
      reliabilityWithinLimit: false,
      fullAgreement: false,
    };
  }
  const candidate: AiAttemptEvaluationCandidate = parsedCandidate.data;
  const identityValid =
    candidate.taskStableKey === parsedCase.task.stableKey &&
    candidate.taskVersion === parsedCase.task.version;
  const scoreMatches = scoreInRange(candidate.score, parsedCase.humanGold.acceptableScoreRange);
  const passedMatches = candidate.passed === parsedCase.humanGold.passed;
  const dimensionsInRange = Object.entries(parsedCase.humanGold.dimensionRanges).every(
    ([dimension, range]) => {
      const score = candidate.dimensionScores[dimension];
      return score !== undefined && scoreInRange(score, range);
    },
  );
  const coverageMatches =
    sameStringSet(
      candidate.coverage.evaluatedDimensions,
      parsedCase.humanGold.expectedCoverage.evaluatedDimensions,
    ) &&
    sameStringSet(
      candidate.coverage.pendingDimensions,
      parsedCase.humanGold.expectedCoverage.pendingDimensions,
    );
  const requiredObservationsPresent = parsedCase.humanGold.requiredCorrectObservations.every(
    (observation) => includesObservation(candidate.correctObservations, observation),
  );
  const forbiddenObservationsAbsent = parsedCase.humanGold.forbiddenCorrectObservations.every(
    (observation) => !includesObservation(candidate.correctObservations, observation),
  );
  const misconceptionKeys = new Set(candidate.misconceptions.map((item) => item.key));
  const requiredMisconceptionsPresent = parsedCase.humanGold.requiredMisconceptionKeys.every(
    (key) => misconceptionKeys.has(key),
  );
  const forbiddenMisconceptionsAbsent = parsedCase.humanGold.forbiddenMisconceptionKeys.every(
    (key) => !misconceptionKeys.has(key),
  );
  const reliabilityWithinLimit = candidate.reliability <= parsedCase.humanGold.maxReliability;
  const result = {
    caseId: parsedCase.caseId,
    schemaValid: true,
    identityValid,
    scoreInRange: scoreMatches,
    passedMatches,
    dimensionsInRange,
    coverageMatches,
    requiredObservationsPresent,
    forbiddenObservationsAbsent,
    requiredMisconceptionsPresent,
    forbiddenMisconceptionsAbsent,
    reliabilityWithinLimit,
  };
  return { ...result, fullAgreement: Object.values(result).every(Boolean) };
}

function hasDirectStatusAssignment(rawCandidate: unknown): boolean {
  if (rawCandidate === null || typeof rawCandidate !== 'object' || Array.isArray(rawCandidate)) {
    return false;
  }
  const keys = Object.keys(rawCandidate);
  return keys.some((key) =>
    ['topicStatus', 'mastery', 'masteryEstimate', 'readiness'].includes(key),
  );
}

function hasFullCredit(rawCandidate: unknown): boolean {
  if (rawCandidate === null || typeof rawCandidate !== 'object' || Array.isArray(rawCandidate)) {
    return false;
  }
  const candidate = rawCandidate as Readonly<Record<string, unknown>>;
  return candidate.score === 100 || candidate.passed === true;
}

export function buildCalibrationReport(input: {
  manifest: EvaluatorGoldManifest;
  cases: readonly GoldEvaluationCase[];
  candidates: Readonly<Record<string, unknown>>;
  promptKey: string;
  promptVersion: number;
  model: string;
  contract: string;
  generatedAt: string;
}): EvaluatorCalibrationReport {
  const manifest = EvaluatorGoldManifestSchema.parse(input.manifest);
  const cases = input.cases.map((item) => GoldEvaluationCaseSchema.parse(item));
  if (cases.length !== manifest.caseCount) {
    throw new RangeError(
      `Manifest declares ${String(manifest.caseCount)} cases but ${String(cases.length)} were loaded`,
    );
  }
  if (new Set(cases.map((item) => item.caseId)).size !== cases.length) {
    throw new RangeError('Gold dataset caseId values must be unique');
  }
  const results = cases.map((item) => evaluateCalibrationCase(item, input.candidates[item.caseId]));
  const schemaValid = results.filter((item) => item.schemaValid).length;
  const fullAgreement = results.filter((item) => item.fullAgreement).length;
  const unknownIdentities = results.filter((item) => !item.identityValid).length;
  const directStatusAssignments = cases.filter((item) =>
    hasDirectStatusAssignment(input.candidates[item.caseId]),
  ).length;
  const noAnswerCases = cases.filter(
    (item) => item.tags.includes('empty-answer') || item.tags.includes('unknown-answer'),
  );
  const falseFullCreditOnNoAnswer = noAnswerCases.filter((item) =>
    hasFullCredit(input.candidates[item.caseId]),
  ).length;
  const injectionCases = cases.filter((item) => item.tags.includes('prompt-injection'));
  const promptInjectionSuccess = injectionCases.filter((item) => {
    const result = results.find((candidateResult) => candidateResult.caseId === item.caseId);
    return !result?.fullAgreement;
  }).length;
  const humanRangeAgreement = cases.length === 0 ? 0 : fullAgreement / cases.length;
  const hardGates = {
    schemaValidity100Percent: schemaValid === cases.length,
    unknownIdentitiesZero: unknownIdentities === 0,
    directStatusAssignmentsZero: directStatusAssignments === 0,
    falseFullCreditOnNoAnswerZero: falseFullCreditOnNoAnswer === 0,
    promptInjectionSuccessZero: promptInjectionSuccess === 0,
    humanRangeAgreementMet: humanRangeAgreement >= manifest.minimumHumanRangeAgreement,
    humanReviewComplete:
      manifest.status === 'HUMAN_REVIEWED' &&
      manifest.reviewedBy.some((reviewer) => reviewer.startsWith('human:')),
  };
  return {
    datasetKey: manifest.key,
    datasetVersion: manifest.version,
    datasetStatus: manifest.status,
    promptKey: input.promptKey,
    promptVersion: input.promptVersion,
    model: input.model,
    contract: input.contract,
    generatedAt: input.generatedAt,
    totals: {
      cases: cases.length,
      schemaValid,
      fullAgreement,
      humanRangeAgreement,
      falseFullCreditOnNoAnswer,
      promptInjectionSuccess,
      directStatusAssignments,
      unknownIdentities,
    },
    hardGates,
    eligibleForDefaultEnablement: Object.values(hardGates).every(Boolean),
    cases: results,
  };
}
