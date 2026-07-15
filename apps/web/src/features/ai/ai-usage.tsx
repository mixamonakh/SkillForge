'use client';

import { SectionCard } from '@skillforge/ui';
import { useQuery } from '@tanstack/react-query';

import { fetchAiUsage } from './api';

export const AI_USAGE_QUERY_KEY = ['ai-usage-current'] as const;

export function useAiUsage() {
  return useQuery({
    queryKey: AI_USAGE_QUERY_KEY,
    queryFn: fetchAiUsage,
    staleTime: 30_000,
  });
}

function usd(value: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(value);
}

const FEATURE_LABELS = {
  attemptEvaluation: 'Проверка попыток',
  contentReview: 'Проверка content pack',
  nudge: 'Один AI-намёк',
} as const;

export function AiUsagePanel() {
  const usage = useAiUsage();
  const decidedDrafts = (usage.data?.appliedDrafts ?? 0) + (usage.data?.rejectedDrafts ?? 0);
  const appliedRatio =
    decidedDrafts === 0
      ? null
      : Math.round(((usage.data?.appliedDrafts ?? 0) / decidedDrafts) * 100);

  return (
    <SectionCard data-testid="ai-usage-panel">
      <h2>AI usage</h2>
      {usage.isLoading ? (
        <p className="sf-muted" role="status" aria-live="polite">
          Загружаю состояние лимита…
        </p>
      ) : null}
      {usage.error ? (
        <div className="sf-callout" role="status" aria-live="polite">
          <strong>Состояние AI usage недоступно</strong>
          <p>
            Это не блокирует manual export/import и остальные функции SkillForge.{' '}
            {usage.error.message}
          </p>
        </div>
      ) : null}
      {usage.data?.mode === 'manual' ? (
        <div className="sf-callout" role="status" aria-live="polite">
          <strong>Manual mode активен</strong>
          <p>
            API key не требуется. Автоматические запросы не выполняются; доступны strict
            export/import и локальная детерминированная проверка.
          </p>
        </div>
      ) : null}
      {usage.data ? (
        <>
          <p className="sf-muted">
            Период {usage.data.period} · режим{' '}
            {usage.data.mode === 'api-assisted' ? 'API-assisted' : 'manual'}
          </p>
          <div className="sf-grid sf-grid--4 sf-ai-usage-metrics">
            <div>
              <span>Лимит</span>
              <strong>{usd(usage.data.limitUsd)}</strong>
            </div>
            <div>
              <span>Потрачено</span>
              <strong>{usd(usage.data.spentUsd)}</strong>
            </div>
            <div>
              <span>Зарезервировано</span>
              <strong>{usd(usage.data.reservedUsd)}</strong>
            </div>
            <div>
              <span>Осталось</span>
              <strong>{usd(usage.data.remainingUsd)}</strong>
            </div>
          </div>
          <ul className="sf-list sf-ai-feature-list" aria-label="AI feature flags">
            {Object.entries(usage.data.features).map(([feature, enabled]) => (
              <li className="sf-list-row" key={feature}>
                <span>{FEATURE_LABELS[feature as keyof typeof FEATURE_LABELS]}</span>
                <strong>{enabled ? 'Включено' : 'Выключено'}</strong>
              </li>
            ))}
          </ul>
          <div className="sf-grid sf-grid--3 sf-ai-usage-counters">
            <p>
              <strong>{usage.data.requestCount}</strong>
              <span>запросов</span>
            </p>
            <p>
              <strong>{usage.data.cacheHits}</strong>
              <span>cache hits</span>
            </p>
            <p>
              <strong>{usage.data.failures}</strong>
              <span>ошибок</span>
            </p>
            <p>
              <strong>{usd(usage.data.averageCostUsd)}</strong>
              <span>средняя цена</span>
            </p>
            <p>
              <strong>{usage.data.appliedDrafts}</strong>
              <span>применено</span>
            </p>
            <p>
              <strong>{usage.data.rejectedDrafts}</strong>
              <span>отклонено</span>
            </p>
            <p>
              <strong>{appliedRatio === null ? '—' : `${String(appliedRatio)}%`}</strong>
              <span>applied / decided</span>
            </p>
          </div>
          {usage.data.models.length > 0 ? (
            <details>
              <summary>Модели и версии prompt</summary>
              <div className="sf-table-scroll">
                <table className="sf-data-table">
                  <caption className="sf-sr-only">AI model и prompt usage за период</caption>
                  <thead>
                    <tr>
                      <th>Provider / model</th>
                      <th>Prompt</th>
                      <th>Запросы</th>
                      <th>Стоимость</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usage.data.models.map((model) => (
                      <tr
                        key={`${model.provider}:${model.model}:${model.promptKey}:${String(model.promptVersion)}`}
                      >
                        <td>
                          {model.provider} / {model.model}
                        </td>
                        <td>
                          {model.promptKey}@{model.promptVersion}
                        </td>
                        <td>{model.requestCount}</td>
                        <td>{usd(model.costUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ) : (
            <p className="sf-muted">В этом периоде API-запросов ещё нет.</p>
          )}
        </>
      ) : null}
    </SectionCard>
  );
}
