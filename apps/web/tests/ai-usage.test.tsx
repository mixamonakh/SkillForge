import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AiUsagePanel } from '@/features/ai/ai-usage';

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock('@/shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api/client')>();
  return { ...actual, apiFetch: mocks.apiFetch };
});

function renderUsage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AiUsagePanel />
    </QueryClientProvider>,
  );
}

function usage(mode: 'manual' | 'api-assisted') {
  return {
    period: '2026-07',
    mode,
    features: {
      attemptEvaluation: mode === 'api-assisted',
      contentReview: false,
      nudge: mode === 'api-assisted',
    },
    limitUsd: 10,
    spentUsd: 1.25,
    reservedUsd: 0.5,
    remainingUsd: 8.25,
    requestCount: 5,
    cacheHits: 2,
    failures: 1,
    averageCostUsd: 0.25,
    appliedDrafts: 2,
    rejectedDrafts: 1,
    models: [
      {
        provider: 'fake',
        model: 'fake-deterministic-v1',
        promptKey: 'attempt-evaluator-v1',
        promptVersion: 1,
        requestCount: 5,
        costUsd: 1.25,
      },
    ],
  };
}

describe('AI usage UI', () => {
  afterEach(cleanup);
  beforeEach(() => vi.clearAllMocks());

  it('shows hard budget, request health and prompt/model audit fields', async () => {
    mocks.apiFetch.mockResolvedValue(usage('api-assisted'));
    renderUsage();

    expect(await screen.findByText(/режим\s+API-assisted/i)).toBeInTheDocument();
    expect(screen.getAllByText('5')).not.toHaveLength(0);
    expect(screen.getByText('cache hits')).toBeInTheDocument();
    expect(screen.getByText('attempt-evaluator-v1@1')).toBeInTheDocument();
    expect(screen.getByText('fake / fake-deterministic-v1')).toBeInTheDocument();
    expect(screen.getByText('Проверка попыток').parentElement).toHaveTextContent('Включено');
    expect(screen.getByText('Проверка content pack').parentElement).toHaveTextContent('Выключено');
  });

  it('states that manual mode works without an API key', async () => {
    mocks.apiFetch.mockResolvedValue(usage('manual'));
    renderUsage();

    expect(await screen.findByText('Manual mode активен')).toBeInTheDocument();
    expect(screen.getByText(/API key не требуется/i)).toBeInTheDocument();
    expect(screen.getByText('Проверка попыток').parentElement).toHaveTextContent('Выключено');
  });

  it('keeps the settings surface usable when usage loading fails', async () => {
    mocks.apiFetch.mockRejectedValue(new Error('offline'));
    renderUsage();

    expect(await screen.findByText('Состояние AI usage недоступно')).toBeInTheDocument();
    expect(screen.getByText(/не блокирует manual export\/import/i)).toBeInTheDocument();
  });
});
