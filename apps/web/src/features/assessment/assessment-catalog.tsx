'use client';

import { EmptyState, PageHeader, PrimaryButton, SectionCard } from '@skillforge/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock3, Layers3, Play } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { ErrorState, LoadingState } from '@/components/data-state';
import { apiFetch, apiMutation } from '@/shared/api/client';
import type {
  AssessmentCatalogItem,
  AssessmentRun,
  PrebaselineNextResponse,
} from '@/shared/api/types';

export function AssessmentCatalog() {
  const router = useRouter();
  const query = useQuery({
    queryKey: ['assessments'],
    queryFn: () => apiFetch<AssessmentCatalogItem[]>('/api/v1/assessments'),
  });
  const startMutation = useMutation({
    mutationFn: async (assessment: AssessmentCatalogItem) => {
      if (assessment.flow === 'ADAPTIVE_PREBASELINE') {
        const started = await apiMutation<PrebaselineNextResponse>(
          '/api/v1/assessments/prebaseline/start',
          'POST',
        );
        return started.runId;
      }
      if (assessment.activeRun) {
        if (assessment.activeRun.status === 'PAUSED') {
          await apiMutation<AssessmentRun>(
            `/api/v1/assessment-runs/${assessment.activeRun.id}/resume`,
            'POST',
          );
        }
        return assessment.activeRun.id;
      }
      if (assessment.latestCompletedRun) return assessment.latestCompletedRun.id;
      const created = await apiMutation<AssessmentRun>(
        `/api/v1/assessments/${assessment.key}/runs`,
        'POST',
      );
      await apiMutation<AssessmentRun>(`/api/v1/assessment-runs/${created.id}/start`, 'POST');
      return created.id;
    },
    onSuccess: (runId) => router.push(`/assessment/${runId}`),
  });

  return (
    <div className="sf-stack">
      <PageHeader
        eyebrow="Baseline"
        title="Диагностика"
        description="Она разделяет то, что узнаётся визуально, и то, что получается объяснить или написать без подсказки."
      />
      {query.isLoading ? <LoadingState /> : null}
      {query.error ? <ErrorState error={query.error} retry={() => void query.refetch()} /> : null}
      {startMutation.error ? <ErrorState error={startMutation.error} /> : null}
      {query.data?.length === 0 ? (
        <EmptyState
          title="Диагностика не импортирована"
          description="Проверь content pack и выполни content:import."
        />
      ) : null}
      {query.data?.map((assessment) => (
        <SectionCard key={`${assessment.key}:${assessment.version}`} className="sf-assessment-card">
          <div className="sf-card-title-row">
            <div>
              <p className="sf-eyebrow">
                {assessment.flow === 'ADAPTIVE_PREBASELINE'
                  ? 'Быстрая калибровка'
                  : 'Рабочая диагностика'}
              </p>
              <h2>{assessment.title}</h2>
            </div>
            {assessment.reviewState === 'NEEDS_HUMAN_REVIEW' ? (
              <span className="sf-pill">Draft · нужен human review</span>
            ) : assessment.activeRun ? (
              <span className="sf-pill">{assessment.activeRun.answered} ответов сохранено</span>
            ) : assessment.latestCompletedRun ? (
              <span className="sf-pill">Завершено прохождений: {assessment.completedRuns}</span>
            ) : null}
          </div>
          <p className="sf-muted">{assessment.description}</p>
          <div className="sf-assessment-facts">
            <span>
              <Layers3 aria-hidden="true" size={17} /> {assessment.totalItems} заданий ·{' '}
              {assessment.totalBlocks} блока
            </span>
            <span>
              <Clock3 aria-hidden="true" size={17} /> около {assessment.estimatedMin} минут
            </span>
            <span>
              <CheckCircle2 aria-hidden="true" size={17} /> {assessment.taskKinds.length} типов
              заданий
            </span>
          </div>
          <div className="sf-callout">
            {assessment.reviewState === 'NEEDS_HUMAN_REVIEW'
              ? 'Это локальный pre-release flow. Pack ещё не активирован: нужен human dry run, а свободные ответы останутся в состоянии «ожидают проверки».'
              : 'Код и точные ответы проверяются локально. Свободные объяснения останутся в состоянии «ожидают внешнего анализа» до ручного import.'}
          </div>
          <PrimaryButton
            busy={startMutation.isPending}
            onClick={() => startMutation.mutate(assessment)}
          >
            <Play aria-hidden="true" size={16} />
            {assessment.activeRun
              ? 'Продолжить'
              : assessment.latestCompletedRun && assessment.flow !== 'ADAPTIVE_PREBASELINE'
                ? 'Посмотреть результат'
                : assessment.flow === 'ADAPTIVE_PREBASELINE' && assessment.completedRuns > 0
                  ? 'Начать новую калибровку'
                  : 'Начать'}
          </PrimaryButton>
        </SectionCard>
      ))}
      <SectionCard>
        <h2>Будущие диагностики</h2>
        <p className="sf-muted">
          TypeScript, React, алгоритмы и инфраструктура появятся отдельными versioned content packs.
          В MVP они не имитируются отключёнными кнопками.
        </p>
      </SectionCard>
    </div>
  );
}
