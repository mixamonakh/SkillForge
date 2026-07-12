'use client';

import {
  ConfirmDialog,
  PageHeader,
  PrimaryButton,
  SectionCard,
  SecondaryButton,
} from '@skillforge/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DatabaseBackup, Save, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ErrorState, LoadingState } from '@/components/data-state';
import { apiFetch, apiMutation } from '@/shared/api/client';

type SettingsData = {
  user: { displayName: string; locale: string };
  settings: {
    targetTrackKey: string;
    defaultLoadMode: string;
    codeLanguage: string;
    aiMode: string;
    apiMonthlyBudgetUsd: number;
    resumeThresholdDays: number;
    theme: string;
    reducedMotion: boolean;
  };
  app: { version: string; contentPack: string; environment: string };
};

type ResetPreview = { confirmationPhrase: string; counts: Record<string, number>; warning: string };

export function SettingsPageContent() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['profile'],
    queryFn: () => apiFetch<SettingsData>('/api/v1/profile'),
  });
  const [settings, setSettings] = useState<SettingsData['settings'] | null>(null);
  const [resetPreview, setResetPreview] = useState<ResetPreview | null>(null);
  const [confirmation, setConfirmation] = useState('');
  useEffect(() => {
    if (query.data) setSettings(query.data.settings);
  }, [query.data]);
  const save = useMutation({
    mutationFn: () => apiMutation<SettingsData>('/api/v1/profile/settings', 'PATCH', settings),
    onSuccess: async () => {
      toast.success('Настройки сохранены');
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
  const previewReset = useMutation({
    mutationFn: () => apiMutation<ResetPreview>('/api/v1/profile/reset-preview', 'POST'),
    onSuccess: setResetPreview,
  });
  const confirmReset = useMutation({
    mutationFn: () =>
      apiMutation('/api/v1/profile/reset-confirm', 'POST', { confirmation: confirmation }),
    onSuccess: () => {
      toast.success('Профиль сброшен; content сохранён');
      window.location.assign('/');
    },
  });

  if (query.error) return <ErrorState error={query.error} retry={() => void query.refetch()} />;
  if (query.isLoading || !query.data || !settings) return <LoadingState />;
  const profile = query.data;
  const update = <K extends keyof SettingsData['settings']>(
    key: K,
    value: SettingsData['settings'][K],
  ) => setSettings((current) => (current ? { ...current, [key]: value } : current));

  return (
    <div className="sf-stack">
      <PageHeader
        eyebrow="Local-first"
        title="Settings"
        description={`Профиль: ${profile.user.displayName} · SkillForge ${profile.app.version}`}
      />
      <div className="sf-grid sf-grid--2 sf-align-start">
        <SectionCard>
          <h2>Обучение</h2>
          <label className="sf-field">
            Target track
            <input
              className="sf-input"
              value={settings.targetTrackKey}
              onChange={(event) => update('targetTrackKey', event.target.value)}
            />
          </label>
          <label className="sf-field">
            Нагрузка по умолчанию
            <select
              className="sf-select"
              value={settings.defaultLoadMode}
              onChange={(event) => update('defaultLoadMode', event.target.value)}
            >
              <option value="MINIMAL">Минимальный</option>
              <option value="NORMAL">Обычный</option>
              <option value="DEEP">Глубокий</option>
              <option value="RETURN">Возврат</option>
            </select>
          </label>
          <label className="sf-field">
            Язык кода
            <select
              className="sf-select"
              value={settings.codeLanguage}
              onChange={(event) => update('codeLanguage', event.target.value)}
            >
              <option value="javascript">JavaScript</option>
              <option value="typescript">TypeScript</option>
            </select>
          </label>
          <label className="sf-field">
            Порог resume, дней
            <input
              className="sf-input"
              type="number"
              min="1"
              max="90"
              value={settings.resumeThresholdDays}
              onChange={(event) => update('resumeThresholdDays', Number(event.target.value))}
            />
          </label>
        </SectionCard>
        <SectionCard>
          <h2>AI mode</h2>
          <label className="sf-field">
            Режим
            <select
              className="sf-select"
              value={settings.aiMode}
              onChange={(event) => update('aiMode', event.target.value)}
            >
              <option value="manual">Manual — без API key</option>
              <option value="hybrid" disabled>
                Hybrid — future
              </option>
              <option value="api-assisted" disabled>
                API-assisted — future
              </option>
            </select>
          </label>
          <label className="sf-field">
            API budget, USD
            <input
              className="sf-input"
              type="number"
              disabled
              value={settings.apiMonthlyBudgetUsd}
              readOnly
            />
          </label>
          <p className="sf-callout">
            Manual mode полностью функционален: экспортируй prompt bundle во внешний ChatGPT и
            импортируй strict JSON. Встроенного AI-чата нет.
          </p>
        </SectionCard>
        <SectionCard>
          <h2>Интерфейс</h2>
          <label className="sf-field">
            Тема
            <select
              className="sf-select"
              value={settings.theme}
              onChange={(event) => update('theme', event.target.value)}
            >
              <option value="light">Светлая</option>
              <option value="dark" disabled>
                Тёмная — future
              </option>
            </select>
          </label>
          <label className="sf-choice">
            <input
              type="checkbox"
              checked={settings.reducedMotion}
              onChange={(event) => update('reducedMotion', event.target.checked)}
            />
            Уменьшить движение
          </label>
        </SectionCard>
        <SectionCard>
          <h2>Данные</h2>
          <p>
            PostgreSQL volume хранит ответы после restart. Перед destructive reset сделай backup.
          </p>
          <div className="sf-actions">
            <Link
              className="sf-button sf-button--secondary"
              href="/import-export?mode=export&scope=profile"
            >
              <DatabaseBackup aria-hidden="true" size={16} /> Экспорт данных
            </Link>
            <SecondaryButton onClick={() => previewReset.mutate()} busy={previewReset.isPending}>
              <ShieldAlert aria-hidden="true" size={16} /> Предпросмотр reset
            </SecondaryButton>
          </div>
        </SectionCard>
      </div>
      {save.error ? <ErrorState error={save.error} /> : null}
      <PrimaryButton busy={save.isPending} onClick={() => save.mutate()}>
        <Save aria-hidden="true" size={17} /> Сохранить настройки
      </PrimaryButton>
      {resetPreview ? (
        <SectionCard className="sf-danger-zone">
          <h2>Database reset</h2>
          <p>{resetPreview.warning}</p>
          <ul>
            {Object.entries(resetPreview.counts).map(([entity, count]) => (
              <li key={entity}>
                {entity}: {count}
              </li>
            ))}
          </ul>
          <label className="sf-field">
            Введи «{resetPreview.confirmationPhrase}»
            <input
              className="sf-input"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </label>
          {confirmReset.error ? <ErrorState error={confirmReset.error} /> : null}
          <ConfirmDialog
            destructive
            trigger={
              <PrimaryButton disabled={confirmation !== resetPreview.confirmationPhrase}>
                Сбросить пользовательские данные
              </PrimaryButton>
            }
            title="Это удалит ответы и evidence"
            description="Content pack и migrations останутся. Операция необратима без backup."
            confirmLabel="Сбросить"
            onConfirm={() => confirmReset.mutate()}
          />
        </SectionCard>
      ) : null}
    </div>
  );
}
