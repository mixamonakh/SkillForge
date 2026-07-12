'use client';

import {
  AutosaveIndicator,
  GhostButton,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  SectionCard,
} from '@skillforge/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Pause, Play } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ErrorState, LoadingState } from '@/components/data-state';
import {
  ensureCurrentCodeResult,
  runAndPersistCurrentCode,
  runnerResultAfterCodeChange,
} from '@/features/runner/code-attempt';
import { runCode } from '@/features/runner/run-code';
import { apiFetch, apiMutation } from '@/shared/api/client';
import type { AssessmentRun, RunnerResult } from '@/shared/api/types';
import { deterministicResultLabel, summarizeAssessmentItems } from './assessment-results';
import { TaskAnswer } from './task-answer';
import { useAttemptAutosave } from './use-attempt-autosave';

export function ActiveAssessment({ runId }: { runId: string }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const query = useQuery({
    queryKey: ['assessment-run', runId],
    queryFn: () => apiFetch<AssessmentRun>(`/api/v1/assessment-runs/${runId}`),
  });
  const run = query.data;
  const initialIndex = useMemo(() => {
    if (!run) return 0;
    const found = run.items.findIndex(
      (item) => item.blockIndex === run.currentBlock && item.position === run.currentPosition,
    );
    if (found >= 0) return found;
    const firstPending = run.items.findIndex(
      (item) => item.attempt?.submittedAt === null || item.attempt === null,
    );
    return firstPending >= 0 ? firstPending : Math.max(0, run.items.length - 1);
  }, [run]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [completedBlock, setCompletedBlock] = useState<number | null>(null);
  useEffect(() => setActiveIndex(initialIndex), [initialIndex, run?.id]);

  if (query.isLoading) return <LoadingState count={4} />;
  if (query.error) return <ErrorState error={query.error} retry={() => void query.refetch()} />;
  if (!run || run.items.length === 0)
    return <ErrorState error={new Error('Snapshot диагностики пуст.')} />;

  if (run.status === 'COMPLETED') return <AssessmentCompleted run={run} />;
  if (run.status === 'PAUSED') {
    return (
      <AssessmentPaused
        run={run}
        refresh={async () => {
          await queryClient.invalidateQueries({ queryKey: ['assessment-run', runId] });
        }}
      />
    );
  }
  if (completedBlock !== null) {
    return (
      <AssessmentBlockCompleted
        run={run}
        blockIndex={completedBlock}
        onContinue={() => {
          const nextIndex = run.items.findIndex(
            (candidate) => candidate.blockIndex === completedBlock + 1,
          );
          setActiveIndex(nextIndex >= 0 ? nextIndex : activeIndex);
          setCompletedBlock(null);
        }}
        onPause={async () => {
          await apiMutation(`/api/v1/assessment-runs/${run.id}/pause`, 'POST');
          router.push('/assessment');
        }}
      />
    );
  }
  const item = run.items[Math.min(activeIndex, run.items.length - 1)];
  if (!item) return null;
  return (
    <AssessmentItem
      key={item.id}
      run={run}
      itemIndex={activeIndex}
      onPrevious={() => setActiveIndex((index) => Math.max(0, index - 1))}
      onNext={() => setActiveIndex((index) => Math.min(run.items.length - 1, index + 1))}
      onBlockCompleted={setCompletedBlock}
      refresh={async () => {
        await queryClient.invalidateQueries({ queryKey: ['assessment-run', runId] });
      }}
      exit={() => router.push('/assessment')}
    />
  );
}

function AssessmentPaused({ run, refresh }: { run: AssessmentRun; refresh: () => Promise<void> }) {
  const resume = useMutation({
    mutationFn: () => apiMutation(`/api/v1/assessment-runs/${run.id}/resume`, 'POST'),
    onSuccess: refresh,
  });
  return (
    <div className="sf-stack">
      <PageHeader eyebrow="Диагностика на паузе" title={run.title} />
      <SectionCard className="sf-callout">
        <h2>Все ответы сохранены</h2>
        <p>Продолжение вернёт к текущему заданию без потери данных.</p>
        {resume.error ? <ErrorState error={resume.error} /> : null}
        <PrimaryButton busy={resume.isPending} onClick={() => resume.mutate()}>
          <Play aria-hidden="true" size={16} /> Продолжить
        </PrimaryButton>
      </SectionCard>
    </div>
  );
}

function AssessmentItem({
  run,
  itemIndex,
  onPrevious,
  onNext,
  onBlockCompleted,
  refresh,
  exit,
}: {
  run: AssessmentRun;
  itemIndex: number;
  onPrevious: () => void;
  onNext: () => void;
  onBlockCompleted: (blockIndex: number) => void;
  refresh: () => Promise<void>;
  exit: () => void;
}) {
  const item = run.items[itemIndex];
  if (!item) throw new Error('Assessment item index is out of range.');
  const { draft, setDraft, state, persist } = useAttemptAutosave(run.sessionId, item);
  const [runnerResult, setRunnerResult] = useState<RunnerResult | null>(
    item.attempt?.runnerOutput ?? null,
  );
  const [runnerError, setRunnerError] = useState<Error | null>(null);
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
  const runMutation = useMutation({
    mutationFn: async () => {
      setRunnerError(null);
      const saved = await persist();
      const result = await executeCode(saved);
      setRunnerResult(result);
      return result;
    },
    onError: (error) => setRunnerError(error),
  });
  const actionMutation = useMutation({
    mutationFn: async (action: 'next' | 'pause') => {
      const saved = await persist();
      if (action === 'pause') {
        await apiMutation(`/api/v1/assessment-runs/${run.id}/pause`, 'POST');
        return { action, lastInBlock: false, hasNext: false };
      }
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
      await apiMutation(`/api/v1/attempts/${saved.id}/submit`, 'POST');
      const next = run.items[itemIndex + 1];
      const lastInBlock = !next || next.blockIndex !== item.blockIndex;
      if (lastInBlock) {
        await apiMutation(`/api/v1/assessment-runs/${run.id}/complete-block`, 'POST');
      }
      if (!next) await apiMutation(`/api/v1/assessment-runs/${run.id}/complete`, 'POST');
      return { action, lastInBlock, hasNext: next !== undefined };
    },
    onSuccess: async (result) => {
      await refresh();
      if (result.action === 'pause') exit();
      else if (result.lastInBlock && result.hasNext) onBlockCompleted(item.blockIndex);
      else onNext();
    },
  });

  const blockItems = run.items.filter((candidate) => candidate.blockIndex === item.blockIndex);
  const positionInBlock = blockItems.findIndex((candidate) => candidate.id === item.id) + 1;

  return (
    <div className="sf-stack">
      <PageHeader
        eyebrow={`Блок ${item.blockIndex + 1} из ${run.totalBlocks} · задание ${positionInBlock} из ${blockItems.length}`}
        title={run.title}
        actions={<AutosaveIndicator state={state} />}
      />
      <div
        className="sf-assessment-progress"
        role="progressbar"
        aria-label={`${itemIndex + 1} из ${run.totalItems}`}
        aria-valuemin={1}
        aria-valuemax={run.totalItems}
        aria-valuenow={itemIndex + 1}
      >
        <span style={{ width: `${((itemIndex + 1) / run.totalItems) * 100}%` }} />
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
          onRun={() => runMutation.mutate()}
          running={runMutation.isPending}
          runnerResult={runnerResult}
        />
        {runnerError ? <p className="sf-form-error">{runnerError.message}</p> : null}
        <GhostButton
          type="button"
          onClick={() => {
            setRunnerResult((current) =>
              runnerResultAfterCodeChange(current, draft.answerCode, ''),
            );
            setDraft({ ...draft, answerText: 'Не знаю', answerCode: '', selectedOptions: [] });
          }}
        >
          Не знаю
        </GhostButton>
      </SectionCard>
      {actionMutation.error ? <ErrorState error={actionMutation.error} /> : null}
      <div className="sf-session-actions">
        <SecondaryButton
          type="button"
          onClick={onPrevious}
          disabled={itemIndex === 0 || actionMutation.isPending}
        >
          <ArrowLeft aria-hidden="true" size={16} /> Назад
        </SecondaryButton>
        <SecondaryButton
          type="button"
          busy={actionMutation.isPending}
          onClick={() => actionMutation.mutate('pause')}
        >
          <Pause aria-hidden="true" size={16} /> Пауза
        </SecondaryButton>
        <PrimaryButton
          type="button"
          busy={actionMutation.isPending}
          onClick={() => actionMutation.mutate('next')}
        >
          {itemIndex === run.items.length - 1 ? 'Завершить диагностику' : 'Сохранить и далее'}
          <ArrowRight aria-hidden="true" size={16} />
        </PrimaryButton>
      </div>
    </div>
  );
}

export function AssessmentBlockCompleted({
  run,
  blockIndex,
  onContinue,
  onPause,
}: {
  run: AssessmentRun;
  blockIndex: number;
  onContinue: () => void;
  onPause: () => Promise<void>;
}) {
  const pauseMutation = useMutation({ mutationFn: onPause });
  const blockItems = run.items.filter((item) => item.blockIndex === blockIndex);
  const { deterministicCount, deterministicItems, pendingItems } =
    summarizeAssessmentItems(blockItems);

  return (
    <div className="sf-stack">
      <PageHeader eyebrow={`Блок ${blockIndex + 1} из ${run.totalBlocks}`} title="Блок сохранён" />
      <SectionCard>
        <h2>Ответы записаны в PostgreSQL</h2>
        <div className="sf-grid sf-grid--2">
          <div>
            <strong className="sf-large-value">{deterministicCount}</strong>
            <p className="sf-muted">детерминированных заданий проверены локально</p>
          </div>
          <div>
            <strong className="sf-large-value">{pendingItems.length}</strong>
            <p className="sf-muted">объяснений и свободных ответов ожидают внешнего анализа</p>
          </div>
        </div>
        {deterministicItems.length > 0 ? <DeterministicResults items={deterministicItems} /> : null}
        <p className="sf-callout">
          Локальная проверка не подменяет оценку объяснений. Можно спокойно продолжить или вернуться
          позже.
        </p>
        {pauseMutation.error ? <ErrorState error={pauseMutation.error} /> : null}
        <div className="sf-actions">
          <PrimaryButton onClick={onContinue}>Продолжить следующий блок</PrimaryButton>
          <SecondaryButton busy={pauseMutation.isPending} onClick={() => pauseMutation.mutate()}>
            На сегодня хватит
          </SecondaryButton>
        </div>
      </SectionCard>
    </div>
  );
}

function AssessmentCompleted({ run }: { run: AssessmentRun }) {
  const { coveredTopics, deterministicItems, pendingItems, totalTopics } = summarizeAssessmentItems(
    run.items,
  );
  return (
    <div className="sf-stack">
      <PageHeader eyebrow="Диагностика завершена" title={run.title} />
      <SectionCard>
        <h2>Локальная проверка завершена</h2>
        <p>
          Кодовые задания и точные ответы проверены детерминированно. Свободные объяснения можно
          экспортировать в ChatGPT для отдельного разбора.
        </p>
        <div className="sf-grid sf-grid--3">
          <div>
            <strong className="sf-large-value">{run.answeredCount}</strong>
            <p className="sf-muted">ответов сохранено</p>
          </div>
          <div>
            <strong className="sf-large-value">
              {coveredTopics} из {totalTopics}
            </strong>
            <p className="sf-muted">тем покрыто сохранёнными ответами</p>
          </div>
          <div>
            <strong className="sf-large-value">{run.pendingReviewCount}</strong>
            <p className="sf-muted">ожидают внешнего анализа</p>
          </div>
        </div>
        {deterministicItems.length > 0 ? <DeterministicResults items={deterministicItems} /> : null}
        {pendingItems.length > 0 ? (
          <div>
            <h3>Ожидают внешнего анализа</h3>
            <ul className="sf-list">
              {pendingItems.map((item) => (
                <li className="sf-list-row" key={item.id}>
                  <span>{item.task.topicTitle}</span>
                  <code>{item.task.stableKey}</code>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="sf-actions">
          <Link
            className="sf-button sf-button--primary"
            href={`/import-export?mode=export&assessmentRunId=${run.id}`}
          >
            Экспортировать для ChatGPT
          </Link>
          <Link className="sf-button sf-button--secondary" href="/roadmap">
            Посмотреть Roadmap
          </Link>
        </div>
      </SectionCard>
    </div>
  );
}

function DeterministicResults({ items }: { items: AssessmentRun['items'] }) {
  return (
    <div>
      <h3>Локально проверенные результаты</h3>
      <ul className="sf-list">
        {items.map((item) => (
          <li className="sf-list-row" key={item.id}>
            <code>{item.task.stableKey}</code>
            <span>{deterministicResultLabel(item)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
