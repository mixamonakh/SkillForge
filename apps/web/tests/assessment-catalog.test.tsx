import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssessmentCatalog } from '@/features/assessment/assessment-catalog';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  apiMutation: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@/shared/api/client', () => ({
  apiFetch: mocks.apiFetch,
  apiMutation: mocks.apiMutation,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

describe('AssessmentCatalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.apiFetch.mockResolvedValue([
      {
        key: 'js-baseline',
        version: 1,
        title: 'JavaScript Baseline v1',
        description: 'Baseline',
        totalBlocks: 4,
        totalItems: 36,
        estimatedMin: 90,
        taskKinds: ['PREDICT_OUTPUT', 'CODE'],
        activeRun: null,
        latestCompletedRun: { id: 'completed-run', status: 'COMPLETED', answered: 36 },
        completedRuns: 1,
      },
    ]);
  });

  it('opens the latest result without creating another run', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <AssessmentCatalog />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /посмотреть результат/i }));

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/assessment/completed-run'));
    expect(mocks.apiMutation).not.toHaveBeenCalled();
  });

  it('starts the draft prebaseline through its dedicated adaptive endpoint', async () => {
    mocks.apiFetch.mockResolvedValue([
      {
        key: 'js-prebaseline-v1',
        version: 1,
        title: 'Быстрая калибровка JavaScript',
        description: 'Короткая адаптивная калибровка',
        totalBlocks: 1,
        totalItems: 18,
        estimatedMin: 29,
        taskKinds: ['SINGLE_CHOICE', 'PREDICT_OUTPUT', 'CODE'],
        flow: 'ADAPTIVE_PREBASELINE',
        contentStatus: 'DRAFT',
        reviewState: 'NEEDS_HUMAN_REVIEW',
        activeRun: null,
        latestCompletedRun: null,
        completedRuns: 0,
      },
    ]);
    mocks.apiMutation.mockResolvedValue({ runId: 'prebaseline-run' });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <AssessmentCatalog />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Draft · нужен human review')).toBeInTheDocument();
    expect(screen.getByText(/human dry run/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^начать$/i }));

    await waitFor(() =>
      expect(mocks.apiMutation).toHaveBeenCalledWith(
        '/api/v1/assessments/prebaseline/start',
        'POST',
      ),
    );
    expect(mocks.push).toHaveBeenCalledWith('/assessment/prebaseline-run');
    expect(mocks.apiMutation).not.toHaveBeenCalledWith(
      expect.stringContaining('/runs'),
      expect.anything(),
    );
  });
});
