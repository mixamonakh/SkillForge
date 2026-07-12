'use client';

import {
  AutosaveIndicator,
  GhostButton,
  PageHeader,
  PrimaryButton,
  SectionCard,
  SecondaryButton,
} from '@skillforge/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Lightbulb, Pause } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ErrorState, LoadingState } from '@/components/data-state';
import { TaskAnswer } from '@/features/assessment/task-answer';
import { useAttemptAutosave } from '@/features/assessment/use-attempt-autosave';
import {
  ensureCurrentCodeResult,
  runAndPersistCurrentCode,
  runnerResultAfterCodeChange,
} from '@/features/runner/code-attempt';
import { runCode } from '@/features/runner/run-code';
import { apiFetch, apiMutation } from '@/shared/api/client';
import type { LearningSession, RunnerResult } from '@/shared/api/types';

export function ActiveSession({ sessionId }: { sessionId: string }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => apiFetch<LearningSession>(`/api/v1/sessions/${sessionId}`),
  });
  const resumeMutation = useMutation({
    mutationFn: () => apiMutation(`/api/v1/sessions/${sessionId}/start`, 'POST'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['session', sessionId] }),
  });
  const session = query.data;
  const firstPending = useMemo(() => {
    const found =
      session?.items.findIndex(
        (item) => item.attempt?.submittedAt === null || item.attempt === null,
      ) ?? 0;
    return found >= 0 ? found : Math.max(0, (session?.items.length ?? 1) - 1);
  }, [session]);
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(firstPending), [firstPending, session?.id]);

  if (query.isLoading) return <LoadingState />;
  if (query.error) return <ErrorState error={query.error} retry={() => void query.refetch()} />;
  if (!session) return null;
  if (session.status === 'COMPLETED') return <SessionSummaryView session={session} />;
  if (session.status === 'PAUSED') {
    return (
      <div className="sf-stack">
        <PageHeader
          eyebrow="Сессия на паузе"
          title={session.title}
          description={session.lastStepLabel ?? session.goal}
        />
        <SectionCard>
          <h2>Контекст и ответы сохранены</h2>
          <p className="sf-muted">
            Продолжение вернёт тебя к первому незавершённому item без штрафа за паузу.
          </p>
          {resumeMutation.error ? <ErrorState error={resumeMutation.error} /> : null}
          <PrimaryButton busy={resumeMutation.isPending} onClick={() => resumeMutation.mutate()}>
            Продолжить сессию
          </PrimaryButton>
        </SectionCard>
      </div>
    );
  }
  const item = session.items[index];
  if (!item) return <ErrorState error={new Error('План сессии не содержит items.')} />;
  return (
    <SessionItemView
      key={item.id}
      session={session}
      index={index}
      setIndex={setIndex}
      refresh={() => queryClient.invalidateQueries({ queryKey: ['session', sessionId] })}
    />
  );
}

function SessionItemView({
  session,
  index,
  setIndex,
  refresh,
}: {
  session: LearningSession;
  index: number;
  setIndex: (index: number) => void;
  refresh: () => Promise<void>;
}) {
  const item = session.items[index];
  if (!item) throw new Error('Session item index is out of range.');
  const autosave = useAttemptAutosave(session.id, item);
  const [shownHints, setShownHints] = useState(autosave.draft.hintsUsed.length);
  const [runnerResult, setRunnerResult] = useState<RunnerResult | null>(
    item.attempt?.runnerOutput ?? null,
  );
  const [finishing, setFinishing] = useState(false);
  const persistRunnerResult = async (
    saved: { id: string; revision: number },
    result: RunnerResult,
  ) => {
    await apiMutation(`/api/v1/attempts/${saved.id}/run-code`, 'POST', {
      revision: saved.revision,
      runnerResult: result,
    });
  };
  const runMutation = useMutation({
    mutationFn: async () => {
      const saved = await autosave.persist();
      const result = await runAndPersistCurrentCode(
        {
          item,
          source: autosave.draft.answerCode,
          attempt: saved,
          requestId: crypto.randomUUID(),
        },
        { run: runCode, persistResult: persistRunnerResult },
      );
      setRunnerResult(result);
    },
  });
  const submitMutation = useMutation({
    mutationFn: async () => {
      const saved = await autosave.persist();
      const currentResult = await ensureCurrentCodeResult(
        {
          item,
          source: autosave.draft.answerCode,
          attempt: saved,
          requestId: crypto.randomUUID(),
          currentResult: runnerResult,
        },
        { run: runCode, persistResult: persistRunnerResult },
      );
      if (currentResult !== runnerResult) setRunnerResult(currentResult);
      await apiMutation(`/api/v1/attempts/${saved.id}/submit`, 'POST');
      if (index === session.items.length - 1) setFinishing(true);
    },
    onSuccess: async () => {
      await refresh();
      if (index < session.items.length - 1) setIndex(index + 1);
    },
  });
  const pauseMutation = useMutation({
    mutationFn: async () => {
      await autosave.persist();
      await apiMutation(`/api/v1/sessions/${session.id}/pause`, 'POST');
    },
    onSuccess: refresh,
  });
  const showHint = () => {
    const nextCount = Math.min(shownHints + 1, item.task.hints.length);
    const helpLevel = nextCount <= 1 ? 'HINT' : 'MULTIPLE_HINTS';
    setShownHints(nextCount);
    autosave.setDraft({
      ...autosave.draft,
      helpLevel,
      hintsUsed: item.task.hints.slice(0, nextCount),
    });
  };

  if (finishing) return <SessionReflection session={session} refresh={refresh} />;
  return (
    <div className="sf-stack">
      <PageHeader
        eyebrow={`${session.mode} · ${session.loadMode} · шаг ${index + 1} из ${session.items.length}`}
        title={session.title}
        description={`${session.goal} · ${session.documentationAllowed ? 'Документация разрешена' : 'Без документации'}`}
        actions={<AutosaveIndicator state={autosave.state} />}
      />
      <SectionCard>
        <div className="sf-card-title-row">
          <span className="sf-pill">{item.purpose}</span>
          <span className="sf-muted">{item.task.topicTitle}</span>
        </div>
        <div className="sf-prompt">{item.task.promptMarkdown}</div>
        <TaskAnswer
          item={item}
          draft={autosave.draft}
          onChange={(nextDraft) => {
            setRunnerResult((current) =>
              runnerResultAfterCodeChange(current, autosave.draft.answerCode, nextDraft.answerCode),
            );
            autosave.setDraft(nextDraft);
          }}
          onRun={() => runMutation.mutate()}
          running={runMutation.isPending}
          runnerResult={runnerResult}
        />
        {shownHints > 0 ? (
          <div className="sf-hints">
            {item.task.hints.slice(0, shownHints).map((hint) => (
              <p key={hint}>
                <Lightbulb aria-hidden="true" size={15} /> {hint}
              </p>
            ))}
          </div>
        ) : null}
        {item.task.hints.length > shownHints ? (
          <GhostButton type="button" onClick={showHint}>
            <Lightbulb aria-hidden="true" size={16} /> Показать подсказку
          </GhostButton>
        ) : null}
        <div className="sf-grid sf-grid--2 sf-reflection-fields">
          <label className="sf-field">
            Self-rating: {autosave.draft.selfRating ?? '—'}
            <input
              type="range"
              min="1"
              max="5"
              value={autosave.draft.selfRating ?? 3}
              onChange={(event) =>
                autosave.setDraft({ ...autosave.draft, selfRating: Number(event.target.value) })
              }
            />
          </label>
          <label className="sf-field">
            Confidence: {autosave.draft.confidence ?? '—'}%
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={autosave.draft.confidence ?? 50}
              onChange={(event) =>
                autosave.setDraft({ ...autosave.draft, confidence: Number(event.target.value) })
              }
            />
          </label>
        </div>
      </SectionCard>
      {submitMutation.error || runMutation.error || pauseMutation.error ? (
        <ErrorState
          error={(submitMutation.error ?? runMutation.error ?? pauseMutation.error) as Error}
        />
      ) : null}
      <div className="sf-session-actions">
        <SecondaryButton disabled={index === 0} onClick={() => setIndex(Math.max(0, index - 1))}>
          <ArrowLeft aria-hidden="true" size={16} /> Назад
        </SecondaryButton>
        <SecondaryButton busy={pauseMutation.isPending} onClick={() => pauseMutation.mutate()}>
          <Pause aria-hidden="true" size={16} /> Пауза
        </SecondaryButton>
        <PrimaryButton busy={submitMutation.isPending} onClick={() => submitMutation.mutate()}>
          Сохранить и далее <ArrowRight aria-hidden="true" size={16} />
        </PrimaryButton>
      </div>
    </div>
  );
}

function SessionReflection({
  session,
  refresh,
}: {
  session: LearningSession;
  refresh: () => Promise<void>;
}) {
  const [loadFeedback, setLoadFeedback] = useState('RIGHT');
  const [summary, setSummary] = useState('');
  const complete = useMutation({
    mutationFn: () =>
      apiMutation(`/api/v1/sessions/${session.id}/complete`, 'POST', { loadFeedback, summary }),
    onSuccess: refresh,
  });
  return (
    <div className="sf-stack">
      <PageHeader eyebrow="Финиш" title="Как прошла нагрузка?" />
      <SectionCard>
        <fieldset className="sf-choice-list">
          <legend>Ощущение от сессии</legend>
          {[
            ['EASY', 'Легко'],
            ['RIGHT', 'В самый раз'],
            ['HARD', 'Тяжело'],
            ['OVERLOAD', 'Перегруз'],
          ].map(([value, label]) => (
            <label className="sf-choice" key={value}>
              <input
                type="radio"
                name="load"
                checked={loadFeedback === value}
                onChange={() => setLoadFeedback(value ?? 'RIGHT')}
              />
              {label}
            </label>
          ))}
        </fieldset>
        <label className="sf-field">
          Короткое наблюдение (необязательно)
          <textarea
            className="sf-textarea"
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
          />
        </label>
        {complete.error ? <ErrorState error={complete.error} /> : null}
        <PrimaryButton busy={complete.isPending} onClick={() => complete.mutate()}>
          Завершить сессию
        </PrimaryButton>
      </SectionCard>
    </div>
  );
}

function SessionSummaryView({ session }: { session: LearningSession }) {
  return (
    <div className="sf-stack">
      <PageHeader eyebrow="Сессия завершена" title={session.title} />
      <SectionCard>
        <h2>Evidence сохранены</h2>
        <p>
          Завершение сессии само по себе не означает mastery. Topic state пересчитан только из
          созданных evaluation/evidence.
        </p>
        <p>
          <strong>Нагрузка:</strong> {session.loadFeedback ?? 'не указана'}
        </p>
        {session.summary ? <p>{session.summary}</p> : null}
        <Link className="sf-button sf-button--primary" href="/">
          Следующий полезный шаг
        </Link>
      </SectionCard>
    </div>
  );
}
