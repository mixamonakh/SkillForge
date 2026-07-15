import { EvaluationResultV2Schema, type EvaluationResultV2 } from '@skillforge/contracts';
import type { EvaluatorType } from '@skillforge/db';

import { currentRunnerResult } from '../../common/bound-runner-result.js';
import { objectValue, stringArray } from '../../common/json.js';
import {
  deterministicEvaluationResult,
  evaluationCoverage,
} from '../assessment/deterministic-evaluation.js';

type SessionItemRecord = {
  id: string;
  position: number;
  purpose: string;
  taskVersion: {
    version: number;
    promptMarkdown: string;
    starterCode: string | null;
    language: string | null;
    options: unknown;
    rubric: unknown;
    hints: unknown;
    testCases: Array<{ name: string; testCode: string | null; hidden: boolean; position: number }>;
    task: {
      stableKey: string;
      kind: string;
      topic: { key: string; title: string };
    };
  };
  attempts: Array<{
    id: string;
    revision: number;
    answerText: string | null;
    answerCode: string | null;
    selectedOptions: unknown;
    selfRating: number | null;
    confidence: number | null;
    helpLevel: string;
    hintsUsed: unknown;
    submittedAt: Date | null;
    runnerOutput: unknown;
    evaluations?: Array<{
      evaluatorType: string;
      evaluatorVersion: string;
      rawScore: number | null;
      passed: boolean | null;
      dimensionScores: unknown;
      rubricResult: unknown;
    }>;
  }>;
};

export type SnapshotItem = {
  sessionItemId: string;
  taskVersionId: string;
  blockIndex: number;
  position: number;
  required: boolean;
  purpose: string;
};

export type AssessmentSnapshot = {
  schemaVersion: '1.0';
  blueprint: { key: string; version: number; checksum: string; totalBlocks: number };
  items: SnapshotItem[];
};

function options(value: unknown): Array<{ id: string; label: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const record = objectValue(item);
    if (typeof record.id !== 'string') return [];
    const label =
      typeof record.text === 'string'
        ? record.text
        : typeof record.label === 'string'
          ? record.label
          : record.id;
    return [{ id: record.id, label }];
  });
}

function runnerHarness(testCases: SessionItemRecord['taskVersion']['testCases']): string | null {
  if (testCases.length === 0) return null;
  return testCases
    .filter(
      (testCase): testCase is typeof testCase & { testCode: string } => testCase.testCode !== null,
    )
    .sort((left, right) => left.position - right.position)
    .map((testCase, index) => {
      const name = testCase.hidden ? `Скрытая проверка ${String(index + 1)}` : testCase.name;
      const body = testCase.hidden
        ? `eval(atob(${JSON.stringify(Buffer.from(testCase.testCode, 'utf8').toString('base64'))}));`
        : testCase.testCode;
      return `test(${JSON.stringify(name)}, () => {\n${body}\n});`;
    })
    .join('\n');
}

export function parseAssessmentSnapshot(value: unknown): AssessmentSnapshot | null {
  const root = objectValue(value);
  const blueprint = objectValue(root.blueprint);
  if (
    root.schemaVersion !== '1.0' ||
    typeof blueprint.key !== 'string' ||
    typeof blueprint.version !== 'number' ||
    typeof blueprint.checksum !== 'string' ||
    typeof blueprint.totalBlocks !== 'number' ||
    !Array.isArray(root.items)
  ) {
    return null;
  }
  const items: SnapshotItem[] = [];
  for (const raw of root.items) {
    const item = objectValue(raw);
    if (
      typeof item.sessionItemId !== 'string' ||
      typeof item.taskVersionId !== 'string' ||
      typeof item.blockIndex !== 'number' ||
      typeof item.position !== 'number' ||
      typeof item.required !== 'boolean' ||
      typeof item.purpose !== 'string'
    ) {
      return null;
    }
    items.push({
      sessionItemId: item.sessionItemId,
      taskVersionId: item.taskVersionId,
      blockIndex: item.blockIndex,
      position: item.position,
      required: item.required,
      purpose: item.purpose,
    });
  }
  return {
    schemaVersion: '1.0',
    blueprint: {
      key: blueprint.key,
      version: blueprint.version,
      checksum: blueprint.checksum,
      totalBlocks: blueprint.totalBlocks,
    },
    items,
  };
}

type AttemptEvaluationContext = { taskKind: string; rubric: unknown };

export function projectDeterministicEvaluation(
  evaluation: NonNullable<SessionItemRecord['attempts'][number]['evaluations']>[number] | undefined,
  context: AttemptEvaluationContext | undefined,
): EvaluationResultV2 | null {
  if (!evaluation) return null;
  const stored = EvaluationResultV2Schema.safeParse(evaluation.rubricResult);
  if (stored.success) return stored.data;
  if (
    !context ||
    evaluation.rawScore === null ||
    !['EXACT_MATCH', 'TEST_RUNNER'].includes(evaluation.evaluatorType)
  ) {
    return null;
  }
  return deterministicEvaluationResult({
    taskKind: context.taskKind,
    rubric: context.rubric,
    evaluatorType: evaluation.evaluatorType as 'EXACT_MATCH' | 'TEST_RUNNER',
    evaluatorVersion: evaluation.evaluatorVersion,
    rawScore: evaluation.rawScore,
  });
}

export function serializeAttempt(
  attempt: SessionItemRecord['attempts'][number] | undefined,
  context?: AttemptEvaluationContext,
  evaluationOverride?: EvaluationResultV2 | null,
): unknown {
  if (!attempt) return null;
  const deterministicEvaluation =
    evaluationOverride === undefined
      ? projectDeterministicEvaluation(attempt.evaluations?.[0], context)
      : evaluationOverride;
  const coverage =
    attempt.submittedAt && context
      ? (deterministicEvaluation?.coverage ??
        evaluationCoverage(context.taskKind, context.rubric, false))
      : null;
  return {
    id: attempt.id,
    revision: attempt.revision,
    answerText: attempt.answerText,
    answerCode: attempt.answerCode,
    selectedOptions: stringArray(attempt.selectedOptions),
    selfRating: attempt.selfRating,
    confidence: attempt.confidence,
    helpLevel: attempt.helpLevel,
    hintsUsed: stringArray(attempt.hintsUsed),
    submittedAt: attempt.submittedAt?.toISOString() ?? null,
    runnerOutput: currentRunnerResult(attempt.runnerOutput, attempt.answerCode),
    evaluationCoverage: coverage,
    deterministicEvaluation,
  };
}

export function serializeTaskItem(
  item: SessionItemRecord,
  assessmentItem?: SnapshotItem,
  assessment = false,
  hideHints = false,
): unknown {
  return {
    id: item.id,
    position: assessmentItem?.position ?? item.position,
    blockIndex: assessmentItem?.blockIndex ?? 0,
    purpose: assessmentItem?.purpose ?? item.purpose,
    task: {
      stableKey: item.taskVersion.task.stableKey,
      version: item.taskVersion.version,
      topicKey: item.taskVersion.task.topic.key,
      topicTitle: item.taskVersion.task.topic.title,
      kind: item.taskVersion.task.kind,
      promptMarkdown: item.taskVersion.promptMarkdown,
      starterCode: item.taskVersion.starterCode,
      language: item.taskVersion.language,
      options: options(item.taskVersion.options),
      hints: assessment || hideHints ? [] : stringArray(item.taskVersion.hints),
      visibleTests: item.taskVersion.testCases
        .filter((testCase) => !testCase.hidden)
        .sort((left, right) => left.position - right.position)
        .map((testCase) => ({ name: testCase.name })),
      runnerHarness:
        item.taskVersion.task.kind === 'CODE' ? runnerHarness(item.taskVersion.testCases) : null,
    },
    attempt: serializeAttempt(item.attempts[0], {
      taskKind: item.taskVersion.task.kind,
      rubric: item.taskVersion.rubric,
    }),
  };
}

export const SESSION_ITEM_INCLUDE = {
  taskVersion: {
    include: {
      task: { include: { topic: { select: { key: true, title: true } } } },
      testCases: { orderBy: { position: 'asc' as const } },
    },
  },
  attempts: {
    orderBy: { sequence: 'desc' as const },
    take: 1,
    include: {
      evaluations: {
        where: {
          evaluatorType: { in: ['EXACT_MATCH', 'TEST_RUNNER'] as EvaluatorType[] },
          supersededBy: null,
        },
        orderBy: { createdAt: 'desc' as const },
        take: 1,
      },
    },
  },
} as const;
