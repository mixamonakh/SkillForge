import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionCenter } from '@/features/sessions/session-center';

const RETURN_FROM_SESSION_ID = 'b6a95d8b-2a95-43f9-8427-5e5d41c42fc8';
const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn<(path: string) => Promise<unknown>>(),
  apiMutation: vi.fn<(path: string, method: string, body?: unknown) => Promise<unknown>>(),
  push: vi.fn<(path: string) => void>(),
  search: 'return=b6a95d8b-2a95-43f9-8427-5e5d41c42fc8',
  profileSettings: {
    defaultLoadMode: 'NORMAL' as 'MINIMAL' | 'NORMAL' | 'DEEP' | 'RETURN',
    codeLanguage: 'javascript' as 'javascript' | 'typescript',
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

vi.mock('@/shared/api/client', () => ({
  apiFetch: mocks.apiFetch,
  apiMutation: mocks.apiMutation,
}));

describe('SessionCenter return flow', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.search = `return=${RETURN_FROM_SESSION_ID}`;
    mocks.profileSettings.defaultLoadMode = 'NORMAL';
    mocks.profileSettings.codeLanguage = 'javascript';
    mocks.apiFetch.mockImplementation(async (path) => {
      if (path === '/api/v1/profile') return { settings: { ...mocks.profileSettings } };
      if (path === '/api/v1/topics' || path === '/api/v1/sessions') return [];
      if (path === '/api/v1/sessions/recommendation') {
        return {
          topic: { key: 'js.global-recommendation', title: 'Глобальная рекомендация' },
          mode: 'TRAINING',
          loadMode: 'NORMAL',
          reason: 'global',
        };
      }
      return null;
    });
    mocks.apiMutation.mockImplementation(async (path, _method, body) => {
      if (path === '/api/v1/sessions/plan') return body;
      if (path === '/api/v1/sessions') return { id: 'new-return-session' };
      return {};
    });
  });

  it('submits an empty topic list for API source-context resolution', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <SessionCenter />
      </QueryClientProvider>,
    );

    expect(
      screen.getByText('Контекст и темы будут восстановлены из выбранной сохранённой сессии.'),
    ).toBeInTheDocument();
    const start = screen.getByRole('button', { name: /Собрать и начать сессию/u });
    await waitFor(() => expect(start).toBeEnabled());
    fireEvent.click(start);

    await waitFor(() => expect(mocks.apiMutation).toHaveBeenCalled());
    expect(mocks.apiMutation.mock.calls[0]).toEqual([
      '/api/v1/sessions/plan',
      'POST',
      {
        mode: 'RETURN',
        loadMode: 'RETURN',
        topicKeys: [],
        documentationAllowed: true,
        codeLanguage: 'javascript',
        returnFromSessionId: RETURN_FROM_SESSION_ID,
      },
    ]);
    expect(mocks.apiFetch).not.toHaveBeenCalledWith('/api/v1/sessions/recommendation');
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/sessions/new-return-session'));
  });

  it('initializes load and code language controls from persisted profile settings', async () => {
    mocks.search = '';
    mocks.profileSettings.defaultLoadMode = 'DEEP';
    mocks.profileSettings.codeLanguage = 'typescript';
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <SessionCenter />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Глубокий/u })).toHaveAttribute(
        'data-selected',
        'true',
      ),
    );
    expect(screen.getByLabelText('Язык кода')).toHaveValue('typescript');
  });

  it('renders the legacy recommendation response without requiring v2 fields', async () => {
    mocks.search = '';
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <SessionCenter />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Глобальная рекомендация')).toBeInTheDocument();
    expect(screen.getByText('global')).toBeInTheDocument();
    expect(screen.queryByText('Цель сессии:')).not.toBeInTheDocument();
  });

  it('shows one v2 route and applies its phase, load and versioned sequence to the plan', async () => {
    mocks.search = '';
    mocks.apiFetch.mockImplementation(async (path) => {
      if (path === '/api/v1/profile') return { settings: { ...mocks.profileSettings } };
      if (path === '/api/v1/topics' || path === '/api/v1/sessions') return [];
      if (path === '/api/v1/sessions/recommendation') {
        return {
          algorithmVersion: 'recommendation-v2.0',
          topic: { key: 'js.references', title: 'Ссылки и объекты' },
          topicKey: 'js.references',
          title: 'Ссылки и объекты: trace',
          mode: 'REVIEW',
          loadMode: 'MINIMAL',
          reason: 'Нужно закрепить чтение кода без подсказки.',
          capabilityGap: 'TRACE',
          learningPhase: 'CONSOLIDATION',
          recommendedFamilyKey: 'js.references.trace',
          sequenceKey: 'js.references.consolidation-v1',
          estimatedMinutes: 20,
          evidenceNeeded: ['Два независимых trace signal'],
          completionTarget: 'Один успешный ответ без подсказки.',
          scoreBreakdown: {
            gapSeverity: 40,
            missingFamily: 20,
            prerequisiteUnlock: 0,
            targetRelevance: 8,
            reviewDue: 5,
            diversity: 4,
            redundancyPenalty: 0,
            overloadPenalty: 0,
            recentExposurePenalty: 0,
          },
        };
      }
      return null;
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <SessionCenter />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Ссылки и объекты: trace')).toBeInTheDocument();
    expect(screen.getByText('Закрепление')).toBeInTheDocument();
    expect(screen.getByText('Gap: Чтение хода выполнения')).toBeInTheDocument();
    expect(screen.getByText('≈ 20 мин')).toBeInTheDocument();
    expect(screen.getByText(/Один успешный ответ без подсказки/u)).toBeInTheDocument();
    expect(screen.getByText(/Два независимых trace signal/u)).toBeInTheDocument();
    expect(screen.getAllByText('Рекомендация')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Выбрать' }));
    expect(screen.getByRole('button', { name: /Review/u })).toHaveAttribute(
      'data-selected',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: /Собрать и начать сессию/u }));

    await waitFor(() => expect(mocks.apiMutation).toHaveBeenCalled());
    expect(mocks.apiMutation.mock.calls[0]).toEqual([
      '/api/v1/sessions/plan',
      'POST',
      {
        mode: 'REVIEW',
        loadMode: 'MINIMAL',
        topicKeys: ['js.references'],
        documentationAllowed: true,
        codeLanguage: 'javascript',
        learningPhase: 'CONSOLIDATION',
        sequenceKey: 'js.references.consolidation-v1',
      },
    ]);
  });
});
