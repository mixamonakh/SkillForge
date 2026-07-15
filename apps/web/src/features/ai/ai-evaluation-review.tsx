'use client';

import { PrimaryButton, SecondaryButton, SectionCard, StatusBadge } from '@skillforge/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, ShieldCheck, Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import type { TaskItem } from '@/shared/api/types';

import { fetchAiEvaluation, requestAiEvaluation, transitionAiEvaluation } from './api';
import { AI_USAGE_QUERY_KEY, useAiUsage } from './ai-usage';
import type { AiEvaluationResponse } from './contracts';

const DRAFT_STATUS_COPY = {
  PENDING: 'Ожидает решения',
  APPLIED: 'Применено',
  REJECTED: 'Отклонено',
  ROLLED_BACK: 'Отменено компенсирующей оценкой',
} as const;

function draftStorageKey(attemptId: string): string {
  return `skillforge:ai-evaluation-draft:${attemptId}`;
}

function rememberDraft(attemptId: string, draftId: string): void {
  try {
    window.localStorage.setItem(draftStorageKey(attemptId), draftId);
  } catch {
    // The server draft remains authoritative when browser storage is unavailable.
  }
}

function forgetDraft(attemptId: string): void {
  try {
    window.localStorage.removeItem(draftStorageKey(attemptId));
  } catch {
    // A blocked browser store must not break the server lifecycle.
  }
}

function rememberedDraft(attemptId: string): string | null {
  try {
    return window.localStorage.getItem(draftStorageKey(attemptId));
  } catch {
    return null;
  }
}

function usd(value: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(value);
}

function percent(value: number): string {
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value * 100)}%`;
}

function aiErrorCopy(error: Error): string {
  const code = 'code' in error && typeof error.code === 'string' ? error.code : null;
  if (code === 'AI_PROVIDER_DISABLED') {
    return 'API-assisted проверка отключена. Manual export/import остаётся полностью доступен.';
  }
  if (code === 'AI_BUDGET_EXCEEDED') {
    return 'Месячный AI-лимит исчерпан. Ответ сохранён; используй manual export/import.';
  }
  if (code === 'AI_INVOCATION_IN_PROGRESS') {
    return 'Такая проверка уже выполняется. Повтори загрузку через несколько секунд.';
  }
  if (code === 'AI_REVIEW_NOT_REQUIRED') {
    return 'Для этой попытки нет rubric dimensions, ожидающих AI-проверки.';
  }
  return error.message;
}

function StateSnapshot({
  state,
}: {
  state: AiEvaluationResponse['preview']['projectedChanges'][number]['current'];
}) {
  if (state === null) return <span className="sf-muted">Нет состояния</span>;
  return (
    <div className="sf-ai-state-snapshot">
      <StatusBadge status={state.status} />
      <small>
        Evidence: {state.evidenceCount} · confidence {Math.round(state.masteryConfidence)}%
      </small>
      {state.masteryEstimate !== null ? (
        <small>Техническая estimate: {Math.round(state.masteryEstimate)} / 100</small>
      ) : null}
    </div>
  );
}

function AiEvaluationPreview({ evaluation }: { evaluation: AiEvaluationResponse }) {
  const { candidate, preview, invocation } = evaluation;
  return (
    <div className="sf-ai-preview" data-testid="ai-evaluation-preview">
      <div className="sf-grid sf-grid--3 sf-ai-preview-summary">
        <div>
          <span>Candidate score</span>
          <strong>{Math.round(candidate.score)} / 100</strong>
        </div>
        <div>
          <span>Reliability</span>
          <strong>{percent(candidate.reliability)}</strong>
        </div>
        <div>
          <span>Стоимость</span>
          <strong>{usd(preview.cost.actualUsd ?? preview.cost.estimatedUsd)}</strong>
          <small>{preview.cost.cacheHit ? 'cache hit' : 'API request'}</small>
        </div>
      </div>

      <div className="sf-grid sf-grid--2 sf-align-start">
        <div>
          <h4>Правильные части</h4>
          {candidate.correctObservations.length > 0 ? (
            <ul>
              {candidate.correctObservations.map((observation, index) => (
                <li key={`${String(index)}:${observation}`}>{observation}</li>
              ))}
            </ul>
          ) : (
            <p className="sf-muted">Не выделены.</p>
          )}
        </div>
        <div>
          <h4>Ошибки</h4>
          {candidate.errors.length > 0 ? (
            <ul>
              {candidate.errors.map((error, index) => (
                <li key={`${String(index)}:${error}`}>{error}</li>
              ))}
            </ul>
          ) : (
            <p className="sf-muted">Не выделены.</p>
          )}
        </div>
      </div>

      <div>
        <h4>Rubric dimensions</h4>
        <div className="sf-table-scroll">
          <table className="sf-data-table">
            <caption className="sf-sr-only">Rubric dimension scores AI candidate</caption>
            <thead>
              <tr>
                <th>Dimension</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(candidate.dimensionScores).map(([dimension, score]) => (
                <tr key={dimension}>
                  <td>{dimension}</td>
                  <td>{Math.round(score)} / 100</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h4>Evidence, которое будет создано</h4>
        {preview.candidateEvidence.length > 0 ? (
          <ul className="sf-list">
            {preview.candidateEvidence.map((evidence, index) => (
              <li
                className="sf-list-row"
                key={`${evidence.topicKey}:${evidence.kind}:${String(index)}`}
              >
                <span>
                  <strong>{evidence.topicKey}</strong> · {evidence.kind}
                  <br />
                  <small className="sf-muted">{evidence.explanation}</small>
                </span>
                <span>{percent(evidence.strength)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="sf-muted">Candidate не предлагает evidence.</p>
        )}
      </div>

      {preview.prebaselineSuppressed ? (
        <div className="sf-callout" role="status">
          <strong>Pre-baseline: knowledge state не изменится</strong>
          <p>
            Apply сохранит audit evaluation, но не создаст Evidence и не изменит TopicStatus или
            mastery.
          </p>
        </div>
      ) : (
        <div>
          <h4>Projected state diff</h4>
          {preview.projectedChanges.length > 0 ? (
            <ul className="sf-ai-projected-list">
              {preview.projectedChanges.map((change) => (
                <li key={change.topicKey}>
                  <strong>{change.topicKey}</strong>
                  <div className="sf-ai-state-diff">
                    <StateSnapshot state={change.current} />
                    <span aria-hidden="true">→</span>
                    <StateSnapshot state={change.projected} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sf-muted">Применение не меняет текущую projection.</p>
          )}
        </div>
      )}

      {candidate.misconceptions.length > 0 ? (
        <div>
          <h4>Misconceptions</h4>
          <ul>
            {candidate.misconceptions.map((item) => (
              <li key={item.key}>
                <strong>{item.key}</strong>: {item.description} ({percent(item.confidence)})
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {candidate.feedbackMarkdown ? (
        <div>
          <h4>Feedback</h4>
          <div className="sf-ai-feedback">{candidate.feedbackMarkdown}</div>
        </div>
      ) : null}

      <details>
        <summary>Audit details</summary>
        <p className="sf-muted">
          {invocation.provider} / {invocation.model} · {invocation.promptKey}@
          {invocation.promptVersion} · invocation {invocation.id}
        </p>
        <p className="sf-muted">
          Локальных deterministic evaluations в preview: {preview.deterministicEvaluations.length}.
        </p>
        {candidate.warnings.length > 0 ? (
          <ul>
            {candidate.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}
      </details>
    </div>
  );
}

export function AiEvaluationReview({
  attemptId,
  manualExportHref,
  onLifecycleChange,
}: {
  attemptId: string;
  manualExportHref: string;
  onLifecycleChange?: (() => unknown) | undefined;
}) {
  const queryClient = useQueryClient();
  const usage = useAiUsage();
  const [draftId, setDraftId] = useState<string | null>(null);
  const [latest, setLatest] = useState<AiEvaluationResponse | null>(null);

  useEffect(() => {
    setDraftId(rememberedDraft(attemptId));
    setLatest(null);
  }, [attemptId]);

  const draft = useQuery({
    queryKey: ['ai-evaluation-draft', draftId],
    queryFn: () => fetchAiEvaluation(draftId ?? ''),
    enabled: draftId !== null && latest === null,
    retry: false,
  });

  useEffect(() => {
    if (draft.error instanceof Error && 'status' in draft.error && draft.error.status === 404) {
      forgetDraft(attemptId);
      setDraftId(null);
    }
  }, [attemptId, draft.error]);

  const evaluation = latest ?? draft.data ?? null;
  const afterSuccess = async (response: AiEvaluationResponse) => {
    setLatest(response);
    setDraftId(response.draft.id);
    rememberDraft(attemptId, response.draft.id);
    await queryClient.invalidateQueries({ queryKey: AI_USAGE_QUERY_KEY });
    await onLifecycleChange?.();
  };
  const evaluate = useMutation({
    mutationFn: () => requestAiEvaluation(attemptId),
    onSuccess: afterSuccess,
  });
  const transition = useMutation({
    mutationFn: (action: 'apply' | 'reject' | 'rollback') => {
      if (evaluation === null) throw new Error('AI evaluation draft не загружен.');
      return transitionAiEvaluation(evaluation.draft.id, action);
    },
    onSuccess: afterSuccess,
  });
  const error = evaluate.error ?? transition.error ?? (draftId ? draft.error : null);
  const featureDisabled =
    usage.data !== undefined &&
    (usage.data.mode === 'manual' || !usage.data.features.attemptEvaluation);
  const pending = evaluation?.draft.status === 'PENDING';
  const applied = evaluation?.draft.status === 'APPLIED';

  return (
    <div className="sf-ai-review" data-ai-review-attempt={attemptId}>
      {evaluation ? (
        <>
          <div className="sf-card-title-row">
            <strong>AI review candidate</strong>
            <span
              className="sf-pill"
              role="status"
              aria-live="polite"
              data-ai-draft-status={evaluation.draft.status}
            >
              {DRAFT_STATUS_COPY[evaluation.draft.status]}
            </span>
          </div>
          <AiEvaluationPreview evaluation={evaluation} />
          <div className="sf-actions">
            {pending && evaluation.actions.canApply ? (
              <PrimaryButton
                type="button"
                busy={transition.isPending}
                data-ai-action="apply"
                onClick={() => transition.mutate('apply')}
              >
                <ShieldCheck aria-hidden="true" size={16} /> Применить
              </PrimaryButton>
            ) : null}
            {pending && evaluation.actions.canReject ? (
              <SecondaryButton
                type="button"
                busy={transition.isPending}
                data-ai-action="reject"
                onClick={() => transition.mutate('reject')}
              >
                <X aria-hidden="true" size={16} /> Отклонить
              </SecondaryButton>
            ) : null}
            {applied && evaluation.actions.canRollback ? (
              <SecondaryButton
                type="button"
                busy={transition.isPending}
                data-ai-action="rollback"
                onClick={() => transition.mutate('rollback')}
              >
                <RotateCcw aria-hidden="true" size={16} /> Откатить применение
              </SecondaryButton>
            ) : null}
            <Link className="sf-button sf-button--secondary" href={manualExportHref}>
              Manual export
            </Link>
          </div>
        </>
      ) : (
        <div className="sf-actions">
          {!featureDisabled && !usage.error ? (
            <PrimaryButton
              type="button"
              busy={evaluate.isPending || usage.isLoading}
              disabled={usage.isLoading}
              data-ai-action="evaluate"
              onClick={() => evaluate.mutate()}
            >
              <Sparkles aria-hidden="true" size={16} /> Запросить AI-проверку
            </PrimaryButton>
          ) : null}
          <Link className="sf-button sf-button--secondary" href={manualExportHref}>
            Manual export
          </Link>
        </div>
      )}
      {featureDisabled && evaluation === null ? (
        <p className="sf-callout" role="status" aria-live="polite">
          API-assisted проверка выключена. Manual export/import работает без API key.
        </p>
      ) : null}
      {usage.error && evaluation === null ? (
        <p className="sf-callout" role="status" aria-live="polite">
          Не удалось проверить доступность AI API. Manual export/import остаётся доступен.
        </p>
      ) : null}
      {error ? (
        <p className="sf-form-error" role="alert" aria-live="assertive">
          {aiErrorCopy(error)}
        </p>
      ) : null}
    </div>
  );
}

export function attemptNeedsAiReview(
  item: TaskItem,
): item is TaskItem & { attempt: NonNullable<TaskItem['attempt']> } {
  const attempt = item.attempt;
  return Boolean(
    attempt?.submittedAt &&
    attempt.evaluationCoverage !== null &&
    attempt.evaluationCoverage.pendingDimensions.length > 0,
  );
}

export function AiReviewList({
  items,
  manualExportHref,
  onLifecycleChange,
}: {
  items: TaskItem[];
  manualExportHref: string;
  onLifecycleChange?: (() => unknown) | undefined;
}) {
  const [trackedAttempts, setTrackedAttempts] = useState<ReadonlySet<string>>(
    () => new Set(items.filter(attemptNeedsAiReview).map((item) => item.attempt.id)),
  );
  useEffect(() => {
    const restored = items.flatMap((item) => {
      const attemptId = item.attempt?.id;
      if (!attemptId) return [];
      return rememberedDraft(attemptId) ? [attemptId] : [];
    });
    if (restored.length === 0) return;
    setTrackedAttempts((current) => new Set([...current, ...restored]));
  }, [items]);
  const reviewable = items.filter(
    (item): item is TaskItem & { attempt: NonNullable<TaskItem['attempt']> } =>
      attemptNeedsAiReview(item) || (item.attempt !== null && trackedAttempts.has(item.attempt.id)),
  );
  if (reviewable.length === 0) return null;
  return (
    <SectionCard data-testid="ai-review-list">
      <h2>Ответы, ожидающие rubric review</h2>
      <p className="sf-muted">
        AI создаёт только проверяемый candidate. Knowledge state изменится только после явного
        Apply; любой draft можно отклонить, а применённый — компенсирующе откатить.
      </p>
      <div className="sf-ai-review-list">
        {reviewable.map((item) => (
          <article key={item.id} className="sf-ai-review-item">
            <div className="sf-card-title-row">
              <div>
                <h3>{item.task.topicTitle}</h3>
                <code>{item.task.stableKey}</code>
              </div>
              <span className="sf-pill">{item.task.kind}</span>
            </div>
            <AiEvaluationReview
              attemptId={item.attempt.id}
              manualExportHref={manualExportHref}
              onLifecycleChange={() => {
                setTrackedAttempts((current) => new Set([...current, item.attempt.id]));
                return onLifecycleChange?.();
              }}
            />
          </article>
        ))}
      </div>
    </SectionCard>
  );
}
