'use client';

import { PrimaryButton } from '@skillforge/ui';
import { ApiError } from '@/shared/api/client';

function record(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}

export function readableApiErrorDetails(error: Error): string[] {
  if (!(error instanceof ApiError)) return [];
  const details = record(error.details);
  const violations = Array.isArray(details.violations)
    ? details.violations.filter((item): item is string => typeof item === 'string')
    : [];
  const issues = Array.isArray(details.issues)
    ? details.issues.flatMap((rawIssue) => {
        const issue = record(rawIssue);
        if (typeof issue.message !== 'string') return [];
        const path = Array.isArray(issue.path)
          ? issue.path
              .filter((item): item is string | number => ['string', 'number'].includes(typeof item))
              .join('.')
          : typeof issue.path === 'string'
            ? issue.path
            : '';
        return [path ? `${path}: ${issue.message}` : issue.message];
      })
    : [];
  return [...new Set([...violations, ...issues])].slice(0, 20);
}

export function LoadingState({ count = 3 }: { count?: number }) {
  return (
    <div className="sf-grid sf-grid--3" aria-label="Загрузка">
      {Array.from({ length: count }, (_, index) => (
        <div className="sf-skeleton" key={index} />
      ))}
    </div>
  );
}

export function ErrorState({ error, retry }: { error: Error; retry?: () => void }) {
  const detailMessages = readableApiErrorDetails(error);
  return (
    <div className="sf-error" role="alert">
      <strong>Не удалось загрузить данные</strong>
      <span>{error.message}</span>
      {error instanceof ApiError && (error.requestId || detailMessages.length > 0) ? (
        <details>
          <summary>Детали ошибки</summary>
          {detailMessages.length > 0 ? (
            <ul>
              {detailMessages.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          ) : null}
          {error.requestId ? <code>requestId: {error.requestId}</code> : null}
        </details>
      ) : null}
      {retry ? <PrimaryButton onClick={retry}>Повторить</PrimaryButton> : null}
    </div>
  );
}
