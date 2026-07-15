import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AiEvaluationReview, AiReviewList } from '@/features/ai/ai-evaluation-review';
import { ApiError } from '@/shared/api/client';
import type { TaskItem } from '@/shared/api/types';

const ATTEMPT_ID = '6862fe60-a3b1-44cc-84f3-f4cfd188479d';
const DRAFT_ID = '28ff1272-50ea-4cc7-bcbe-80f2f6724a7d';
const INVOCATION_ID = '8bf178ac-4e51-45de-a012-e72a22837c20';
const EVALUATION_ID = 'ee48402d-c83f-43d2-8726-5595c5743d79';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn<(path: string) => Promise<unknown>>(),
  apiMutation: vi.fn<(path: string, method: string) => Promise<unknown>>(),
}));

vi.mock('@/shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api/client')>();
  return { ...actual, apiFetch: mocks.apiFetch, apiMutation: mocks.apiMutation };
});

const usage = {
  period: '2026-07',
  mode: 'api-assisted',
  features: { attemptEvaluation: true, contentReview: false, nudge: true },
  limitUsd: 10,
  spentUsd: 0.0042,
  reservedUsd: 0,
  remainingUsd: 9.9958,
  requestCount: 1,
  cacheHits: 0,
  failures: 0,
  averageCostUsd: 0.0042,
  appliedDrafts: 0,
  rejectedDrafts: 0,
  models: [],
};

function response(
  status: 'PENDING' | 'APPLIED' | 'REJECTED' | 'ROLLED_BACK' = 'PENDING',
  prebaselineSuppressed = false,
) {
  return {
    draft: {
      id: DRAFT_ID,
      attemptId: ATTEMPT_ID,
      status,
      createdAt: '2026-07-15T10:00:00.000Z',
      appliedAt:
        status === 'APPLIED' || status === 'ROLLED_BACK' ? '2026-07-15T10:01:00.000Z' : null,
      rejectedAt: status === 'REJECTED' ? '2026-07-15T10:01:00.000Z' : null,
      rolledBackAt: status === 'ROLLED_BACK' ? '2026-07-15T10:02:00.000Z' : null,
      appliedEvaluationId: status === 'APPLIED' || status === 'ROLLED_BACK' ? EVALUATION_ID : null,
      rollbackEvaluationId:
        status === 'ROLLED_BACK' ? '23c83d0b-4f54-413a-af04-605e77a39b08' : null,
    },
    invocation: {
      id: INVOCATION_ID,
      status: 'SUCCEEDED',
      provider: 'fake',
      model: 'fake-deterministic-v1',
      promptKey: 'attempt-evaluator-v1',
      promptVersion: 1,
      estimatedCostUsd: 0.0042,
      actualCostUsd: 0.0042,
      cacheHit: false,
      cacheSourceInvocationId: null,
    },
    candidate: {
      contract: 'skillforge-ai-attempt-evaluation-v1',
      attemptId: ATTEMPT_ID,
      taskStableKey: 'js.references.explain-sharing-001',
      taskVersion: 1,
      score: 60,
      passed: true,
      reliability: 0.5,
      dimensionScores: { EXPLANATION: 60 },
      correctObservations: ['Правильно отмечено общее значение.'],
      errors: ['Не объяснена мутация по ссылке.'],
      misconceptions: [],
      evidenceCandidates: [
        {
          topicKey: 'js.references',
          kind: 'EXPLANATION',
          strength: 0.6,
          explanation: 'Ограниченное evidence из объяснения.',
        },
      ],
      coverage: {
        evaluatedDimensions: ['EXPLANATION'],
        pendingDimensions: [],
        unsupportedDimensions: [],
        isFinal: true,
      },
      feedbackMarkdown: 'Проверь разницу между ссылкой и значением.',
      warnings: ['FAKE_PROVIDER_RESULT'],
    },
    preview: {
      deterministicEvaluations: [],
      candidateEvidence: [
        {
          topicKey: 'js.references',
          kind: 'EXPLANATION',
          strength: 0.6,
          explanation: 'Ограниченное evidence из объяснения.',
        },
      ],
      projectedChanges: prebaselineSuppressed
        ? []
        : [
            {
              topicKey: 'js.references',
              current: {
                status: 'UNKNOWN',
                masteryEstimate: null,
                masteryConfidence: 0,
                evidenceCount: 0,
              },
              projected: {
                status: 'WEAK',
                masteryEstimate: 60,
                masteryConfidence: 30,
                evidenceCount: 1,
              },
            },
          ],
      prebaselineSuppressed,
      cost: { estimatedUsd: 0.0042, actualUsd: 0.0042, cacheHit: false },
    },
    actions: {
      canApply: status === 'PENDING',
      canReject: status === 'PENDING',
      canRollback: status === 'APPLIED',
    },
  };
}

function renderReview() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AiEvaluationReview
        attemptId={ATTEMPT_ID}
        manualExportHref="/import-export?mode=export&assessmentRunId=assessment-run"
      />
    </QueryClientProvider>,
  );
}

function ReviewListHarness() {
  const [final, setFinal] = useState(false);
  const item: TaskItem = {
    id: '0d501f06-1c9c-4f62-899f-3219d31566e7',
    position: 0,
    blockIndex: 0,
    purpose: 'ASSESSMENT',
    task: {
      stableKey: 'js.references.explain-sharing-001',
      version: 1,
      topicKey: 'js.references',
      topicTitle: 'Ссылки и объекты',
      kind: 'EXPLAIN',
      promptMarkdown: 'Объясни shared reference.',
      starterCode: null,
      language: null,
      options: [],
      hints: [],
      visibleTests: [],
      runnerHarness: null,
    },
    attempt: {
      id: ATTEMPT_ID,
      revision: 1,
      answerText: 'Обе переменные содержат одну ссылку.',
      answerCode: null,
      selectedOptions: [],
      selfRating: null,
      confidence: null,
      helpLevel: 'NONE',
      hintsUsed: [],
      submittedAt: '2026-07-15T09:59:00.000Z',
      runnerOutput: null,
      deterministicEvaluation: null,
      evaluationCoverage: {
        evaluatedDimensions: final ? ['EXPLANATION'] : [],
        pendingDimensions: final ? [] : ['EXPLANATION'],
        unsupportedDimensions: [],
        isFinal: final,
      },
    },
  };
  return (
    <AiReviewList
      items={[item]}
      manualExportHref="/import-export?mode=export&sessionId=session"
      onLifecycleChange={() => setFinal(true)}
    />
  );
}

function renderReviewList() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ReviewListHarness />
    </QueryClientProvider>,
  );
}

async function requestReview(): Promise<void> {
  const button = await screen.findByRole('button', { name: /запросить AI-проверку/i });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
}

describe('AI evaluation preview lifecycle', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mocks.apiFetch.mockImplementation(async (path) => {
      if (path === '/api/v1/ai/usage/current') return usage;
      if (path === `/api/v1/ai/evaluations/${DRAFT_ID}`) return response();
      throw new Error(`Unexpected GET ${path}`);
    });
    mocks.apiMutation.mockImplementation(async (path) => {
      if (path.endsWith('/evaluate')) return response();
      if (path.endsWith('/apply')) return response('APPLIED');
      if (path.endsWith('/reject')) return response('REJECTED');
      if (path.endsWith('/rollback')) return response('ROLLED_BACK');
      throw new Error(`Unexpected POST ${path}`);
    });
  });

  it('renders a strict preview and exposes only pending actions', async () => {
    renderReview();

    await requestReview();

    expect(await screen.findByTestId('ai-evaluation-preview')).toBeInTheDocument();
    expect(screen.getByText('Правильно отмечено общее значение.')).toBeInTheDocument();
    expect(screen.getByText('Не объяснена мутация по ссылке.')).toBeInTheDocument();
    expect(screen.getByText('EXPLANATION')).toBeInTheDocument();
    expect(screen.getByText('Projected state diff')).toBeInTheDocument();
    expect(screen.getByText('Evidence: 1 · confidence 30%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Применить' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Отклонить' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Откатить/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manual export' })).toHaveAttribute(
      'href',
      '/import-export?mode=export&assessmentRunId=assessment-run',
    );
    expect(window.localStorage.getItem(`skillforge:ai-evaluation-draft:${ATTEMPT_ID}`)).toBe(
      DRAFT_ID,
    );
  });

  it('allows rollback only after apply and removes pending actions', async () => {
    renderReview();
    await requestReview();
    fireEvent.click(await screen.findByRole('button', { name: 'Применить' }));

    expect(await screen.findByText('Применено')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Применить' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Отклонить' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Откатить применение/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Откатить применение/ }));
    expect(await screen.findByText('Отменено компенсирующей оценкой')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Откатить применение/ })).not.toBeInTheDocument();
  });

  it('rejects a pending draft without exposing apply or rollback afterward', async () => {
    renderReview();
    await requestReview();
    fireEvent.click(await screen.findByRole('button', { name: 'Отклонить' }));

    expect(await screen.findByText('Отклонено')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Применить' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Отклонить' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Откатить применение/ })).not.toBeInTheDocument();
  });

  it('keeps an applied draft visible for rollback after pending coverage becomes final', async () => {
    renderReviewList();
    await requestReview();
    fireEvent.click(await screen.findByRole('button', { name: 'Применить' }));

    expect(await screen.findByRole('button', { name: /Откатить применение/ })).toBeInTheDocument();
    expect(screen.getByTestId('ai-review-list')).toBeInTheDocument();
  });

  it('restores the server draft by id after reload', async () => {
    window.localStorage.setItem(`skillforge:ai-evaluation-draft:${ATTEMPT_ID}`, DRAFT_ID);
    renderReview();

    expect(await screen.findByTestId('ai-evaluation-preview')).toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(`/api/v1/ai/evaluations/${DRAFT_ID}`),
    );
  });

  it('explains pre-baseline suppression before apply', async () => {
    mocks.apiMutation.mockResolvedValue(response('PENDING', true));
    renderReview();
    await requestReview();

    expect(
      await screen.findByText('Pre-baseline: knowledge state не изменится'),
    ).toBeInTheDocument();
    expect(screen.getByText(/не создаст Evidence/i)).toBeInTheDocument();
  });

  it('keeps manual export available when the provider is disabled', async () => {
    mocks.apiFetch.mockResolvedValue({
      ...usage,
      mode: 'manual',
      features: { attemptEvaluation: false, contentReview: false, nudge: false },
    });
    renderReview();

    expect(await screen.findByText(/API-assisted проверка выключена/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /запросить AI-проверку/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manual export' })).toBeInTheDocument();
  });

  it('renders a budget failure without removing the manual path', async () => {
    mocks.apiMutation.mockRejectedValue(
      new ApiError(429, {
        error: { code: 'AI_BUDGET_EXCEEDED', message: 'Budget exhausted' },
      }),
    );
    renderReview();
    await requestReview();

    expect(await screen.findByRole('alert')).toHaveTextContent(/лимит исчерпан/i);
    expect(screen.getByRole('link', { name: 'Manual export' })).toBeInTheDocument();
  });
});
