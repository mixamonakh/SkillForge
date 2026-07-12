import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorState } from '@/components/data-state';
import {
  ImportExportCenter,
  createExportScope,
} from '@/features/import-export/import-export-center';
import { ApiError } from '@/shared/api/client';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  apiMutation: vi.fn(),
}));

vi.mock('@/shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api/client')>();
  return { ...actual, apiFetch: mocks.apiFetch, apiMutation: mocks.apiMutation };
});

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('mode=import'),
}));

function renderCenter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ImportExportCenter />
    </QueryClientProvider>,
  );
}

describe('import/export hardening UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.apiFetch.mockResolvedValue([]);
    mocks.apiMutation.mockImplementation((path: string) => {
      if (path === '/api/v1/imports/validate') {
        return Promise.resolve({
          importId: '00000000-0000-4000-8000-000000000010',
          schemaVersion: '1.0',
          sourceBundleId: '00000000-0000-4000-8000-000000000020',
          warnings: [],
        });
      }
      if (path.endsWith('/preview')) {
        return Promise.resolve({
          importId: '00000000-0000-4000-8000-000000000010',
          sourceBundleId: '00000000-0000-4000-8000-000000000020',
          matchedAttempts: 1,
          unknownAttempts: [],
          unknownTopics: [],
          warnings: ['Reliability ограничена до 0.65.'],
          evaluationsToCreate: 1,
          projectedTopics: [],
          recommendations: [
            {
              topicKey: 'js.runtime.event-loop',
              priority: 5,
              reason: 'Нужна короткая практика event loop.',
            },
          ],
        });
      }
      return Promise.reject(new Error(`Unexpected mutation: ${path}`));
    });
  });

  it('renders preview warnings and advisory recommendations before apply', async () => {
    renderCenter();

    fireEvent.change(screen.getByLabelText('Strict skillforge-analysis-v1'), {
      target: { value: '{"contract":"skillforge-analysis-v1"}' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Проверить схему' }));
    await screen.findByText('Schema 1.0 валидна');
    fireEvent.click(screen.getByRole('button', { name: 'Рассчитать preview' }));

    expect(await screen.findByText('Reliability ограничена до 0.65.')).toBeVisible();
    expect(screen.getByText('Нужна короткая практика event loop.')).toBeVisible();
    expect(screen.getByText('Приоритет 5/5')).toBeVisible();
    expect(screen.getByText('Изменений TopicState для применения нет.')).toBeVisible();
  });

  it('shows schema issue paths but never dumps unrelated server data', () => {
    const error = new ApiError(400, {
      error: {
        code: 'IMPORT_SCHEMA_INVALID',
        message: 'Analysis JSON не соответствует schema',
        requestId: 'req_validation',
        details: {
          issues: [
            {
              path: ['attemptEvaluations', 0, 'overallScore'],
              message: 'Expected number',
            },
          ],
          server: { answerText: 'private answer body' },
        },
      },
    });

    render(<ErrorState error={error} />);
    fireEvent.click(screen.getByText('Детали ошибки'));

    expect(screen.getByText('attemptEvaluations.0.overallScore: Expected number')).toBeVisible();
    expect(screen.getByText('requestId: req_validation')).toBeVisible();
    expect(screen.queryByText('private answer body')).not.toBeInTheDocument();
  });

  it('builds exact scope shapes without ambiguous id/topic fields', () => {
    expect(createExportScope('topic', ' js.modules ', '', '')).toEqual({
      topicKey: 'js.modules',
    });
    expect(
      createExportScope('assessment-run', '00000000-0000-4000-8000-000000000030', '', ''),
    ).toEqual({ id: '00000000-0000-4000-8000-000000000030' });
    expect(createExportScope('pending-review', 'ignored', '', '')).toEqual({});

    expect(mocks.apiFetch).not.toHaveBeenCalledWith('/api/v1/unknown');
  });
});
