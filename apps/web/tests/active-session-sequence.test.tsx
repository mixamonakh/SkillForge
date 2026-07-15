import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActiveSession } from '@/features/sessions/active-session';
import type { LearningSession, TaskItem } from '@/shared/api/types';

const SESSION_ID = 'b6a95d8b-2a95-43f9-8427-5e5d41c42fc8';
const CONTENT_STEP_ID = 'ec2f6a19-d07a-43b1-b0c6-ef9d554143cc';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn<(path: string) => Promise<unknown>>(),
  apiMutation: vi.fn<(path: string, method: string, body?: unknown) => Promise<unknown>>(),
}));

vi.mock('@/shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api/client')>();
  return { ...actual, apiFetch: mocks.apiFetch, apiMutation: mocks.apiMutation };
});

function taskItem(): TaskItem {
  return {
    id: '5c242fd6-f93c-479e-903a-b376bafd75da',
    position: 1,
    blockIndex: 0,
    purpose: 'PREDICT',
    task: {
      stableKey: 'js.references.predict-basic-001',
      version: 1,
      topicKey: 'js.references',
      topicTitle: 'Ссылки и объекты',
      kind: 'EXPLAIN',
      promptMarkdown: 'Объясни результат присваивания ссылки.',
      starterCode: null,
      language: null,
      options: [],
      hints: [],
      visibleTests: [],
      runnerHarness: null,
    },
    attempt: {
      id: '6862fe60-a3b1-44cc-84f3-f4cfd188479d',
      revision: 0,
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

function sequenceSession(status: LearningSession['status'] = 'ACTIVE'): LearningSession {
  const item = taskItem();
  return {
    id: SESSION_ID,
    title: 'Ссылки и объекты',
    mode: 'TRAINING',
    loadMode: 'NORMAL',
    status,
    lastStepLabel: null,
    startedAt: '2026-07-15T10:00:00.000Z',
    completedAt: null,
    itemCount: 1,
    stepCount: 2,
    learningPhase: 'ACQUISITION',
    sequence: { key: 'js.references.acquisition-v1', version: 1 },
    goal: 'Понять модель ссылок',
    documentationAllowed: true,
    loadFeedback: null,
    summary: null,
    items: [item],
    steps: [
      {
        kind: 'CONTENT',
        id: CONTENT_STEP_ID,
        position: 0,
        required: true,
        completedAt: null,
        content: {
          schemaVersion: '1.0',
          stableKey: 'js.references.canonical-model',
          version: 1,
          checksum: 'content-checksum',
          kind: 'CONCEPT_NOTE',
          title: 'Каноническая модель ссылок',
          bodyMarkdown: '# Ссылка\n<script>alert("unsafe")</script>',
          payload: { source: 'mdn' },
        },
      },
      {
        kind: 'TASK',
        id: item.id,
        position: 1,
        required: true,
        taskItem: item,
      },
    ],
  };
}

function renderSession() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ActiveSession sessionId={SESSION_ID} />
    </QueryClientProvider>,
  );
}

describe('ActiveSession interleaved sequence', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows escaped immutable CONTENT first and advances through its real completion endpoint', async () => {
    const current = sequenceSession();
    mocks.apiFetch.mockImplementation(async () => structuredClone(current));
    mocks.apiMutation.mockImplementation(async (path) => {
      if (path.includes('/content-steps/')) {
        const step = current.steps?.[0];
        if (step?.kind !== 'CONTENT') throw new Error('Missing content step fixture');
        step.completedAt = '2026-07-15T10:02:00.000Z';
        return structuredClone(step);
      }
      return {};
    });

    const rendered = renderSession();

    expect(await screen.findByText('Каноническая модель ссылок')).toBeInTheDocument();
    expect(screen.getByText(/<script>alert\("unsafe"\)<\/script>/u)).toBeInTheDocument();
    expect(rendered.container.querySelector('script')).toBeNull();
    expect(screen.getByText(/"source": "mdn"/u)).toBeInTheDocument();
    expect(screen.queryByText('Объясни результат присваивания ссылки.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Изучено, дальше/u }));

    await waitFor(() =>
      expect(mocks.apiMutation).toHaveBeenCalledWith(
        `/api/v1/sessions/${SESSION_ID}/content-steps/${CONTENT_STEP_ID}/complete`,
        'POST',
      ),
    );
    expect(await screen.findByText('Объясни результат присваивания ссылки.')).toBeInTheDocument();
    expect(screen.getByText(/шаг 2 из 2/u)).toBeInTheDocument();
  });

  it('resumes at the first unfinished TASK when CONTENT was completed before the pause', async () => {
    const current = sequenceSession('PAUSED');
    const contentStep = current.steps?.[0];
    if (contentStep?.kind === 'CONTENT') {
      contentStep.completedAt = '2026-07-15T10:02:00.000Z';
    }
    mocks.apiFetch.mockImplementation(async () => structuredClone(current));
    mocks.apiMutation.mockImplementation(async (path) => {
      if (path.endsWith('/start')) current.status = 'ACTIVE';
      return structuredClone(current);
    });

    renderSession();

    expect(await screen.findByRole('button', { name: /Продолжить сессию/u })).toBeInTheDocument();
    expect(screen.queryByText('Каноническая модель ссылок')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Продолжить сессию/u }));

    expect(await screen.findByText('Объясни результат присваивания ссылки.')).toBeInTheDocument();
    expect(screen.queryByText('Каноническая модель ссылок')).not.toBeInTheDocument();
  });

  it('keeps legacy task-only sessions usable when the steps field is absent', async () => {
    const current = sequenceSession();
    delete current.steps;
    delete current.stepCount;
    mocks.apiFetch.mockResolvedValue(current);
    mocks.apiMutation.mockResolvedValue({});

    renderSession();

    expect(await screen.findByText('Объясни результат присваивания ссылки.')).toBeInTheDocument();
    expect(screen.getByText(/шаг 1 из 1/u)).toBeInTheDocument();
  });

  it('persists exactly one AI nudge without blocking normal session actions', async () => {
    const current = sequenceSession();
    const contentStep = current.steps?.[0];
    if (contentStep?.kind === 'CONTENT') contentStep.completedAt = '2026-07-15T10:02:00.000Z';
    const usage = {
      period: '2026-07',
      mode: 'api-assisted',
      features: { attemptEvaluation: true, contentReview: false, nudge: true },
      limitUsd: 10,
      spentUsd: 0,
      reservedUsd: 0,
      remainingUsd: 10,
      requestCount: 0,
      cacheHits: 0,
      failures: 0,
      averageCostUsd: 0,
      appliedDrafts: 0,
      rejectedDrafts: 0,
      models: [],
    };
    mocks.apiFetch.mockImplementation(async (path) =>
      path === '/api/v1/ai/usage/current' ? usage : structuredClone(current),
    );
    mocks.apiMutation.mockImplementation(async (path, _method, body) => {
      const attempt = current.items[0]?.attempt;
      if (path.includes('/items/') && attempt) {
        Object.assign(attempt, body, { revision: attempt.revision + 1 });
        return structuredClone(attempt);
      }
      if (path.endsWith('/nudge') && attempt) {
        attempt.helpLevel = 'NUDGE';
        attempt.hintsUsed = ['Проверь, какое значение разделяют обе переменные.'];
        return {
          attemptId: attempt.id,
          hintType: 'NUDGE',
          hint: attempt.hintsUsed[0],
          warnings: ['FAKE_PROVIDER_RESULT'],
          helpLevel: 'NUDGE',
          cacheHit: false,
          invocationId: '8bf178ac-4e51-45de-a012-e72a22837c20',
        };
      }
      return {};
    });

    renderSession();
    const nudgeButton = await screen.findByRole('button', { name: /Один AI-намёк/u });
    await waitFor(() => expect(nudgeButton).toBeEnabled());
    fireEvent.click(nudgeButton);

    expect(await screen.findByTestId('ai-nudge')).toHaveTextContent(
      'Проверь, какое значение разделяют обе переменные.',
    );
    expect(mocks.apiMutation).toHaveBeenCalledWith(
      `/api/v1/ai/attempts/${current.items[0]?.attempt?.id}/nudge`,
      'POST',
    );
    expect(screen.queryByRole('button', { name: /Один AI-намёк/u })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Сохранить и далее/u })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Пауза/u })).toBeEnabled();
  });

  it('isolates an AI nudge error from autosave, submit and pause controls', async () => {
    const current = sequenceSession();
    const contentStep = current.steps?.[0];
    if (contentStep?.kind === 'CONTENT') contentStep.completedAt = '2026-07-15T10:02:00.000Z';
    mocks.apiFetch.mockImplementation(async (path) =>
      path === '/api/v1/ai/usage/current'
        ? {
            period: '2026-07',
            mode: 'api-assisted',
            features: { attemptEvaluation: true, contentReview: false, nudge: true },
            limitUsd: 10,
            spentUsd: 10,
            reservedUsd: 0,
            remainingUsd: 0,
            requestCount: 1,
            cacheHits: 0,
            failures: 1,
            averageCostUsd: 0,
            appliedDrafts: 0,
            rejectedDrafts: 0,
            models: [],
          }
        : structuredClone(current),
    );
    mocks.apiMutation.mockImplementation(async (path) => {
      if (path.includes('/items/')) return structuredClone(current.items[0]?.attempt);
      if (path.endsWith('/nudge')) throw new Error('budget unavailable');
      return {};
    });

    renderSession();
    const nudgeButton = await screen.findByRole('button', { name: /Один AI-намёк/u });
    await waitFor(() => expect(nudgeButton).toBeEnabled());
    fireEvent.click(nudgeButton);

    expect(await screen.findByRole('alert')).toHaveTextContent(/не получен/i);
    expect(screen.getByRole('button', { name: /Сохранить и далее/u })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Пауза/u })).toBeEnabled();
  });
});
