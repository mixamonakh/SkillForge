import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ActiveAssessment,
  AssessmentBlockCompleted,
} from '@/features/assessment/active-assessment';
import type { AssessmentRun, TaskItem, TaskKind } from '@/shared/api/types';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  apiMutation: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@/shared/api/client', () => ({
  apiFetch: mocks.apiFetch,
  apiMutation: mocks.apiMutation,
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));

function taskItem(id: string, kind: TaskKind, topicKey: string, submitted = true): TaskItem {
  return {
    id,
    position: 0,
    blockIndex: 0,
    purpose: 'ASSESSMENT',
    task: {
      stableKey: `${topicKey}.${kind.toLowerCase()}`,
      version: 1,
      topicKey,
      topicTitle: topicKey,
      kind,
      promptMarkdown: `Prompt ${id}`,
      starterCode: null,
      language: null,
      options: [],
      hints: [],
      visibleTests: [],
      runnerHarness: null,
    },
    attempt: {
      id: `attempt-${id}`,
      revision: 1,
      answerText: 'answer',
      answerCode: '',
      selectedOptions: [],
      selfRating: null,
      confidence: null,
      helpLevel: 'NONE',
      hintsUsed: [],
      submittedAt: submitted ? '2026-07-11T00:00:00.000Z' : null,
      runnerOutput: null,
      deterministicEvaluation:
        kind === 'PREDICT_OUTPUT'
          ? {
              evaluatorType: 'EXACT_MATCH',
              evaluatorVersion: 'exact-match-v1.0',
              rawScore: 100,
              passed: true,
            }
          : null,
    },
  };
}

function run(status: AssessmentRun['status']): AssessmentRun {
  return {
    id: 'assessment-run',
    status,
    currentBlock: 0,
    currentPosition: 0,
    totalBlocks: 1,
    totalItems: 2,
    answeredCount: status === 'ACTIVE' ? 1 : 2,
    pendingReviewCount: 2,
    sessionId: 'session',
    title: 'JavaScript Baseline v1',
    items: [
      taskItem('predict', 'PREDICT_OUTPUT', 'js.one'),
      taskItem('explain', 'EXPLAIN', 'js.two', status !== 'ACTIVE'),
    ],
  };
}

function renderWithClient(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

describe('ActiveAssessment integrity states', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.apiMutation.mockResolvedValue({});
  });

  it('renders a paused run as resume-only without an active answer editor', async () => {
    mocks.apiFetch.mockResolvedValue(run('PAUSED'));
    renderWithClient(<ActiveAssessment runId="assessment-run" />);

    expect(await screen.findByRole('button', { name: /продолжить/i })).toBeInTheDocument();
    expect(screen.queryByText('Prompt predict')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /сохранить и далее/i })).not.toBeInTheDocument();
  });

  it('exposes assessment progress with numeric progressbar semantics', async () => {
    mocks.apiFetch.mockResolvedValue(run('ACTIVE'));
    renderWithClient(<ActiveAssessment runId="assessment-run" />);

    expect(await screen.findByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemin', '1');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '2');
  });

  it('lists block deterministic results by stable key', () => {
    renderWithClient(
      <AssessmentBlockCompleted
        run={run('ACTIVE')}
        blockIndex={0}
        onContinue={vi.fn()}
        onPause={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByText('js.one.predict_output')).toBeInTheDocument();
    expect(screen.getByText(/100 \/ 100 · пройдено/i)).toBeInTheDocument();
  });

  it('shows completed coverage by distinct topic and deterministic results', async () => {
    mocks.apiFetch.mockResolvedValue(run('COMPLETED'));
    renderWithClient(<ActiveAssessment runId="assessment-run" />);

    expect(await screen.findByText('2 из 2')).toBeInTheDocument();
    expect(screen.getAllByText('js.one.predict_output')).not.toHaveLength(0);
    expect(screen.getAllByText(/100 \/ 100 · пройдено/i)).not.toHaveLength(0);
  });
});
