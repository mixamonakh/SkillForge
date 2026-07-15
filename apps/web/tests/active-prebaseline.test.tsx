import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivePrebaseline } from '@/features/assessment/active-prebaseline';
import type {
  AdaptiveAssessmentRun,
  PrebaselineNextResponse,
  TaskItem,
} from '@/shared/api/types';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  apiMutation: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@/shared/api/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/shared/api/client')>();
  return {
    ...original,
    apiFetch: mocks.apiFetch,
    apiMutation: mocks.apiMutation,
  };
});

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));

function currentItem(): TaskItem {
  return {
    id: 'session-item-1',
    position: 0,
    blockIndex: 0,
    purpose: 'ADAPTIVE_CALIBRATION',
    task: {
      stableKey: 'js-prebaseline.trace-001',
      version: 1,
      topicKey: 'js.execution-order',
      topicTitle: 'Порядок выполнения',
      kind: 'SINGLE_CHOICE',
      promptMarkdown: 'Какой вывод даст этот фрагмент?',
      starterCode: null,
      language: null,
      options: [
        { id: 'a', label: '1, 2' },
        { id: 'unknown', label: 'Не знаю' },
      ],
      hints: [],
      visibleTests: [],
      runnerHarness: null,
    },
    attempt: {
      id: 'attempt-1',
      revision: 1,
      answerText: null,
      answerCode: null,
      selectedOptions: [],
      selfRating: null,
      confidence: null,
      helpLevel: 'NONE',
      hintsUsed: [],
      submittedAt: null,
      runnerOutput: null,
      evaluationCoverage: null,
      deterministicEvaluation: null,
    },
  };
}

function adaptiveRun(
  status: AdaptiveAssessmentRun['status'] = 'ACTIVE',
): AdaptiveAssessmentRun {
  return {
    flow: 'ADAPTIVE_PREBASELINE',
    id: 'prebaseline-run',
    status,
    currentBlock: 0,
    currentPosition: 0,
    totalBlocks: 1,
    totalItems: 18,
    selectedCount: 1,
    answeredCount: 0,
    pendingReviewCount: 0,
    sessionId: 'calibration-session',
    title: 'Быстрая калибровка JavaScript',
    contentStatus: 'DRAFT',
    reviewState: 'NEEDS_HUMAN_REVIEW',
    stopDecision: null,
    items: [currentItem()],
  };
}

function stoppedResponse(): PrebaselineNextResponse {
  return {
    flow: 'ADAPTIVE_PREBASELINE',
    runId: 'prebaseline-run',
    sessionId: 'calibration-session',
    status: 'COMPLETED',
    title: 'Быстрая калибровка JavaScript',
    blueprint: {
      key: 'js-prebaseline-v1',
      version: 1,
      contentStatus: 'DRAFT',
      reviewState: 'NEEDS_HUMAN_REVIEW',
    },
    progress: {
      selected: 1,
      answered: 1,
      pendingReview: 0,
      totalCandidates: 18,
      elapsedMinutes: 2,
      hardCaps: { items: 18, minutes: 35 },
    },
    decision: 'STOP_AND_ROUTE',
    item: null,
    cluster: null,
    reasons: ['Получены два независимых сигнала пробела в чтении кода.'],
    explanation: 'Дополнительный вопрос сейчас не изменит следующий полезный шаг.',
    scoreBreakdown: {},
    dataSufficiency: 'ROUTING_SUFFICIENT',
    primaryGap: 'TRACE',
    recommendedPhase: 'ACQUISITION',
    routingProfile: {
      assessmentRunId: 'prebaseline-run',
      sufficientForRouting: true,
      topicRoutes: [
        {
          topicKey: 'js.execution-order',
          recommendedPhase: 'ACQUISITION',
          primaryGap: 'TRACE',
          observations: { TRACE: 'INSUFFICIENT' },
          reasons: ['Два независимых наблюдения указывают на пробел.'],
        },
      ],
    },
  };
}

function renderPrebaseline(run = adaptiveRun()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const refresh = vi.fn().mockResolvedValue(undefined);
  render(
    <QueryClientProvider client={client}>
      <ActivePrebaseline run={run} refresh={refresh} />
    </QueryClientProvider>,
  );
  return { refresh };
}

describe('ActivePrebaseline', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('exposes adaptive progress and a first-class Unknown action', () => {
    renderPrebaseline();

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '18');
    expect(screen.getByRole('button', { name: 'Ответить: Не знаю' })).toBeInTheDocument();
    expect(screen.getByText('Draft · нужен human review')).toBeInTheDocument();
  });

  it('submits Unknown, advances through the dedicated endpoint, and explains the stop', async () => {
    const response = stoppedResponse();
    mocks.apiMutation.mockImplementation(
      async (path: string, method: string, body?: Record<string, unknown>) => {
        if (method === 'PUT') {
          return {
            ...currentItem().attempt,
            ...body,
            id: 'attempt-1',
            revision: 2,
          };
        }
        if (path === '/api/v1/assessments/prebaseline-run/next') return response;
        return {};
      },
    );
    renderPrebaseline();

    fireEvent.click(screen.getByRole('button', { name: 'Ответить: Не знаю' }));
    fireEvent.click(
      screen.getByRole('button', { name: /сохранить и выбрать следующий шаг/i }),
    );

    expect(await screen.findByText('Следующий полезный шаг определён')).toBeInTheDocument();
    expect(screen.getByText(/два независимых сигнала/i)).toBeInTheDocument();
    expect(screen.getByText('Коротко разобрать механизм')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /открыть тему/i })).toHaveAttribute(
      'href',
      '/topics/js.execution-order',
    );
    expect(screen.queryByText(/mastery|пройдено|не пройдено/i)).not.toBeInTheDocument();

    const autosaveCall = mocks.apiMutation.mock.calls.find(([, method]) => method === 'PUT');
    expect(autosaveCall?.[2]).toMatchObject({
      answerText: 'Не знаю',
      selectedOptions: ['unknown'],
    });
    expect(mocks.apiMutation).toHaveBeenCalledWith(
      '/api/v1/attempts/attempt-1/submit',
      'POST',
    );
    expect(mocks.apiMutation).toHaveBeenCalledWith(
      '/api/v1/assessments/prebaseline-run/next',
      'POST',
    );
  });

  it('shows a resume-only paused state and explains active-time accounting', () => {
    mocks.apiMutation.mockResolvedValue({});
    renderPrebaseline(adaptiveRun('PAUSED'));

    expect(screen.getByRole('button', { name: /продолжить/i })).toBeInTheDocument();
    expect(screen.getByText(/время паузы не входит/i)).toBeInTheDocument();
    expect(screen.queryByText(currentItem().task.promptMarkdown)).not.toBeInTheDocument();
  });

  it('loads the persisted profile when a completed run is opened later', async () => {
    const completed = adaptiveRun('COMPLETED');
    completed.stopDecision = {
      decision: 'STOP_AND_ROUTE',
      reasons: ['Сохранённая причина остановки.'],
      explanation: 'Маршрут сохранён.',
      dataSufficiency: 'ROUTING_SUFFICIENT',
      primaryGap: 'TRACE',
      recommendedPhase: 'ACQUISITION',
    };
    mocks.apiFetch.mockResolvedValue(stoppedResponse().routingProfile);
    renderPrebaseline(completed);

    expect(await screen.findByText('Коротко разобрать механизм')).toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        '/api/v1/assessments/prebaseline-run/routing-profile',
      ),
    );
  });
});
