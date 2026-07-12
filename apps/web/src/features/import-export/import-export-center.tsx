'use client';

import {
  ImportPreviewDiff,
  ConfirmDialog,
  PageHeader,
  PrimaryButton,
  SectionCard,
  SecondaryButton,
  StatusBadge,
} from '@skillforge/ui';
import { parseSkillForgeAnalysisV1, stringifyJsonDocument } from '@skillforge/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clipboard, Download, FileJson, RotateCcw, Upload } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useRef, useState, type KeyboardEvent } from 'react';
import { toast } from 'sonner';
import { ErrorState, LoadingState } from '@/components/data-state';
import { apiFetch, apiMutation } from '@/shared/api/client';
import type { ImportPreview } from '@/shared/api/types';

type ExportResult = {
  id: string;
  bundleId: string;
  fileName: string;
  json: string;
  markdown: string;
  checksum: string;
};

type ExportBundleType = 'assessment-run' | 'session' | 'topic' | 'profile' | 'pending-review';

type ImportValidation = {
  importId: string;
  schemaVersion: string;
  sourceBundleId: string;
  warnings: string[];
};

type ImportHistory = {
  id: string;
  status: string;
  source: string;
  checksum: string;
  createdAt: string;
  appliedAt: string | null;
};

function downloadText(fileName: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function createExportScope(
  bundleType: ExportBundleType,
  scopeId: string,
  dateFrom: string,
  dateTo: string,
): Record<string, string> {
  if (bundleType === 'assessment-run' || bundleType === 'session') {
    return { id: scopeId.trim() };
  }
  if (bundleType === 'topic') return { topicKey: scopeId.trim() };
  if (bundleType === 'profile') {
    return {
      ...(dateFrom ? { from: new Date(`${dateFrom}T00:00:00.000Z`).toISOString() } : {}),
      ...(dateTo ? { to: new Date(`${dateTo}T23:59:59.999Z`).toISOString() } : {}),
    };
  }
  return {};
}

export function ImportExportCenter() {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<'export' | 'import'>(
    searchParams.get('mode') === 'import' ? 'import' : 'export',
  );
  const exportTab = useRef<HTMLButtonElement>(null);
  const importTab = useRef<HTMLButtonElement>(null);
  const handleTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 'export'
        : event.key === 'End'
          ? 'import'
          : mode === 'export'
            ? 'import'
            : 'export';
    setMode(next);
    (next === 'export' ? exportTab : importTab).current?.focus();
  };
  return (
    <div className="sf-stack">
      <PageHeader
        eyebrow="Manual AI workflow"
        title="Import / Export Center"
        description="JSON — строгий machine contract. Markdown — обёртка для внешнего ChatGPT. Импорт всегда проходит validation, preview и транзакционное применение."
      />
      <div className="sf-mode-switch" role="tablist">
        <button
          ref={exportTab}
          id="import-export-tab-export"
          role="tab"
          aria-controls="import-export-panel"
          aria-selected={mode === 'export'}
          tabIndex={mode === 'export' ? 0 : -1}
          onClick={() => setMode('export')}
          onKeyDown={handleTabKey}
        >
          <Download aria-hidden="true" size={17} /> Экспорт
        </button>
        <button
          ref={importTab}
          id="import-export-tab-import"
          role="tab"
          aria-controls="import-export-panel"
          aria-selected={mode === 'import'}
          tabIndex={mode === 'import' ? 0 : -1}
          onClick={() => setMode('import')}
          onKeyDown={handleTabKey}
        >
          <Upload aria-hidden="true" size={17} /> Импорт
        </button>
      </div>
      <div id="import-export-panel" role="tabpanel" aria-labelledby={`import-export-tab-${mode}`}>
        {mode === 'export' ? <ExportPanel /> : <ImportPanel />}
      </div>
    </div>
  );
}

function ExportPanel() {
  const searchParams = useSearchParams();
  const [bundleType, setBundleType] = useState<ExportBundleType>(
    searchParams.has('assessmentRunId')
      ? 'assessment-run'
      : searchParams.has('topic')
        ? 'topic'
        : searchParams.get('scope') === 'profile'
          ? 'profile'
          : 'pending-review',
  );
  const [scopeId, setScopeId] = useState(
    searchParams.get('assessmentRunId') ?? searchParams.get('topic') ?? '',
  );
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [result, setResult] = useState<ExportResult | null>(null);
  const mutation = useMutation({
    mutationFn: () =>
      apiMutation<ExportResult>('/api/v1/exports', 'POST', {
        bundleType,
        scope: createExportScope(bundleType, scopeId, dateFrom, dateTo),
      }),
    onSuccess: setResult,
  });
  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    toast.success('Скопировано');
  };

  return (
    <div className="sf-grid sf-grid--2 sf-align-start">
      <SectionCard>
        <h2>Собрать bundle</h2>
        <label className="sf-field">
          Scope
          <select
            className="sf-select"
            value={bundleType}
            onChange={(event) => {
              setBundleType(event.target.value as ExportBundleType);
              setScopeId('');
              setResult(null);
            }}
          >
            <option value="assessment-run">Текущая диагностика</option>
            <option value="session">Конкретная сессия</option>
            <option value="topic">Конкретная тема</option>
            <option value="profile">Весь профиль / диапазон дат</option>
            <option value="pending-review">Только pending external review</option>
          </select>
        </label>
        {bundleType !== 'profile' && bundleType !== 'pending-review' ? (
          <label className="sf-field">
            ID / topic key
            <input
              className="sf-input"
              value={scopeId}
              onChange={(event) => setScopeId(event.target.value)}
              placeholder="UUID или js.runtime.event-loop"
            />
          </label>
        ) : null}
        {bundleType === 'profile' ? (
          <div className="sf-grid sf-grid--2">
            <label className="sf-field">
              С даты (необязательно)
              <input
                className="sf-input"
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
              />
            </label>
            <label className="sf-field">
              По дату (необязательно)
              <input
                className="sf-input"
                type="date"
                min={dateFrom || undefined}
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
              />
            </label>
          </div>
        ) : null}
        <div className="sf-callout">
          Export immutable: payload и SHA-256 checksum сохраняются в PostgreSQL.
        </div>
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        <PrimaryButton
          busy={mutation.isPending}
          disabled={
            (bundleType === 'assessment-run' ||
              bundleType === 'session' ||
              bundleType === 'topic') &&
            scopeId.trim().length === 0
          }
          onClick={() => mutation.mutate()}
        >
          <FileJson aria-hidden="true" size={17} /> Сформировать
        </PrimaryButton>
      </SectionCard>
      <SectionCard>
        <h2>Результат</h2>
        {!result ? (
          <p className="sf-muted">
            Выбери scope. Здесь появятся JSON и Markdown без скрытого изменения данных.
          </p>
        ) : (
          <div className="sf-stack">
            <p>
              <strong>Bundle:</strong> {result.bundleId}
              <br />
              <small>SHA-256: {result.checksum}</small>
            </p>
            <div className="sf-actions">
              <SecondaryButton
                onClick={() =>
                  downloadText(`${result.fileName}.json`, result.json, 'application/json')
                }
              >
                <Download aria-hidden="true" size={16} /> JSON
              </SecondaryButton>
              <SecondaryButton
                onClick={() =>
                  downloadText(`${result.fileName}.md`, result.markdown, 'text/markdown')
                }
              >
                <Download aria-hidden="true" size={16} /> Markdown
              </SecondaryButton>
              <SecondaryButton onClick={() => void copy(result.json)}>
                <Clipboard aria-hidden="true" size={16} /> Copy JSON
              </SecondaryButton>
              <SecondaryButton onClick={() => void copy(result.markdown)}>
                <Clipboard aria-hidden="true" size={16} /> Copy prompt
              </SecondaryButton>
            </div>
            <details>
              <summary>Предпросмотр Markdown</summary>
              <pre className="sf-export-preview">{result.markdown}</pre>
            </details>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function ImportPanel() {
  const queryClient = useQueryClient();
  const [raw, setRaw] = useState('');
  const [validation, setValidation] = useState<ImportValidation | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const historyQuery = useQuery({
    queryKey: ['imports'],
    queryFn: () => apiFetch<ImportHistory[]>('/api/v1/imports'),
  });
  const validateMutation = useMutation({
    mutationFn: () =>
      apiMutation<ImportValidation>('/api/v1/imports/validate', 'POST', {
        payload: raw,
        source: 'paste',
      }),
    onSuccess: (data) => {
      setValidation(data);
      setPreview(null);
    },
  });
  const previewMutation = useMutation({
    mutationFn: () =>
      apiMutation<ImportPreview>(`/api/v1/imports/${validation?.importId ?? ''}/preview`, 'POST'),
    onSuccess: setPreview,
  });
  const applyMutation = useMutation({
    mutationFn: () => apiMutation(`/api/v1/imports/${validation?.importId ?? ''}/apply`, 'POST'),
    onSuccess: async () => {
      toast.success('Анализ применён транзакционно');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['imports'] }),
        queryClient.invalidateQueries({ queryKey: ['topics'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
    },
  });
  const rollbackMutation = useMutation({
    mutationFn: (importId: string) => apiMutation(`/api/v1/imports/${importId}/rollback`, 'POST'),
    onSuccess: async () => {
      toast.success('Последний import отменён компенсирующей транзакцией');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['imports'] }),
        queryClient.invalidateQueries({ queryKey: ['topics'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['metrics'] }),
      ]);
    },
  });
  const readFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Файл превышает лимит 5 МБ');
      return;
    }
    setRaw(await file.text());
    setValidation(null);
    setPreview(null);
  };
  const downloadNormalized = () => {
    try {
      const normalized = stringifyJsonDocument(parseSkillForgeAnalysisV1(raw));
      downloadText('skillforge-analysis-normalized.json', normalized, 'application/json');
    } catch {
      toast.error('Не удалось собрать нормализованный JSON. Повтори validation.');
    }
  };

  return (
    <div className="sf-stack">
      <div className="sf-grid sf-grid--2 sf-align-start">
        <SectionCard>
          <h2>Вставить analysis JSON</h2>
          <label className="sf-field">
            Strict skillforge-analysis-v1
            <textarea
              className="sf-textarea sf-import-textarea"
              value={raw}
              onChange={(event) => {
                setRaw(event.target.value);
                setValidation(null);
                setPreview(null);
              }}
              placeholder={
                '{\n  "schemaVersion": "1.0",\n  "contract": "skillforge-analysis-v1"\n}'
              }
            />
          </label>
          <label className="sf-file-input">
            <Upload aria-hidden="true" size={18} />
            <span>Выбрать .json</span>
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => void readFile(event.target.files?.[0])}
            />
          </label>
          {validateMutation.error ? <ErrorState error={validateMutation.error} /> : null}
          <PrimaryButton
            busy={validateMutation.isPending}
            disabled={raw.trim().length === 0}
            onClick={() => validateMutation.mutate()}
          >
            Проверить схему
          </PrimaryButton>
        </SectionCard>
        <SectionCard>
          <h2>Validation</h2>
          {!validation ? (
            <p className="sf-muted">JSON не будет применён до preview и явного подтверждения.</p>
          ) : (
            <div className="sf-stack">
              <p className="sf-success-line">
                <CheckCircle2 aria-hidden="true" size={18} /> Schema {validation.schemaVersion}{' '}
                валидна
              </p>
              <p>
                <strong>Source bundle:</strong> {validation.sourceBundleId}
              </p>
              {validation.warnings.map((warning) => (
                <p key={warning} className="sf-callout">
                  {warning}
                </p>
              ))}
              <SecondaryButton
                busy={previewMutation.isPending}
                onClick={() => previewMutation.mutate()}
              >
                Рассчитать preview
              </SecondaryButton>
            </div>
          )}
        </SectionCard>
      </div>
      {previewMutation.error ? <ErrorState error={previewMutation.error} /> : null}
      {preview ? (
        <ImportPreviewDiff>
          <p className="sf-eyebrow">Анализ ещё не применён</p>
          <h2>SkillForge создаст evaluations и evidence, затем пересчитает темы</h2>
          <p className="sf-muted">
            Исходные ответы останутся неизменными. Matched: {preview.matchedAttempts}; evaluations:{' '}
            {preview.evaluationsToCreate}.
          </p>
          {preview.unknownAttempts.length || preview.unknownTopics.length ? (
            <div className="sf-callout">
              Unknown attempts: {preview.unknownAttempts.length}; unknown topics:{' '}
              {preview.unknownTopics.join(', ') || 'нет'}. Они не создадут mastery молча.
            </div>
          ) : null}
          {preview.warnings.length > 0 ? (
            <div className="sf-callout">
              <h3>Предупреждения preview</h3>
              <ul>
                {preview.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {preview.projectedTopics.length > 0 ? (
            <div className="sf-preview-table" role="table" aria-label="Projected topic changes">
              {preview.projectedTopics.map((topic) => (
                <div key={topic.topicKey} role="row">
                  <strong>{topic.title}</strong>
                  <StatusBadge status={topic.currentStatus} />
                  <span>→</span>
                  <StatusBadge status={topic.projectedStatus} />
                  <span>
                    {topic.currentEstimate === null ? '—' : Math.round(topic.currentEstimate)} →{' '}
                    {topic.projectedEstimate === null ? '—' : Math.round(topic.projectedEstimate)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="sf-muted">Изменений TopicState для применения нет.</p>
          )}
          {preview.recommendations.length > 0 ? (
            <div>
              <h3>Рекомендации внешнего анализа</h3>
              <ul className="sf-list">
                {preview.recommendations.map((recommendation) => (
                  <li
                    className="sf-list-row"
                    key={`${recommendation.topicKey}:${String(recommendation.priority)}`}
                  >
                    <span>
                      <strong>{recommendation.topicKey}</strong>
                      <br />
                      <small>{recommendation.reason}</small>
                    </span>
                    <span>Приоритет {recommendation.priority}/5</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {applyMutation.error ? <ErrorState error={applyMutation.error} /> : null}
          <div className="sf-actions">
            <PrimaryButton busy={applyMutation.isPending} onClick={() => applyMutation.mutate()}>
              Применить транзакционно
            </PrimaryButton>
            <SecondaryButton onClick={downloadNormalized}>
              <Download aria-hidden="true" size={16} /> Скачать нормализованный JSON
            </SecondaryButton>
            <SecondaryButton
              onClick={() => {
                setPreview(null);
                setValidation(null);
                toast.message('Анализ не применён');
              }}
            >
              Отклонить
            </SecondaryButton>
          </div>
        </ImportPreviewDiff>
      ) : null}
      <SectionCard>
        <h2>История импортов</h2>
        {historyQuery.isLoading ? <LoadingState /> : null}
        {historyQuery.error ? <ErrorState error={historyQuery.error} /> : null}
        {rollbackMutation.error ? <ErrorState error={rollbackMutation.error} /> : null}
        <ul className="sf-list">
          {historyQuery.data?.map((batch, index) => (
            <li className="sf-list-row" key={batch.id}>
              <span>
                <strong>{batch.status}</strong>
                <br />
                <small>
                  {new Date(batch.createdAt).toLocaleString('ru-RU')} · {batch.source}
                </small>
              </span>
              <span className="sf-actions">
                <code>{batch.checksum.slice(0, 12)}…</code>
                {batch.status === 'APPLIED' && index === 0 ? (
                  <ConfirmDialog
                    destructive
                    trigger={
                      <SecondaryButton>
                        <RotateCcw aria-hidden="true" size={15} /> Отменить import
                      </SecondaryButton>
                    }
                    title="Отменить последний import?"
                    description="Imported evaluations и evidence будут удалены атомарно, TopicState пересчитан. Исходные ответы не изменятся."
                    confirmLabel="Отменить import"
                    onConfirm={() => rollbackMutation.mutate(batch.id)}
                  />
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}
