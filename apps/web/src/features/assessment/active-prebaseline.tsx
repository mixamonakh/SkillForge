'use client';

import {
  AutosaveIndicator,
  GhostButton,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  SectionCard,
} from '@skillforge/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight, Pause, Play } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ErrorState, LoadingState } from '@/components/data-state';
import { AiReviewList } from '@/features/ai/ai-evaluation-review';
import {
  ensureCurrentCodeResult,
  runAndPersistCurrentCode,
  runnerResultAfterCodeChange,
} from '@/features/runner/code-attempt';
import { runCode } from '@/features/runner/run-code';
import { apiFetch, apiMutation } from '@/shared/api/client';
import type {
  AdaptiveAssessmentRun,
  CapabilityFamily,
  PrebaselineNextResponse,
  RoutingProfile,
  RunnerResult,
  TaskItem,
} from '@/shared/api/types';

import { TaskAnswer } from './task-answer';
import { useAttemptAutosave, type AttemptDraft } from './use-attempt-autosave';

const CAPABILITY_LABELS: Readonly<Record<CapabilityFamily, string>> = {
  TERM: 'Терминология',
  MECHANISM: 'Механизм',
  TRACE: 'Чтение кода',
  DEBUG: 'Отладка',
  CODE_PRODUCTION: 'Код руками',
  TRANSFER: 'Перенос',
  CALIBRATION: 'Калибровка',
};

const PHASE_LABELS = {
  ACQUISITION: 'Коротко разобрать механизм',
  CONSOLIDATION: 'Закрепить самостоятельной практикой',
  TRANSFER: 'Перейти к рабочему применению',
  DEEP_DIAGNOSTIC: 'Уточнить пробел расширенной диагностикой',
} as const;

function isUnknownDraft(draft: AttemptDraft): boolean {
  const answer = draft.answerText
    .trim()
    .toLocaleLowerCase('ru-RU')
    .replace(/[.!?]+$/u, '');
  return answer === 'не знаю' || draft.selectedOptions.includes('unknown');
}

function unknownDraft(item: TaskItem, draft: AttemptDraft): AttemptDraft {
  const unknownOption = item.task.options.find(
    (option) => option.id === 'unknown' || option.label.trim() === 'Не знаю',
  );
  return {
    ...draft,
    answerText: 'Не знаю',
    answerCode: '',
    selectedOptions: unknownOption ? [unknownOption.id] : [],
  };
}

export function ActivePrebaseline({
  run,
  refresh,
}: {
  run: AdaptiveAssessmentRun;
  refresh: () => Promise<void>;
}) {
  const [latest, setLatest] = useState<PrebaselineNextResponse | null>(null);
  const stopped =
    latest?.decision === 'STOP_AND_ROUTE' ||
    latest?.decision === 'ASSESSMENT_COMPLETE' ||
    run.status === 'COMPLETED';
  const needsProfileFetch = stopped && (latest?.routingProfile ?? null) === null;
  const profileQuery = useQuery({
    queryKey: ['prebaseline-routing-profile', run.id],
    queryFn: () => apiFetch<RoutingProfile>(`/api/v1/assessments/${run.id}/routing-profile`),
    enabled: needsProfileFetch,
  });
  const currentItem =
    latest?.item ??
    run.items.find((item) => item.attempt?.submittedAt === null || item.attempt === null) ??
    run.items.at(-1) ??
    null;

  if (run.status === 'PAUSED' && latest === null) {
    return <PausedPrebaseline run={run} refresh={refresh} />;
  }
  if (stopped) {
    if (profileQuery.isLoading && needsProfileFetch) return <LoadingState count={3} />;
    if (profileQuery.error && needsProfileFetch) {
      return <ErrorState error={profileQuery.error} retry={() => void profileQuery.refetch()} />;
    }
    return (
      <PrebaselineStopped
        run={run}
        response={latest}
        profile={latest?.routingProfile ?? profileQuery.data ?? null}
      />
    );
  }
  if (currentItem === null) {
    return <ErrorState error={new Error('Adaptive snapshot не содержит текущий item.')} />;
  }
  return (
    <PrebaselineItem
      key={currentItem.id}
      run={run}
      item={currentItem}
      response={latest}
      onDecision={setLatest}
      refresh={refresh}
    />
  );
}

function PausedPrebaseline({
  run,
  refresh,
}: {
  run: AdaptiveAssessmentRun;
  refresh: () => Promise<void>;
}) {
  const resume = useMutation({
    mutationFn: () => apiMutation(`/api/v1/assessment-runs/${run.id}/resume`, 'POST'),
    onSuccess: refresh,
  });
  return (
    <div className="sf-stack">
      <PageHeader eyebrow="Калибровка на паузе" title={run.title} />
      <SectionCard className="sf-callout">
        <h2>Текущий ответ сохранён</h2>
        <p>Продолжение вернёт к тому же заданию. Время паузы не входит в лимит калибровки.</p>
        {resume.error ? <ErrorState error={resume.error} /> : null}
        <PrimaryButton busy={resume.isPending} onClick={() => resume.mutate()}>
          <Play aria-hidden="true" size={16} /> Продолжить
        </PrimaryButton>
      </SectionCard>
    </div>
  );
}

function PrebaselineItem({
  run,
  item,
  response,
  onDecision,
  refresh,
}: {
  run: AdaptiveAssessmentRun;
  item: TaskItem;
  response: PrebaselineNextResponse | null;
  onDecision: (response: PrebaselineNextResponse) => void;
  refresh: () => Promise<void>;
}) {
  const router = useRouter();
  const { draft, setDraft, state, persist } = useAttemptAutosave(run.sessionId, item);
  const [runnerResult, setRunnerResult] = useState<RunnerResult | null>(
    item.attempt?.runnerOutput ?? null,
  );
  const [runnerError, setRunnerError] = useState<Error | null>(null);
  const progress = response?.progress ?? {
    selected: run.selectedCount,
    answered: run.answeredCount,
    pendingReview: run.pendingReviewCount,
    totalCandidates: run.totalItems,
    elapsedMinutes: 0,
    hardCaps: { items: 18, minutes: 35 },
  };
  const persistRunnerResult = async (
    saved: { id: string; revision: number },
    result: RunnerResult,
  ) => {
    await apiMutation(`/api/v1/attempts/${saved.id}/run-code`, 'POST', {
      revision: saved.revision,
      runnerResult: result,
    });
  };
  const executeCode = async (saved: { id: string; revision: number }) =>
    runAndPersistCurrentCode(
      {
        item,
        source: draft.answerCode,
        attempt: saved,
        requestId: crypto.randomUUID(),
      },
      { run: runCode, persistResult: persistRunnerResult },
    );
  const runner = useMutation({
    mutationFn: async () => {
      setRunnerError(null);
      const saved = await persist();
      const result = await executeCode(saved);
      setRunnerResult(result);
      return result;
    },
    onError: (error) => setRunnerError(error),
  });
  const action = useMutation({
    mutationFn: async (kind: 'next' | 'pause') => {
      const saved = await persist();
      if (kind === 'pause') {
        await apiMutation(`/api/v1/assessment-runs/${run.id}/pause`, 'POST');
        return null;
      }
      if (item.task.kind === 'CODE' && !isUnknownDraft(draft)) {
        const currentResult = await ensureCurrentCodeResult(
          {
            item,
            source: draft.answerCode,
            attempt: saved,
            requestId: crypto.randomUUID(),
            currentResult: runnerResult,
          },
          { run: runCode, persistResult: persistRunnerResult },
        );
        if (currentResult !== runnerResult) setRunnerResult(currentResult);
      }
      await apiMutation(`/api/v1/attempts/${saved.id}/submit`, 'POST');
      return apiMutation<PrebaselineNextResponse>(`/api/v1/assessments/${run.id}/next`, 'POST');
    },
    onSuccess: async (next, kind) => {
      if (kind === 'pause') {
        router.push('/assessment');
        return;
      }
      if (next !== null) onDecision(next);
      await refresh();
    },
  });
  const cluster = response?.cluster?.title ?? item.task.topicTitle;

  return (
    <div className="sf-stack">
      <PageHeader
        eyebrow={`Быстрая калибровка · ${cluster}`}
        title={run.title}
        description="Следующий вопрос выбирается по информационной ценности. Калибровка может закончиться раньше полного пула."
        actions={<AutosaveIndicator state={state} />}
      />
      <div className="sf-card-title-row">
        <span className="sf-pill">Draft · нужен human review</span>
        <span className="sf-muted">
          Выбрано {progress.selected} из пула {progress.totalCandidates}
        </span>
      </div>
      <div
        className="sf-assessment-progress"
        role="progressbar"
        aria-label={`Выбрано ${String(progress.selected)} из пула ${String(progress.totalCandidates)}`}
        aria-valuemin={0}
        aria-valuemax={progress.totalCandidates}
        aria-valuenow={progress.selected}
      >
        <span
          style={{
            width: `${Math.min(100, (progress.selected / progress.totalCandidates) * 100)}%`,
          }}
        />
      </div>
      <SectionCard className="sf-task-card">
        <div className="sf-card-title-row">
          <div className="sf-actions">
            <span className="sf-pill">{item.task.kind}</span>
            <span className="sf-pill">{item.task.topicTitle}</span>
          </div>
          <span className="sf-muted">
            {item.task.stableKey} · v{item.task.version}
          </span>
        </div>
        <div className="sf-prompt">{item.task.promptMarkdown}</div>
        <TaskAnswer
          item={item}
          draft={draft}
          onChange={(nextDraft) => {
            setRunnerResult((current) =>
              runnerResultAfterCodeChange(current, draft.answerCode, nextDraft.answerCode),
            );
            setDraft(nextDraft);
          }}
          onRun={() => runner.mutate()}
          running={runner.isPending}
          runnerResult={runnerResult}
        />
        {runnerError ? <p className="sf-form-error">{runnerError.message}</p> : null}
        <GhostButton
          type="button"
          aria-label="Ответить: Не знаю"
          onClick={() => {
            setRunnerResult((current) =>
              runnerResultAfterCodeChange(current, draft.answerCode, ''),
            );
            setDraft(unknownDraft(item, draft));
          }}
        >
          Не знаю
        </GhostButton>
      </SectionCard>
      {progress.pendingReview > 0 ? (
        <p className="sf-callout" role="status">
          Свободных ответов, ожидающих внешней проверки: {progress.pendingReview}. Они не считаются
          нулём.
        </p>
      ) : null}
      {action.error ? <ErrorState error={action.error} /> : null}
      <div className="sf-session-actions">
        <SecondaryButton
          type="button"
          busy={action.isPending}
          onClick={() => action.mutate('pause')}
        >
          <Pause aria-hidden="true" size={16} /> Пауза
        </SecondaryButton>
        <PrimaryButton type="button" busy={action.isPending} onClick={() => action.mutate('next')}>
          Сохранить и выбрать следующий шаг <ArrowRight aria-hidden="true" size={16} />
        </PrimaryButton>
      </div>
    </div>
  );
}

function PrebaselineStopped({
  run,
  response,
  profile,
}: {
  run: AdaptiveAssessmentRun;
  response: PrebaselineNextResponse | null;
  profile: RoutingProfile | null;
}) {
  const reasons = response?.reasons ?? run.stopDecision?.reasons ?? [];
  const routes = profile?.topicRoutes ?? [];
  const firstRoute = routes[0];
  const sufficiency = profile?.sufficientForRouting ?? false;
  const pendingReview = response?.progress.pendingReview ?? run.pendingReviewCount;

  return (
    <div className="sf-stack">
      <PageHeader
        eyebrow="Калибровка остановлена по правилу"
        title="Следующий полезный шаг определён"
        description="Дополнительные вопросы сейчас мало что добавят к маршруту."
      />
      <div className="sf-card-title-row">
        <span className="sf-pill">Draft · нужен human review</span>
        <span className="sf-pill">
          {sufficiency ? 'Данных достаточно для маршрута' : 'Нужна более глубокая диагностика'}
        </span>
      </div>
      <SectionCard>
        <h2>Почему калибровка остановилась</h2>
        {reasons.length > 0 ? (
          <ul className="sf-list">
            {reasons.map((reason, index) => (
              <li key={`${String(index)}:${reason}`}>{reason}</li>
            ))}
          </ul>
        ) : (
          <p>Сохранён stop decision adaptive routing.</p>
        )}
        {pendingReview > 0 ? (
          <p className="sf-callout">
            Ожидают внешней проверки: {pendingReview}. Эти ответы сохранены как partial и не
            превращены в нулевой результат.
          </p>
        ) : null}
      </SectionCard>
      {routes.length > 0 ? (
        <SectionCard>
          <h2>Маршрут по наблюдаемым темам</h2>
          <ul className="sf-list">
            {routes.map((route) => (
              <li className="sf-list-row" key={route.topicKey}>
                <div>
                  <strong>{route.topicKey}</strong>
                  <p className="sf-muted">{PHASE_LABELS[route.recommendedPhase]}</p>
                </div>
                <span className="sf-pill">{CAPABILITY_LABELS[route.primaryGap]}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}
      <AiReviewList
        items={run.items}
        manualExportHref={`/import-export?mode=export&assessmentRunId=${run.id}`}
      />
      <div className="sf-actions">
        {firstRoute ? (
          <Link className="sf-button sf-button--primary" href={`/topics/${firstRoute.topicKey}`}>
            Открыть тему и следующий шаг
          </Link>
        ) : null}
        <Link className="sf-button sf-button--secondary" href="/assessment">
          Вернуться к диагностикам
        </Link>
        <Link
          className="sf-button sf-button--secondary"
          href={`/import-export?mode=export&assessmentRunId=${run.id}`}
        >
          Manual export
        </Link>
      </div>
    </div>
  );
}
