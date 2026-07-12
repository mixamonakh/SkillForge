import type { TaskItem, TaskKind } from '@/shared/api/types';

const DETERMINISTIC_KINDS = new Set<TaskKind>([
  'SINGLE_CHOICE',
  'MULTIPLE_CHOICE',
  'PREDICT_OUTPUT',
  'CODE',
]);

const EXTERNAL_REVIEW_KINDS = new Set<TaskKind>([
  'EXPLAIN',
  'PREDICT_OUTPUT',
  'FIND_BUG',
  'COMPARE_SOLUTIONS',
  'AI_REVIEW',
]);

export function summarizeAssessmentItems(items: TaskItem[]): {
  deterministicCount: number;
  deterministicItems: TaskItem[];
  pendingItems: TaskItem[];
  coveredTopics: number;
  totalTopics: number;
} {
  const deterministicItems = items.filter((item) => DETERMINISTIC_KINDS.has(item.task.kind));
  return {
    deterministicCount: deterministicItems.length,
    deterministicItems,
    pendingItems: items.filter((item) => EXTERNAL_REVIEW_KINDS.has(item.task.kind)),
    coveredTopics: new Set(
      items.filter((item) => item.attempt?.submittedAt).map((item) => item.task.topicKey),
    ).size,
    totalTopics: new Set(items.map((item) => item.task.topicKey)).size,
  };
}

export function deterministicResultLabel(item: TaskItem): string {
  const evaluation = item.attempt?.deterministicEvaluation;
  if (evaluation?.rawScore !== null && evaluation?.rawScore !== undefined) {
    return `${Math.round(evaluation.rawScore)} / 100${
      evaluation.passed === null ? '' : evaluation.passed ? ' · пройдено' : ' · не пройдено'
    }`;
  }
  if (item.attempt?.runnerOutput) return `Worker: ${item.attempt.runnerOutput.status}`;
  return item.attempt?.submittedAt ? 'Проверено локально' : 'Результат ещё не сохранён';
}
