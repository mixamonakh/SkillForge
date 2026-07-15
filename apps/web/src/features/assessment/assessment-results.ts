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
    pendingItems: items.filter((item) => {
      const coverage = item.attempt?.evaluationCoverage;
      return coverage
        ? coverage.pendingDimensions.length > 0
        : EXTERNAL_REVIEW_KINDS.has(item.task.kind);
    }),
    coveredTopics: new Set(
      items.filter((item) => item.attempt?.submittedAt).map((item) => item.task.topicKey),
    ).size,
    totalTopics: new Set(items.map((item) => item.task.topicKey)).size,
  };
}

const DIMENSION_LABELS: Readonly<Record<string, string>> = {
  RECALL: 'выбор ответа',
  EXPLANATION: 'объяснение',
  PREDICT_OUTPUT: 'вывод программы',
  DEBUGGING: 'поиск причины',
  CODE_CORRECTNESS: 'корректность кода',
  EDGE_CASES: 'краевые случаи',
  COMPLEXITY_REASONING: 'оценка сложности',
  INTERVIEW_RESPONSE: 'интервью-ответ',
  TRANSFER: 'перенос в новую задачу',
  AI_REVIEW: 'review',
  SELF_REPORT: 'самооценка',
};

export function evaluationDimensionLabel(dimension: string): string {
  return DIMENSION_LABELS[dimension] ?? dimension;
}

export function deterministicResultLabel(item: TaskItem): string {
  const evaluation = item.attempt?.deterministicEvaluation;
  if (evaluation?.coverage.isFinal && evaluation.score !== null) {
    return `${Math.round(evaluation.score)} / 100${
      evaluation.passed === null ? '' : evaluation.passed ? ' · пройдено' : ' · не пройдено'
    }`;
  }
  if (evaluation) {
    const checked = Object.entries(evaluation.dimensionScores)
      .map(
        ([dimension, score]) =>
          `${evaluationDimensionLabel(dimension)}: ${Math.round(score)} / 100`,
      )
      .join('; ');
    return checked
      ? `${checked} · проверено частично`
      : 'Локальная проверка не покрывает критерии ответа';
  }
  if (item.attempt?.runnerOutput) return `Worker: ${item.attempt.runnerOutput.status}`;
  return item.attempt?.submittedAt ? 'Проверено локально' : 'Результат ещё не сохранён';
}
