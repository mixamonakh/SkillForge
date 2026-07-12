import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Dashboard } from '@/features/dashboard/dashboard';

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('@/shared/api/client', () => ({ apiFetch }));

const emptyDashboard = {
  calibrated: false,
  dataSufficiency: { sufficient: false, coverage: 0, reason: 'Оценено 0 из 18 тем' },
  activeAssessment: null,
  recommendation: null,
  coverage: { assessed: 0, total: 18 },
  priorityTopic: null,
  dueReviews: [],
  lastSession: null,
  lastImport: null,
  resume: null,
};

function renderDashboard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Dashboard />
    </QueryClientProvider>,
  );
}

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetch.mockResolvedValue(emptyDashboard);
  });

  it('shows an honest not-calibrated state without a readiness percentage', async () => {
    renderDashboard();

    expect(await screen.findByText('SkillForge готов к калибровке')).toBeInTheDocument();
    expect(screen.queryByText(/readiness/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/streak|серия/i)).not.toBeInTheDocument();
  });

  it('shows exactly one primary recommendation when return context is available', async () => {
    apiFetch.mockResolvedValue({
      ...emptyDashboard,
      calibrated: true,
      dataSufficiency: { sufficient: true, coverage: 0.5, reason: 'Данных достаточно' },
      recommendation: {
        title: 'Практика: другая тема',
        reason: 'Не должна конкурировать с return.',
        href: '/sessions?topic=other',
        action: 'Собрать сессию',
      },
      resume: {
        sessionId: '00000000-0000-4000-8000-000000000010',
        topic: 'Замыкания',
        step: 'Лексическое окружение',
        pausedDays: 8,
      },
    });
    renderDashboard();

    expect(await screen.findByText('С возвращением')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Восстановить контекст' })).toHaveLength(1);
    expect(screen.queryByText('Практика: другая тема')).not.toBeInTheDocument();
  });
});
