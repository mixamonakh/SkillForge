import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TopicCapabilityMatrix } from '@/features/topics/topic-capability-matrix';
import type { CapabilityFamily, CapabilityState, TopicCapabilityProfile } from '@/shared/api/types';

const apiFetch = vi.hoisted(() => vi.fn());

vi.mock('@/shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api/client')>();
  return { ...actual, apiFetch };
});

function notTested(family: CapabilityFamily): CapabilityState {
  return {
    family,
    coverage: 'NOT_TESTED',
    estimate: null,
    confidence: 0,
    evidenceCount: 0,
    independentDays: 0,
    noHelpSuccessCount: 0,
    pendingReviewCount: 0,
    lastEvidenceAt: null,
    explanation: [],
  };
}

function emptyProfile(): TopicCapabilityProfile {
  return {
    topicKey: 'js.runtime.event-loop',
    algorithmVersion: 'capability-profile-v1.0',
    capabilities: {
      TERM: notTested('TERM'),
      MECHANISM: notTested('MECHANISM'),
      TRACE: notTested('TRACE'),
      DEBUG: notTested('DEBUG'),
      CODE_PRODUCTION: notTested('CODE_PRODUCTION'),
      TRANSFER: notTested('TRANSFER'),
      CALIBRATION: notTested('CALIBRATION'),
    },
  };
}

function renderMatrix() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TopicCapabilityMatrix topicKey="js.runtime.event-loop" />
    </QueryClientProvider>,
  );
}

describe('TopicCapabilityMatrix', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    apiFetch.mockResolvedValue(emptyProfile());
  });

  it('shows seven explicitly not-tested families without a fabricated zero estimate', async () => {
    renderMatrix();

    expect(await screen.findByText('Профиль пока не откалиброван')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Компоненты навыка' })).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(7);
    expect(screen.getAllByLabelText(/: Не проверено$/)).toHaveLength(7);
    expect(screen.getByRole('article', { name: 'Терминология' })).toBeInTheDocument();
    expect(
      screen.getByRole('article', { name: 'Самостоятельное написание кода' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/0 из 100/)).not.toBeInTheDocument();
  });

  it('keeps an insufficient estimate hidden while showing signal confidence and evidence facts', async () => {
    const profile = emptyProfile();
    profile.capabilities.TRACE = {
      family: 'TRACE',
      coverage: 'INSUFFICIENT',
      estimate: null,
      confidence: 24,
      evidenceCount: 1,
      independentDays: 1,
      noHelpSuccessCount: 0,
      pendingReviewCount: 0,
      lastEvidenceAt: '2026-07-15T09:00:00.000Z',
      explanation: ['Есть только один независимый signal.'],
    };
    apiFetch.mockResolvedValue(profile);

    renderMatrix();
    const article = await screen.findByRole('article', { name: 'Чтение и трассировка' });

    expect(
      within(article).getByLabelText('Чтение и трассировка: Недостаточно данных'),
    ).toBeVisible();
    expect(within(article).getByText('недостаточно данных')).toBeVisible();
    expect(within(article).getByText('24 из 100')).toBeVisible();
    expect(within(article).getByText('Есть только один независимый signal.')).toBeVisible();
  });

  it('shows a numeric estimate only for sufficient coverage', async () => {
    const profile = emptyProfile();
    profile.capabilities.CODE_PRODUCTION = {
      family: 'CODE_PRODUCTION',
      coverage: 'SUFFICIENT',
      estimate: 76,
      confidence: 68,
      evidenceCount: 4,
      independentDays: 3,
      noHelpSuccessCount: 2,
      pendingReviewCount: 0,
      lastEvidenceAt: '2026-07-15T10:15:00.000Z',
      explanation: ['Есть несколько независимых попыток без подсказки.'],
    };
    apiFetch.mockResolvedValue(profile);

    renderMatrix();
    const article = await screen.findByRole('article', {
      name: 'Самостоятельное написание кода',
    });

    expect(
      within(article).getByLabelText('Самостоятельное написание кода: Данных достаточно'),
    ).toBeVisible();
    expect(within(article).getByText('76 из 100')).toBeVisible();
    expect(within(article).getByText('68 из 100')).toBeVisible();
    expect(
      within(article).getByText('Есть несколько независимых попыток без подсказки.'),
    ).toBeVisible();
  });

  it('announces pending review as pending evidence rather than a failure', async () => {
    const profile = emptyProfile();
    profile.capabilities.MECHANISM = {
      family: 'MECHANISM',
      coverage: 'INSUFFICIENT',
      estimate: null,
      confidence: 12,
      evidenceCount: 0,
      independentDays: 0,
      noHelpSuccessCount: 0,
      pendingReviewCount: 2,
      lastEvidenceAt: '2026-07-15T08:00:00.000Z',
      explanation: ['Два объяснения ожидают внешней проверки.'],
    };
    apiFetch.mockResolvedValue(profile);

    renderMatrix();
    const article = await screen.findByRole('article', { name: 'Понимание механизма' });

    expect(within(article).getByText('Два объяснения ожидают внешней проверки.')).toBeVisible();
    expect(within(article).getByText('2')).toBeVisible();
    expect(within(article).queryByText(/провал/i)).not.toBeInTheDocument();
  });

  it('shows a loading state with an accessible name', () => {
    apiFetch.mockReturnValue(new Promise(() => undefined));

    renderMatrix();

    expect(screen.getByLabelText('Загрузка')).toBeInTheDocument();
  });

  it('shows an actionable error state', async () => {
    apiFetch.mockRejectedValue(new Error('Capability endpoint недоступен'));

    renderMatrix();

    expect(await screen.findByRole('alert')).toHaveTextContent('Capability endpoint недоступен');
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
  });

  it('handles an empty capability payload without inventing states', async () => {
    apiFetch.mockResolvedValue({
      topicKey: 'js.runtime.event-loop',
      algorithmVersion: 'capability-profile-v1.0',
      capabilities: undefined,
    } as unknown as TopicCapabilityProfile);

    renderMatrix();

    expect(await screen.findByText('Профиль пока недоступен')).toBeInTheDocument();
    expect(screen.queryByText(/из 100/)).not.toBeInTheDocument();
  });
});
