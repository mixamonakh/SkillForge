import type { TaskKind } from '@skillforge/db';

import type { SessionPlanDto } from './sessions.dto.js';

export type SessionTaskCandidate = {
  id: string;
  stableKey: string;
  kind: TaskKind;
  difficulty: string;
  language: string | null;
};

export type PlannedSessionTask<T extends SessionTaskCandidate> = {
  task: T;
  purpose: string;
};

const ITEMS_BY_LOAD: Readonly<Record<SessionPlanDto['loadMode'], number>> = {
  MINIMAL: 3,
  NORMAL: 4,
  DEEP: 5,
  RETURN: 2,
};

const MODE_KIND_ORDER: Readonly<Record<SessionPlanDto['mode'], readonly (readonly TaskKind[])[]>> =
  {
    TRAINING: [
      ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'FLASHCARD'],
      ['EXPLAIN'],
      ['PREDICT_OUTPUT', 'FIND_BUG'],
      ['CODE'],
      ['COMPARE_SOLUTIONS', 'AI_REVIEW'],
    ],
    REVIEW: [
      ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'FLASHCARD', 'PREDICT_OUTPUT'],
      ['FIND_BUG'],
      ['CODE'],
      ['EXPLAIN', 'COMPARE_SOLUTIONS'],
      ['AI_REVIEW'],
    ],
    INTERVIEW: [
      ['EXPLAIN', 'COMPARE_SOLUTIONS'],
      ['PREDICT_OUTPUT'],
      ['FIND_BUG'],
      ['CODE'],
      ['SINGLE_CHOICE', 'MULTIPLE_CHOICE'],
    ],
    RETURN: [
      ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'FLASHCARD', 'PREDICT_OUTPUT'],
      ['FIND_BUG', 'CODE'],
    ],
    BATTLE: [
      ['CODE'],
      ['FIND_BUG'],
      ['EXPLAIN', 'COMPARE_SOLUTIONS'],
      ['PREDICT_OUTPUT'],
      ['SINGLE_CHOICE', 'MULTIPLE_CHOICE'],
    ],
  };

const RETURN_RETRIEVAL_KINDS: readonly TaskKind[] = [
  'SINGLE_CHOICE',
  'MULTIPLE_CHOICE',
  'FLASHCARD',
  'PREDICT_OUTPUT',
];
const RETURN_APPLICATION_KINDS: readonly TaskKind[] = ['FIND_BUG', 'CODE'];

export function purposeForTaskKind(kind: TaskKind): string {
  switch (kind) {
    case 'SINGLE_CHOICE':
    case 'MULTIPLE_CHOICE':
    case 'FLASHCARD':
      return 'retrieval';
    case 'EXPLAIN':
      return 'explanation';
    case 'PREDICT_OUTPUT':
      return 'predict-output';
    case 'FIND_BUG':
      return 'debugging';
    case 'CODE':
      return 'code';
    case 'COMPARE_SOLUTIONS':
      return 'compare-solutions';
    case 'AI_REVIEW':
      return 'reflection';
  }
}

export function selectSessionTasks<T extends SessionTaskCandidate>(
  candidates: readonly T[],
  plan: Pick<SessionPlanDto, 'mode' | 'loadMode' | 'codeLanguage'>,
): Array<PlannedSessionTask<T>> {
  const limit = ITEMS_BY_LOAD[plan.mode === 'RETURN' ? 'RETURN' : plan.loadMode];
  const ordered = [...candidates].sort((left, right) => {
    const leftLanguage = left.kind !== 'CODE' || left.language === plan.codeLanguage ? 0 : 1;
    const rightLanguage = right.kind !== 'CODE' || right.language === plan.codeLanguage ? 0 : 1;
    return (
      leftLanguage - rightLanguage ||
      left.difficulty.localeCompare(right.difficulty) ||
      left.stableKey.localeCompare(right.stableKey)
    );
  });
  if (plan.mode === 'RETURN') {
    const retrieval = ordered.find((candidate) => RETURN_RETRIEVAL_KINDS.includes(candidate.kind));
    let application: T | undefined;
    for (const kind of RETURN_APPLICATION_KINDS) {
      application = ordered.find(
        (candidate) => candidate.id !== retrieval?.id && candidate.kind === kind,
      );
      if (application) break;
    }
    return [retrieval, application]
      .filter((candidate): candidate is T => candidate !== undefined)
      .map((task) => ({ task, purpose: purposeForTaskKind(task.kind) }));
  }
  const selected: T[] = [];
  const selectedIds = new Set<string>();
  for (const kinds of MODE_KIND_ORDER[plan.mode]) {
    const candidate = ordered.find(
      (item) => !selectedIds.has(item.id) && kinds.includes(item.kind),
    );
    if (candidate) {
      selected.push(candidate);
      selectedIds.add(candidate.id);
    }
    if (selected.length >= limit) break;
  }
  for (const candidate of ordered) {
    if (selected.length >= limit) break;
    if (selectedIds.has(candidate.id)) continue;
    selected.push(candidate);
    selectedIds.add(candidate.id);
  }
  return selected.map((task) => ({ task, purpose: purposeForTaskKind(task.kind) }));
}
