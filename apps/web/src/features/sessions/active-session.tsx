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
import { AiReviewList } from '@/features/ai/ai-evaluation-review';
import { requestAiNudge } from '@/features/ai/api';
import { useAiUsage } from '@/features/ai/ai-usage';
import type { AiNudgeResponse } from '@/features/ai/contracts';
import { TaskAnswer } from '@/features/assessment/task-answer';
import { useAttemptAutosave } from '@/features/assessment/use-attempt-autosave';
import {
  ensureCurrentCodeResult,
  runAndPersistCurrentCode,
  runnerResultAfterCodeChange,
} from '@/features/runner/code-attempt';
import { runCode } from '@/features/runner/run-code';
import { apiFetch, apiMutation } from '@/shared/api/client';
import type {
  LearningSession,
  LearningSessionStep,
  RunnerResult,
  SessionContentStep,
  TaskItem,
} from '@/shared/api/types';

function orderedSessionSteps(session: LearningSession | undefined): LearningSessionStep[] {
  if (!session) return [];
  if (session.steps && session.steps.length > 0) {
    return [...session.steps].sort((left, right) => left.position - right.position);
  }
  return session.items.map((taskItem) => ({
    kind: 'TASK',
    id: taskItem.id,
    position: taskItem.position,
    required: true,
    taskItem,
  }));
}

function isStepCompleted(step: LearningSessionStep): boolean {
  return step.kind === 'CONTENT'
    ? step.completedAt !== null
    : step.taskItem.attempt?.submittedAt !== null &&
        step.taskItem.attempt?.submittedAt !== undefined;
}

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
  const steps = useMemo(() => orderedSessionSteps(session), [session]);
  const firstPending = useMemo(() => {
    const found = steps.findIndex((step) => !isStepCompleted(step));
    return found >= 0 ? found : Math.max(0, steps.length - 1);
  }, [steps]);
  const allStepsCompleted = steps.length > 0 && steps.every((step) => isStepCompleted(step));
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(firstPending), [firstPending, session?.id]);

  if (query.isLoading) return <LoadingState />;
  if (query.error) return <ErrorState error={query.error} retry={() => void query.refetch()} />;
  if (!session) return null;
  if (session.status === 'COMPLETED') {
    return (
      <SessionSummaryView
        session={session}
        refresh={() => queryClient.invalidateQueries({ queryKey: ['session', sessionId] })}
      />
    );
  }
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
            Продолжение вернёт тебя к первому незавершённому шагу без штрафа за паузу.
          </p>
          {resumeMutation.error ? <ErrorState error={resumeMutation.error} /> : null}
          <PrimaryButton busy={resumeMutation.isPending} onClick={() => resumeMutation.mutate()}>
            Продолжить сессию
          </PrimaryButton>
        </SectionCard>
      </div>
    );
  }
  if (steps.length === 0) {
    return <ErrorState error={new Error('План сессии не содержит шагов.')} />;
  }
  if (allStepsCompleted) {
    return (
      <SessionReflection
        session={session}
        refresh={() => queryClient.invalidateQueries({ queryKey: ['session', sessionId] })}
      />
    );
  }
  const step = steps[index];
  if (!step) return <ErrorState error={new Error('Шаг сессии не найден.')} />;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
  if (step.kind === 'CONTENT') {
    return (
      <SessionContentStepView
        key={step.id}
        session={session}
        step={step}
        index={index}
        totalSteps={steps.length}
        setIndex={setIndex}
        refresh={refresh}
      />
    );
  }
  return (
    <SessionItemView
      key={step.id}
      session={session}
      item={step.taskItem}
      index={index}
      totalSteps={steps.length}
      setIndex={setIndex}
      refresh={refresh}
    />
  );
}

function SessionContentStepView({
  session,
  step,
  index,
  totalSteps,
  setIndex,
  refresh,
}: {
  session: LearningSession;
  step: SessionContentStep;
  index: number;
  totalSteps: number;
  setIndex: (index: number) => void;
  refresh: () => Promise<void>;
}) {
  const completeMutation = useMutation({
    mutationFn: () =>
      step.completedAt === null
        ? apiMutation<SessionContentStep>(
            `/api/v1/sessions/${session.id}/content-steps/${step.id}/complete`,
            'POST',
          )
        : Promise.resolve(step),
    onSuccess: async () => {
      await refresh();
      setIndex(Math.min(index + 1, totalSteps - 1));
    },
  });
  const pauseMutation = useMutation({
    mutationFn: () => apiMutation(`/api/v1/sessions/${session.id}/pause`, 'POST'),
    onSuccess: refresh,
  });
  const hasPayload = step.content.payload !== null && step.content.payload !== undefined;

  return (
    <div className="sf-stack">
      <PageHeader
        eyebrow={`${session.mode} · ${session.loadMode} · шаг ${index + 1} из ${totalSteps}`}
        title={session.title}
        description={session.goal}
      />
      <SectionCard>
        <div className="sf-card-title-row">
          <span className="sf-pill">{step.content.kind}</span>
          <span className="sf-muted">Материал</span>
        </div>
        <h2>{step.content.title}</h2>
        {step.content.bodyMarkdown ? (
          <div className="sf-prompt">{step.content.bodyMarkdown}</div>
        ) : (
          <p className="sf-muted">Текст материала отсутствует.</p>
        )}
        {hasPayload ? (
          <details>
            <summary>Дополнительные данные</summary>
            <pre className="sf-code">{JSON.stringify(step.content.payload, null, 2)}</pre>
          </details>
        ) : null}
      </SectionCard>
      {completeMutation.error || pauseMutation.error ? (
        <ErrorState error={(completeMutation.error ?? pauseMutation.error) as Error} />
      ) : null}
      <div className="sf-session-actions">
        <SecondaryButton disabled={index === 0} onClick={() => setIndex(Math.max(0, index - 1))}>
          <ArrowLeft aria-hidden="true" size={16} /> Назад
        </SecondaryButton>
        <SecondaryButton busy={pauseMutation.isPending} onClick={() => pauseMutation.mutate()}>
          <Pause aria-hidden="true" size={16} /> Пауза
        </SecondaryButton>
        <PrimaryButton busy={completeMutation.isPending} onClick={() => completeMutation.mutate()}>
          Изучено, дальше <ArrowRight aria-hidden="true" size={16} />
        </PrimaryButton>
      </div>
    </div>
  );
}

function SessionItemView({
  session,
  item,
  index,
  totalSteps,
  setIndex,
  refresh,
}: {
  session: LearningSession;
  item: TaskItem;
  index: number;
  totalSteps: number;
  setIndex: (index: number) => void;
  refresh: () => Promise<void>;
}) {
  const autosave = useAttemptAutosave(session.id, item);
  const usage = useAiUsage();
  const [shownHints, setShownHints] = useState(
    item.task.hints.filter((hint) => autosave.draft.hintsUsed.includes(hint)).length,
  );
  const [nudge, setNudge] = useState<AiNudgeResponse | null>(null);
  const [runnerResult, setRunnerResult] = useState<RunnerResult | null>(
    item.attempt?.runnerOutput ?? null,
  );
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
    },
    onSuccess: async () => {
      await refresh();
      if (index < totalSteps - 1) setIndex(index + 1);
    },
  });
  const pauseMutation = useMutation({
    mutationFn: async () => {
      await autosave.persist();
      await apiMutation(`/api/v1/sessions/${session.id}/pause`, 'POST');
    },
    onSuccess: refresh,
  });
  const nudgeMutation = useMutation({
    mutationFn: async () => {
      const saved = await autosave.persist();
      return requestAiNudge(saved.id);
    },
    onSuccess: async (response) => {
      setNudge(response);
      await refresh();
    },
  });
  const savedNudge =
    nudge?.hint ?? autosave.draft.hintsUsed.find((hint) => !item.task.hints.includes(hint)) ?? null;
  const showHint = () => {
    const nextCount = Math.min(shownHints + 1, item.task.hints.length);
    const aiHints = autosave.draft.hintsUsed.filter((hint) => !item.task.hints.includes(hint));
    const helpLevel = nextCount <= 1 && aiHints.length === 0 ? 'HINT' : 'MULTIPLE_HINTS';
    setShownHints(nextCount);
    autosave.setDraft({
      ...autosave.draft,
      helpLevel,
      hintsUsed: [...aiHints, ...item.task.hints.slice(0, nextCount)],
    });
  };
  const nudgeDisabled =
    usage.data !== undefined && (usage.data.mode === 'manual' || !usage.data.features.nudge);
  const submitted = item.attempt?.submittedAt !== null && item.attempt?.submittedAt !== undefined;
  const otherHelpUsed = autosave.draft.helpLevel !== 'NONE' || autosave.draft.hintsUsed.length > 0;
  const canRequestNudge = !submitted && !otherHelpUsed;

  return (
    <div className="sf-stack">
      <PageHeader
        eyebrow={`${session.mode} · ${session.loadMode} · шаг ${index + 1} из ${totalSteps}`}
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
        {savedNudge ? (
          <div className="sf-ai-nudge" role="status" aria-live="polite" data-testid="ai-nudge">
            <Lightbulb aria-hidden="true" size={16} />
            <div>
              <strong>Сохранённый AI-намёк</strong>
              <p>{savedNudge}</p>
              {nudge?.cacheHit ? <small>Повторный показ без нового списания.</small> : null}
            </div>
          </div>
        ) : null}
        {canRequestNudge && savedNudge === null && !nudgeDisabled && !usage.error ? (
          <GhostButton
            type="button"
            busy={nudgeMutation.isPending || usage.isLoading}
            disabled={usage.isLoading}
            data-ai-action="nudge"
            onClick={() => nudgeMutation.mutate()}
          >
            <Lightbulb aria-hidden="true" size={16} /> Один AI-намёк
          </GhostButton>
        ) : null}
        {canRequestNudge && savedNudge === null && nudgeDisabled ? (
          <p className="sf-muted" role="status">
            AI-намёк отключён; обычные подсказки и продолжение сессии доступны.
          </p>
        ) : null}
        {canRequestNudge && savedNudge === null && usage.error ? (
          <p className="sf-muted" role="status">
            AI-намёк сейчас недоступен; это не блокирует задание.
          </p>
        ) : null}
        {!submitted && savedNudge === null && otherHelpUsed ? (
          <p className="sf-muted" role="status">
            AI-намёк недоступен после другой подсказки для этой попытки.
          </p>
        ) : null}
        {nudgeMutation.error ? (
          <p className="sf-form-error" role="alert" aria-live="assertive">
            AI-намёк не получен: {nudgeMutation.error.message}. Ответ и действия сессии сохранены.
          </p>
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
      <AiReviewList
        items={session.items}
        manualExportHref={`/import-export?mode=export&sessionId=${session.id}`}
        onLifecycleChange={refresh}
      />
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
        <Link
          className="sf-button sf-button--secondary"
          href={`/import-export?mode=export&sessionId=${session.id}`}
        >
          Manual export
        </Link>
      </SectionCard>
    </div>
  );
}

function SessionSummaryView({
  session,
  refresh,
}: {
  session: LearningSession;
  refresh: () => Promise<unknown>;
}) {
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
        <div className="sf-actions">
          <Link className="sf-button sf-button--primary" href="/">
            Следующий полезный шаг
          </Link>
          <Link
            className="sf-button sf-button--secondary"
            href={`/import-export?mode=export&sessionId=${session.id}`}
          >
            Manual export
          </Link>
        </div>
      </SectionCard>
      <AiReviewList
        items={session.items}
        manualExportHref={`/import-export?mode=export&sessionId=${session.id}`}
        onLifecycleChange={refresh}
      />
    </div>
  );
}
