import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TopicDetail } from '@/features/topics/topic-detail';

const topicResponse = {
  key: 'js.runtime.event-loop',
  title: 'Event loop',
  shortDescription: 'Очереди выполнения',
  trackKey: 'javascript-core',
  trackTitle: 'JavaScript Core',
  status: 'UNSTABLE',
  masteryEstimate: 64,
  masteryConfidence: 52,
  evidenceCount: 3,
  needsReview: false,
  nextReviewAt: null,
  targetRelevance: 5,
  prerequisites: [],
  whyImportant: 'Помогает понимать асинхронность.',
  atWork: 'Диагностика порядка выполнения.',
  atInterview: 'Объяснение microtask и task.',
  explanation: {
    algorithmVersion: 'mastery-v1.0',
    summary: 'Результат пока нестабилен.',
    factors: {
      totalReliableWeight: 2.1,
      independentDays: 1,
      taskKindCount: 2,
      evidenceKindCount: 2,
      hasDelayedEvidence: false,
      hasNoHelpSuccess: true,
      hasTransferEvidence: false,
      recentFailureCount: 1,
    },
    statusGates: [{ code: 'delayed-evidence', met: false, actual: false, required: true }],
  },
  misconceptions: [
    {
      key: 'microtask-order',
      title: 'Путает очередность microtask',
      count: 2,
      remediation: 'Сравнить Promise callback и setTimeout на коротком примере.',
    },
  ],
  evidenceByKind: { PREDICT_OUTPUT: 2, EXPLANATION: 1 },
  lastEvidenceAt: '2026-07-11T07:00:00.000Z',
  content: [],
  tasks: [],
  evidence: [],
};

function notTestedCapability(family: string) {
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

const capabilityResponse = {
  topicKey: 'js.runtime.event-loop',
  algorithmVersion: 'capability-profile-v1.0',
  capabilities: {
    TERM: notTestedCapability('TERM'),
    MECHANISM: notTestedCapability('MECHANISM'),
    TRACE: notTestedCapability('TRACE'),
    DEBUG: notTestedCapability('DEBUG'),
    CODE_PRODUCTION: notTestedCapability('CODE_PRODUCTION'),
    TRANSFER: notTestedCapability('TRANSFER'),
    CALIBRATION: notTestedCapability('CALIBRATION'),
  },
};

const apiFetch = vi.hoisted(() => vi.fn());

vi.mock('@/shared/api/client', () => ({ apiFetch }));

function renderTopic() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TopicDetail topicKey="js.runtime.event-loop" />
    </QueryClientProvider>,
  );
}

describe('TopicDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetch.mockImplementation((path: string) =>
      Promise.resolve(path.endsWith('/capability-profile') ? capabilityResponse : topicResponse),
    );
  });

  it('renders real misconceptions and explainable mastery gates', async () => {
    renderTopic();

    expect(await screen.findByText('Результат пока нестабилен.')).toBeInTheDocument();
    expect(screen.getByText('PREDICT_OUTPUT')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Компоненты навыка' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Ошибки' }));
    expect(screen.getByText('Путает очередность microtask')).toBeInTheDocument();
    expect(screen.getByText(/Сравнить Promise callback/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Критерии mastery' }));
    expect(screen.getByText('Есть отложенная проверка')).toBeInTheDocument();
    expect(screen.getByText(/Не выполнено/)).toBeInTheDocument();
  });

  it('supports arrow-key tab navigation', async () => {
    renderTopic();
    const overview = await screen.findByRole('tab', { name: 'Обзор' });
    overview.focus();
    fireEvent.keyDown(overview, { key: 'ArrowRight' });

    expect(screen.getByRole('tab', { name: 'Теория' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Теория' })).toHaveFocus();
  });

  it('does not show mastery confidence as a calibrated percentage before an estimate exists', async () => {
    apiFetch.mockImplementation((path: string) =>
      Promise.resolve(
        path.endsWith('/capability-profile')
          ? capabilityResponse
          : {
              ...topicResponse,
              status: 'UNKNOWN',
              masteryEstimate: null,
              masteryConfidence: 21,
              evidenceCount: 1,
            },
      ),
    );

    renderTopic();

    expect(await screen.findByText('Не откалибровано')).toBeInTheDocument();
    expect(screen.queryByText('21%')).not.toBeInTheDocument();
  });
});
