'use client';

import { SecondaryButton } from '@skillforge/ui';
import { Play } from 'lucide-react';
import type { AttemptDraft } from './use-attempt-autosave';
import type { RunnerResult, TaskItem } from '@/shared/api/types';
import { CodeEditor } from '@/features/runner/code-editor';

export function TaskAnswer({
  item,
  draft,
  onChange,
  onRun,
  running,
  runnerResult,
}: {
  item: TaskItem;
  draft: AttemptDraft;
  onChange: (draft: AttemptDraft) => void;
  onRun: () => void;
  running: boolean;
  runnerResult: RunnerResult | null;
}) {
  const update = <K extends keyof AttemptDraft>(key: K, value: AttemptDraft[K]) =>
    onChange({ ...draft, [key]: value });
  const kind = item.task.kind;

  if (kind === 'SINGLE_CHOICE' || kind === 'MULTIPLE_CHOICE') {
    const multiple = kind === 'MULTIPLE_CHOICE';
    return (
      <fieldset className="sf-choice-list">
        <legend>Выбери {multiple ? 'один или несколько вариантов' : 'один вариант'}</legend>
        {item.task.options.map((option) => {
          const checked = draft.selectedOptions.includes(option.id);
          return (
            <label key={option.id} className="sf-choice">
              <input
                type={multiple ? 'checkbox' : 'radio'}
                name={`answer-${item.id}`}
                checked={checked}
                onChange={(event) => {
                  if (!multiple) update('selectedOptions', event.target.checked ? [option.id] : []);
                  else if (event.target.checked)
                    update('selectedOptions', [...draft.selectedOptions, option.id]);
                  else
                    update(
                      'selectedOptions',
                      draft.selectedOptions.filter((id) => id !== option.id),
                    );
                }}
              />
              <span>{option.label}</span>
            </label>
          );
        })}
      </fieldset>
    );
  }

  if (kind === 'CODE') {
    return (
      <div className="sf-stack">
        <CodeEditor
          value={draft.answerCode}
          onChange={(answerCode) => update('answerCode', answerCode)}
          language={item.task.language ?? 'javascript'}
        />
        <div className="sf-actions">
          <SecondaryButton busy={running} onClick={onRun} type="button">
            <Play aria-hidden="true" size={16} /> Запустить тесты
          </SecondaryButton>
          <span className="sf-muted">Worker будет остановлен через 2 секунды.</span>
        </div>
        {runnerResult ? <RunnerOutput result={runnerResult} /> : null}
      </div>
    );
  }

  return (
    <label className="sf-field">
      <span>{kind === 'PREDICT_OUTPUT' ? 'Ожидаемый вывод и объяснение' : 'Ответ'}</span>
      <textarea
        className="sf-textarea sf-answer-textarea"
        value={draft.answerText}
        onChange={(event) => update('answerText', event.target.value)}
        placeholder="Ответ сохраняется автоматически. «Не знаю» — валидный ответ."
      />
    </label>
  );
}

export function RunnerOutput({ result }: { result: RunnerResult }) {
  return (
    <section className="sf-runner-output" aria-live="polite">
      <div className="sf-card-title-row">
        <strong>
          {result.status === 'passed'
            ? 'Тесты пройдены'
            : result.status === 'timeout'
              ? 'Время истекло'
              : 'Нужна правка'}
        </strong>
        <span>{result.durationMs} мс</span>
      </div>
      {result.tests.length > 0 ? (
        <ul className="sf-list">
          {result.tests.map((test) => (
            <li key={test.name} className={test.passed ? 'sf-test--passed' : 'sf-test--failed'}>
              {test.passed ? '✓' : '×'} {test.name}
              {test.message ? ` — ${test.message}` : ''}
            </li>
          ))}
        </ul>
      ) : null}
      {result.console.length > 0 ? (
        <pre className="sf-code">{result.console.join('\n')}</pre>
      ) : null}
      {result.error ? (
        <p className="sf-form-error">
          {result.error.name}: {result.error.message}
        </p>
      ) : null}
      <small className="sf-muted">
        Hidden tests не раскрываются; в local MVP это UX-механика, а не security boundary.
      </small>
    </section>
  );
}
