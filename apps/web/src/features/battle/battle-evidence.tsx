'use client';

import {
  ConfirmDialog,
  EmptyState,
  PageHeader,
  PrimaryButton,
  SectionCard,
  SecondaryButton,
} from '@skillforge/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useState, type SyntheticEvent } from 'react';
import { toast } from 'sonner';
import { ErrorState, LoadingState } from '@/components/data-state';
import { apiFetch, apiMutation } from '@/shared/api/client';

type Artifact = {
  id: string;
  title: string;
  sourceType: string;
  projectName: string | null;
  repositoryUrl: string | null;
  resultUrl: string | null;
  description: string;
  acceptanceCriteria: string[];
  beforeNotes: string | null;
  afterNotes: string | null;
  aiUsageNotes: string | null;
  payload: {
    topicKeys?: string[];
    codeDiff?: string;
    checked?: string;
    externalAnalysis?: Record<string, unknown>;
  } | null;
  occurredAt: string;
  evidenceCount: number;
};

type ArtifactDraft = {
  title: string;
  sourceType: string;
  projectName: string;
  repositoryUrl: string;
  resultUrl: string;
  description: string;
  acceptanceCriteria: string;
  topicKeys: string;
  beforeNotes: string;
  afterNotes: string;
  aiUsageNotes: string;
  codeDiff: string;
  checked: string;
  externalAnalysis: string;
  occurredAt: string;
};

export function parseExternalAnalysis(value: string): Record<string, unknown> | undefined {
  if (!value.trim()) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('Внешний analysis должен быть валидным JSON object.');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Внешний analysis должен быть JSON object.');
  }
  return parsed as Record<string, unknown>;
}

function newDraft(topic = ''): ArtifactDraft {
  return {
    title: '',
    sourceType: 'PROJECT',
    projectName: '',
    repositoryUrl: '',
    resultUrl: '',
    description: '',
    acceptanceCriteria: '',
    topicKeys: topic,
    beforeNotes: '',
    afterNotes: '',
    aiUsageNotes: '',
    codeDiff: '',
    checked: '',
    externalAnalysis: '',
    occurredAt: new Date().toISOString().slice(0, 10),
  };
}

export function BattleEvidence() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(() => newDraft(searchParams.get('topic') ?? ''));
  const [editing, setEditing] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['external-artifacts'],
    queryFn: () => apiFetch<Artifact[]>('/api/v1/external-artifacts'),
  });
  const save = useMutation({
    mutationFn: () => {
      const payload = {
        ...draft,
        acceptanceCriteria: draft.acceptanceCriteria
          .split('\n')
          .map((item) => item.trim())
          .filter(Boolean),
        payload: {
          topicKeys: draft.topicKeys
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
          codeDiff: draft.codeDiff,
          checked: draft.checked,
          externalAnalysis: parseExternalAnalysis(draft.externalAnalysis),
        },
        occurredAt: new Date(`${draft.occurredAt}T12:00:00.000Z`).toISOString(),
      };
      return editing
        ? apiMutation<Artifact>(`/api/v1/external-artifacts/${editing}`, 'PATCH', payload)
        : apiMutation<Artifact>('/api/v1/external-artifacts', 'POST', payload);
    },
    onSuccess: async () => {
      setDraft(newDraft());
      setEditing(null);
      toast.success('Внешний результат сохранён');
      await queryClient.invalidateQueries({ queryKey: ['external-artifacts'] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiMutation(`/api/v1/external-artifacts/${id}`, 'DELETE'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['external-artifacts'] }),
  });
  const createEvidence = useMutation({
    mutationFn: (id: string) =>
      apiMutation(`/api/v1/external-artifacts/${id}/create-evidence`, 'POST', { confirmed: true }),
    onSuccess: async () => {
      toast.success('BATTLE / TRANSFER evidence создано');
      await queryClient.invalidateQueries({ queryKey: ['external-artifacts'] });
    },
  });
  const update = (key: keyof ArtifactDraft, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const edit = (artifact: Artifact) => {
    setEditing(artifact.id);
    setDraft({
      title: artifact.title,
      sourceType: artifact.sourceType,
      projectName: artifact.projectName ?? '',
      repositoryUrl: artifact.repositoryUrl ?? '',
      resultUrl: artifact.resultUrl ?? '',
      description: artifact.description,
      acceptanceCriteria: artifact.acceptanceCriteria.join('\n'),
      topicKeys: artifact.payload?.topicKeys?.join(', ') ?? '',
      beforeNotes: artifact.beforeNotes ?? '',
      afterNotes: artifact.afterNotes ?? '',
      aiUsageNotes: artifact.aiUsageNotes ?? '',
      codeDiff: artifact.payload?.codeDiff ?? '',
      checked: artifact.payload?.checked ?? '',
      externalAnalysis: artifact.payload?.externalAnalysis
        ? JSON.stringify(artifact.payload.externalAnalysis, null, 2)
        : '',
      occurredAt: artifact.occurredAt.slice(0, 10),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    save.mutate();
  };

  return (
    <div className="sf-stack">
      <PageHeader
        eyebrow="Внешняя практика"
        title="Battle Evidence"
        description="Результат из проекта становится evidence только после явного подтверждения или валидированной внешней оценки."
      />
      <SectionCard>
        <div className="sf-card-title-row">
          <h2>{editing ? 'Изменить результат' : 'Добавить результат'}</h2>
          <Plus aria-hidden="true" />
        </div>
        <form className="sf-stack" onSubmit={submit}>
          <div className="sf-grid sf-grid--2">
            <label className="sf-field">
              Название *
              <input
                className="sf-input"
                required
                value={draft.title}
                onChange={(event) => update('title', event.target.value)}
              />
            </label>
            <label className="sf-field">
              Тип источника
              <select
                className="sf-select"
                value={draft.sourceType}
                onChange={(event) => update('sourceType', event.target.value)}
              >
                <option value="PROJECT">Проект</option>
                <option value="GITHUB">GitHub commit/PR</option>
                <option value="LEETCODE">LeetCode/manual</option>
                <option value="WORK">Рабочая задача</option>
              </select>
            </label>
            <label className="sf-field">
              Проект
              <input
                className="sf-input"
                value={draft.projectName}
                onChange={(event) => update('projectName', event.target.value)}
              />
            </label>
            <label className="sf-field">
              Дата
              <input
                className="sf-input"
                type="date"
                required
                value={draft.occurredAt}
                onChange={(event) => update('occurredAt', event.target.value)}
              />
            </label>
            <label className="sf-field">
              Repository URL
              <input
                className="sf-input"
                type="url"
                value={draft.repositoryUrl}
                onChange={(event) => update('repositoryUrl', event.target.value)}
              />
            </label>
            <label className="sf-field">
              Commit / PR / result URL
              <input
                className="sf-input"
                type="url"
                value={draft.resultUrl}
                onChange={(event) => update('resultUrl', event.target.value)}
              />
            </label>
          </div>
          <label className="sf-field">
            Описание задачи *
            <textarea
              className="sf-textarea"
              required
              value={draft.description}
              onChange={(event) => update('description', event.target.value)}
            />
          </label>
          <div className="sf-grid sf-grid--2">
            <label className="sf-field">
              Acceptance criteria (по одному на строку) *
              <textarea
                className="sf-textarea"
                required
                value={draft.acceptanceCriteria}
                onChange={(event) => update('acceptanceCriteria', event.target.value)}
              />
            </label>
            <label className="sf-field">
              Связанные topic keys через запятую *
              <textarea
                className="sf-textarea"
                required
                value={draft.topicKeys}
                onChange={(event) => update('topicKeys', event.target.value)}
                placeholder="js.functions.closures"
              />
            </label>
            <label className="sf-field">
              До / исходный контекст
              <textarea
                className="sf-textarea"
                value={draft.beforeNotes}
                onChange={(event) => update('beforeNotes', event.target.value)}
              />
            </label>
            <label className="sf-field">
              После / что сделал сам
              <textarea
                className="sf-textarea"
                value={draft.afterNotes}
                onChange={(event) => update('afterNotes', event.target.value)}
              />
            </label>
            <label className="sf-field">
              Где использовал AI
              <textarea
                className="sf-textarea"
                value={draft.aiUsageNotes}
                onChange={(event) => update('aiUsageNotes', event.target.value)}
              />
            </label>
            <label className="sf-field">
              Что проверил
              <textarea
                className="sf-textarea"
                value={draft.checked}
                onChange={(event) => update('checked', event.target.value)}
              />
            </label>
          </div>
          <label className="sf-field">
            Кодовый diff / фрагмент
            <textarea
              className="sf-textarea sf-code-input"
              value={draft.codeDiff}
              onChange={(event) => update('codeDiff', event.target.value)}
            />
          </label>
          <label className="sf-field">
            Внешний analysis JSON (не создаёт evidence без подтверждения)
            <textarea
              className="sf-textarea sf-code-input"
              value={draft.externalAnalysis}
              onChange={(event) => update('externalAnalysis', event.target.value)}
              placeholder='{"summary":"...","confidence":0.65}'
            />
          </label>
          {save.error ? <ErrorState error={save.error} /> : null}
          <div className="sf-actions">
            <PrimaryButton busy={save.isPending} type="submit">
              {editing ? 'Сохранить изменения' : 'Добавить evidence candidate'}
            </PrimaryButton>
            {editing ? (
              <SecondaryButton
                type="button"
                onClick={() => {
                  setEditing(null);
                  setDraft(newDraft());
                }}
              >
                Отмена
              </SecondaryButton>
            ) : null}
          </div>
        </form>
      </SectionCard>
      <section className="sf-stack">
        <h2>Сохранённые результаты</h2>
        {query.isLoading ? <LoadingState /> : null}
        {query.error ? <ErrorState error={query.error} /> : null}
        {query.data?.length === 0 ? (
          <EmptyState
            title="Внешних результатов пока нет"
            description="Добавь проверяемый результат проекта, commit/PR или ручной LeetCode-разбор."
          />
        ) : null}
        {createEvidence.error ? <ErrorState error={createEvidence.error} /> : null}
        {remove.error ? <ErrorState error={remove.error} /> : null}
        <div className="sf-grid sf-grid--2">
          {query.data?.map((artifact) => (
            <SectionCard key={artifact.id}>
              <div className="sf-card-title-row">
                <div>
                  <span className="sf-pill">{artifact.sourceType}</span>
                  <h3>{artifact.title}</h3>
                </div>
                <span>{new Date(artifact.occurredAt).toLocaleDateString('ru-RU')}</span>
              </div>
              <p>{artifact.description}</p>
              <p className="sf-muted">
                Topics: {artifact.payload?.topicKeys?.join(', ') || 'не указаны'} · evidence:{' '}
                {artifact.evidenceCount}
              </p>
              <div className="sf-actions">
                {artifact.resultUrl ? (
                  <a
                    className="sf-button sf-button--ghost"
                    href={artifact.resultUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink aria-hidden="true" size={16} /> Результат
                  </a>
                ) : null}
                <SecondaryButton onClick={() => edit(artifact)}>Изменить</SecondaryButton>
                <ConfirmDialog
                  trigger={
                    <SecondaryButton>
                      <ShieldCheck aria-hidden="true" size={16} /> Создать evidence
                    </SecondaryButton>
                  }
                  title="Подтвердить внешний результат"
                  description="Будут созданы BATTLE/TRANSFER evidence по связанным темам. Это действие не выставляет mastery напрямую."
                  confirmLabel="Подтверждаю"
                  onConfirm={() => createEvidence.mutate(artifact.id)}
                />
                <ConfirmDialog
                  destructive
                  trigger={
                    <SecondaryButton>
                      <Trash2 aria-hidden="true" size={16} /> Удалить
                    </SecondaryButton>
                  }
                  title="Удалить результат?"
                  description="Удаление запрещено, если из результата уже создано evidence."
                  confirmLabel="Удалить"
                  onConfirm={() => remove.mutate(artifact.id)}
                />
              </div>
            </SectionCard>
          ))}
        </div>
      </section>
    </div>
  );
}
