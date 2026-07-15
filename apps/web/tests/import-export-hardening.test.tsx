import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorState } from '@/components/data-state';
import {
  ImportExportCenter,
  createExportScope,
  exportSelectionFromSearchParams,
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
  afterEach(cleanup);

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
          evidenceToCreate: 0,
          suppressedEvaluationEffects: [],
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

  it('shows the explicit pre-baseline audit-only suppression before apply', async () => {
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
          warnings: [],
          evaluationsToCreate: 1,
          evidenceToCreate: 0,
          suppressedEvaluationEffects: [
            {
              attemptId: '00000000-0000-4000-8000-000000000030',
              reason: 'PREBASELINE_ROUTING_ONLY',
              evaluationAction: 'CREATE_AUDIT_RECORD',
              evidenceAction: 'SUPPRESSED',
              topicStateAction: 'NO_MUTATION',
              masteryAction: 'NO_MUTATION',
              requestedEvidenceItems: 1,
            },
          ],
          projectedTopics: [],
          recommendations: [],
        });
      }
      return Promise.reject(new Error(`Unexpected mutation: ${path}`));
    });
    renderCenter();

    fireEvent.change(screen.getByLabelText('Strict skillforge-analysis-v1'), {
      target: { value: '{"contract":"skillforge-analysis-v1"}' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Проверить схему' }));
    await screen.findByText('Schema 1.0 валидна');
    fireEvent.click(screen.getByRole('button', { name: 'Рассчитать preview' }));

    expect(await screen.findByText('Pre-baseline: mutation подавлена')).toBeVisible();
    expect(screen.getByText('SUPPRESSED')).toBeVisible();
    expect(screen.getByText('NO_MUTATION')).toBeVisible();
    expect(screen.getByText(/evidence: 0/i)).toBeVisible();
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

  it('preserves an exact learning-session scope from a manual fallback URL', () => {
    const selection = exportSelectionFromSearchParams(
      new URLSearchParams('mode=export&sessionId=00000000-0000-4000-8000-000000000040'),
    );

    expect(selection).toEqual({
      bundleType: 'session',
      scopeId: '00000000-0000-4000-8000-000000000040',
    });
    expect(createExportScope(selection.bundleType, selection.scopeId, '', '')).toEqual({
      id: '00000000-0000-4000-8000-000000000040',
    });
  });
});
