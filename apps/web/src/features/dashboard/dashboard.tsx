'use client';

import {
  EmptyState,
  InsufficientData,
  MetricCard,
  PageHeader,
  ResumeBanner,
  SectionCard,
  StatusBadge,
} from '@skillforge/ui';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Download } from 'lucide-react';
import Link from 'next/link';
import { ErrorState, LoadingState } from '@/components/data-state';
import { apiFetch } from '@/shared/api/client';
import type { DashboardData } from '@/shared/api/types';

function EmptyDashboard() {
  return (
    <div className="sf-stack">
      <EmptyState
        title="SkillForge готов к калибровке"
        description="Сначала приложение проверит, что ты действительно можешь объяснить и написать руками. До этого мы не будем придумывать проценты."
        action={
          <>
            <Link className="sf-button sf-button--primary" href="/assessment">
              Начать короткую калибровку
            </Link>
            <Link className="sf-button sf-button--secondary" href="/roadmap">
              Посмотреть Roadmap
            </Link>
            <Link className="sf-button sf-button--ghost" href="/import-export?mode=import">
              Импортировать прошлый анализ
            </Link>
          </>
        }
      />
      <SectionCard>
        <div className="sf-card-title-row">
          <h2>Как это работает</h2>
        </div>
        <ol className="sf-grid sf-grid--4 sf-process-list">
          <li>
            <strong>01</strong>
            <span>Ответить без подсказки</span>
          </li>
          <li>
            <strong>02</strong>
            <span>Проверить код локально</span>
          </li>
          <li>
            <strong>03</strong>
            <span>Экспортировать объяснения</span>
          </li>
          <li>
            <strong>04</strong>
            <span>Получить карту evidence</span>
          </li>
        </ol>
      </SectionCard>
    </div>
  );
}

export function Dashboard() {
  const query = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => apiFetch<DashboardData>('/api/v1/metrics/dashboard'),
  });

  if (query.isLoading) return <LoadingState count={4} />;
  if (query.error) return <ErrorState error={query.error} retry={() => void query.refetch()} />;

  const dashboard = query.data;
  if (!dashboard || (!dashboard.calibrated && !dashboard.activeAssessment)) {
    return <EmptyDashboard />;
  }

  return (
    <div className="sf-stack">
      <PageHeader
        eyebrow="Текущий фокус"
        title="Следующий полезный шаг"
        description="Одна рекомендация, рассчитанная из evidence, prerequisite и состояния повторения."
        actions={
          <Link className="sf-button sf-button--secondary" href="/import-export?mode=export">
            <Download aria-hidden="true" size={16} /> Экспорт
          </Link>
        }
      />
      {dashboard.resume ? (
        <ResumeBanner
          topic={dashboard.resume.topic}
          step={dashboard.resume.step}
          action={
            <Link
              className="sf-button sf-button--primary"
              href={`/sessions?return=${dashboard.resume.sessionId}`}
            >
              Восстановить контекст
            </Link>
          }
        />
      ) : null}
      {!dashboard.resume && dashboard.recommendation ? (
        <SectionCard className="sf-focus-card">
          <p className="sf-eyebrow">Что сделать сейчас</p>
          <h2>{dashboard.recommendation.title}</h2>
          <p className="sf-muted">{dashboard.recommendation.reason}</p>
          <Link className="sf-button sf-button--primary" href={dashboard.recommendation.href}>
            {dashboard.recommendation.action} <ArrowRight aria-hidden="true" size={16} />
          </Link>
        </SectionCard>
      ) : !dashboard.resume ? (
        <InsufficientData>
          Заверши текущий блок диагностики, чтобы получить рекомендацию.
        </InsufficientData>
      ) : null}
      <div className="sf-grid sf-grid--3">
        <MetricCard
          label="Карта откалибрована"
          value={`${dashboard.coverage.assessed} из ${dashboard.coverage.total}`}
          note={dashboard.dataSufficiency.reason}
        />
        <MetricCard
          label="Готово к повторению"
          value={String(dashboard.dueReviews.length)}
          note="Статус темы не понижается"
        />
        <MetricCard
          label="Внешний анализ"
          value={dashboard.lastImport ? 'Применён' : '—'}
          note={dashboard.lastImport?.summary ?? 'Импортов ещё нет'}
        />
      </div>
      <div className="sf-grid sf-grid--3">
        <SectionCard>
          <div className="sf-card-title-row">
            <h2>Приоритетный пробел</h2>
          </div>
          {dashboard.priorityTopic ? (
            <div className="sf-stack sf-stack--compact">
              <StatusBadge status={dashboard.priorityTopic.status} />
              <h3>{dashboard.priorityTopic.title}</h3>
              <Link className="sf-link" href={`/topics/${dashboard.priorityTopic.key}`}>
                Открыть тему →
              </Link>
            </div>
          ) : (
            <InsufficientData />
          )}
        </SectionCard>
        <SectionCard>
          <div className="sf-card-title-row">
            <h2>Готово к повторению</h2>
          </div>
          {dashboard.dueReviews.length > 0 ? (
            <ul className="sf-list">
              {dashboard.dueReviews.slice(0, 3).map((topic) => (
                <li className="sf-list-row" key={topic.key}>
                  <span>
                    <StatusBadge status={topic.status} /> {topic.title}
                  </span>
                  <Link className="sf-link" href={`/sessions?topic=${topic.key}`}>
                    Повторить →
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sf-muted">Пока нет тем с наступившей датой review.</p>
          )}
        </SectionCard>
        <SectionCard>
          <div className="sf-card-title-row">
            <h2>Последняя сессия</h2>
          </div>
          {dashboard.lastSession ? (
            <>
              <h3>{dashboard.lastSession.title}</h3>
              <p className="sf-muted">
                {dashboard.lastSession.lastStepLabel ?? 'Сессия сохранена'}
              </p>
              <Link className="sf-link" href={`/sessions/${dashboard.lastSession.id}`}>
                Посмотреть →
              </Link>
            </>
          ) : (
            <p className="sf-muted">Учебных сессий ещё нет.</p>
          )}
        </SectionCard>
      </div>
      <Link href="/sessions" className="sf-button sf-button--secondary sf-new-session">
        Новая сессия
      </Link>
    </div>
  );
}
