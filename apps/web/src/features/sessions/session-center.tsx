'use client';

import {
  PageHeader,
  PrimaryButton,
  SectionCard,
  SecondaryButton,
  StatusBadge,
} from '@skillforge/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight, BookOpen, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ErrorState, LoadingState } from '@/components/data-state';
import { apiFetch, apiMutation } from '@/shared/api/client';
import type { LearningSession, SessionSummary, TopicSummary } from '@/shared/api/types';

type Recommendation = {
  topic: TopicSummary | null;
  mode: string;
  loadMode: string;
  reason: string;
};

type SessionMode = 'TRAINING' | 'REVIEW' | 'INTERVIEW' | 'RETURN' | 'BATTLE';
type LoadMode = 'MINIMAL' | 'NORMAL' | 'DEEP' | 'RETURN';
type CodeLanguage = 'javascript' | 'typescript';

type SessionPlan = {
  mode: SessionMode;
  loadMode: LoadMode;
  topicKeys: string[];
  documentationAllowed: boolean;
  codeLanguage: CodeLanguage;
  returnFromSessionId?: string;
};

type ProfileSettings = {
  settings: {
    defaultLoadMode: LoadMode;
    codeLanguage: CodeLanguage;
  };
};

const sessionModes = [
  { value: 'TRAINING', label: 'Training', description: 'Retrieval, пример и применение' },
  { value: 'REVIEW', label: 'Review', description: 'Короткая delayed-проверка' },
  { value: 'INTERVIEW', label: 'Interview', description: 'Ответ и follow-up без подсказок' },
  { value: 'RETURN', label: 'Return', description: 'Восстановление контекста за 15–20 минут' },
  { value: 'BATTLE', label: 'Battle', description: 'Оформить внешнее доказательство' },
] as const;

const loadModes = [
  { value: 'MINIMAL', label: 'Минимальный', minutes: '20–30 мин' },
  { value: 'NORMAL', label: 'Обычный', minutes: '45–60 мин' },
  { value: 'DEEP', label: 'Глубокий', minutes: '75–100 мин' },
  { value: 'RETURN', label: 'Возврат', minutes: '15–20 мин' },
] as const;

export function SessionCenter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedTopic = searchParams.get('topic');
  const returnFromSessionId = searchParams.get('return');
  const [mode, setMode] = useState<SessionMode>(returnFromSessionId ? 'RETURN' : 'TRAINING');
  const [loadMode, setLoadMode] = useState<LoadMode | null>(null);
  const [topicKeys, setTopicKeys] = useState<string[]>(
    !returnFromSessionId && requestedTopic ? [requestedTopic] : [],
  );
  const [documentationAllowed, setDocumentationAllowed] = useState(true);
  const [codeLanguage, setCodeLanguage] = useState<CodeLanguage | null>(null);
  const profileQuery = useQuery({
    queryKey: ['profile'],
    queryFn: () => apiFetch<ProfileSettings>('/api/v1/profile'),
  });
  const configuredLoadMode = loadMode ?? profileQuery.data?.settings.defaultLoadMode ?? 'NORMAL';
  const configuredCodeLanguage =
    codeLanguage ?? profileQuery.data?.settings.codeLanguage ?? 'javascript';
  const effectiveMode: SessionMode = returnFromSessionId ? 'RETURN' : mode;
  const effectiveLoadMode: LoadMode = returnFromSessionId ? 'RETURN' : configuredLoadMode;
  const topicsQuery = useQuery({
    queryKey: ['topics'],
    queryFn: () => apiFetch<TopicSummary[]>('/api/v1/topics'),
    enabled: !returnFromSessionId,
  });
  const historyQuery = useQuery({
    queryKey: ['sessions'],
    queryFn: () => apiFetch<SessionSummary[]>('/api/v1/sessions'),
  });
  const recommendationQuery = useQuery({
    queryKey: ['session-recommendation'],
    queryFn: () => apiFetch<Recommendation>('/api/v1/sessions/recommendation'),
    enabled: !returnFromSessionId,
  });
  const createMutation = useMutation({
    mutationFn: async () => {
      const plan: SessionPlan = {
        mode: effectiveMode,
        loadMode: effectiveLoadMode,
        topicKeys: returnFromSessionId
          ? []
          : topicKeys.length > 0
            ? topicKeys
            : recommendationQuery.data?.topic
              ? [recommendationQuery.data.topic.key]
              : [],
        documentationAllowed,
        codeLanguage: configuredCodeLanguage,
        ...(returnFromSessionId ? { returnFromSessionId } : {}),
      };
      const preview = await apiMutation<SessionPlan>('/api/v1/sessions/plan', 'POST', plan);
      const session = await apiMutation<LearningSession, SessionPlan>(
        '/api/v1/sessions',
        'POST',
        preview,
      );
      await apiMutation(`/api/v1/sessions/${session.id}/start`, 'POST');
      return session;
    },
    onSuccess: (session) => router.push(`/sessions/${session.id}`),
  });

  const sortedTopics = useMemo(
    () =>
      [...(topicsQuery.data ?? [])].sort(
        (left, right) =>
          right.targetRelevance - left.targetRelevance ||
          left.title.localeCompare(right.title, 'ru'),
      ),
    [topicsQuery.data],
  );
  const toggleTopic = (key: string) => {
    setTopicKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : current.length < 3
          ? [...current, key]
          : current,
    );
  };

  return (
    <div className="sf-stack">
      <PageHeader
        eyebrow="Практика"
        title="Learning Session"
        description="Сессия собирается из versioned items и сохраняет ответы, уровень помощи, confidence и нагрузку."
        actions={
          <Link className="sf-button sf-button--secondary" href="/assessment">
            Assessment
          </Link>
        }
      />
      {recommendationQuery.data?.topic ? (
        <SectionCard className="sf-recommendation-strip">
          <div>
            <p className="sf-eyebrow">Рекомендация</p>
            <h2>{recommendationQuery.data.topic.title}</h2>
            <p>{recommendationQuery.data.reason}</p>
          </div>
          <SecondaryButton
            type="button"
            onClick={() => setTopicKeys([recommendationQuery.data.topic?.key ?? ''])}
          >
            Выбрать
          </SecondaryButton>
        </SectionCard>
      ) : null}
      <SectionCard>
        <h2>1. Режим сессии</h2>
        <div className="sf-option-grid">
          {sessionModes.map((item) => (
            <button
              key={item.value}
              type="button"
              data-selected={effectiveMode === item.value}
              aria-pressed={effectiveMode === item.value}
              disabled={Boolean(returnFromSessionId)}
              onClick={() => setMode(item.value)}
            >
              <strong>{item.label}</strong>
              <span>{item.description}</span>
            </button>
          ))}
        </div>
      </SectionCard>
      <SectionCard>
        <h2>2. Нагрузка</h2>
        <div className="sf-option-grid sf-option-grid--4">
          {loadModes.map((item) => (
            <button
              key={item.value}
              type="button"
              data-selected={effectiveLoadMode === item.value}
              aria-pressed={effectiveLoadMode === item.value}
              disabled={Boolean(returnFromSessionId)}
              onClick={() => setLoadMode(item.value)}
            >
              <strong>{item.label}</strong>
              <span>{item.minutes}</span>
            </button>
          ))}
        </div>
      </SectionCard>
      <SectionCard>
        <div className="sf-card-title-row">
          <h2>3. Темы</h2>
          <span className="sf-muted">
            {returnFromSessionId ? 'из исходной сессии' : `до 3 · выбрано ${topicKeys.length}`}
          </span>
        </div>
        {returnFromSessionId ? (
          <p className="sf-muted">
            Контекст и темы будут восстановлены из выбранной сохранённой сессии.
          </p>
        ) : (
          <>
            {topicsQuery.isLoading ? <LoadingState /> : null}
            {topicsQuery.error ? <ErrorState error={topicsQuery.error} /> : null}
            <div className="sf-topic-picker">
              {sortedTopics.map((topic) => (
                <button
                  key={topic.key}
                  type="button"
                  data-selected={topicKeys.includes(topic.key)}
                  aria-pressed={topicKeys.includes(topic.key)}
                  onClick={() => toggleTopic(topic.key)}
                >
                  <StatusBadge status={topic.status} />
                  <span>{topic.title}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </SectionCard>
      <SectionCard>
        <h2>4. Условия</h2>
        <div className="sf-grid sf-grid--2">
          <label className="sf-field">
            Документация
            <select
              className="sf-select"
              value={documentationAllowed ? 'yes' : 'no'}
              onChange={(event) => setDocumentationAllowed(event.target.value === 'yes')}
            >
              <option value="yes">Разрешена</option>
              <option value="no">Без документации</option>
            </select>
          </label>
          <label className="sf-field">
            Язык кода
            <select
              className="sf-select"
              value={configuredCodeLanguage}
              onChange={(event) => setCodeLanguage(event.target.value as CodeLanguage)}
            >
              <option value="javascript">JavaScript</option>
              <option value="typescript">TypeScript</option>
            </select>
          </label>
        </div>
      </SectionCard>
      {createMutation.error ? <ErrorState error={createMutation.error} /> : null}
      {profileQuery.error ? <ErrorState error={profileQuery.error} /> : null}
      <PrimaryButton
        busy={createMutation.isPending}
        onClick={() => {
          if (effectiveMode === 'BATTLE') {
            router.push(
              `/battle${topicKeys[0] ? `?topic=${encodeURIComponent(topicKeys[0])}` : ''}`,
            );
          } else {
            createMutation.mutate();
          }
        }}
        disabled={
          profileQuery.isLoading ||
          profileQuery.error !== null ||
          (!returnFromSessionId && topicKeys.length === 0 && !recommendationQuery.data?.topic)
        }
      >
        <BookOpen aria-hidden="true" size={17} />
        {effectiveMode === 'BATTLE' ? 'Оформить внешний результат' : 'Собрать и начать сессию'}
        <ArrowRight aria-hidden="true" size={17} />
      </PrimaryButton>
      <SectionCard>
        <div className="sf-card-title-row">
          <h2>История</h2>
          <RotateCcw aria-hidden="true" size={18} />
        </div>
        {historyQuery.isLoading ? <LoadingState /> : null}
        {historyQuery.error ? <ErrorState error={historyQuery.error} /> : null}
        {historyQuery.data?.length === 0 ? (
          <p className="sf-muted">Учебных сессий ещё нет.</p>
        ) : null}
        <ul className="sf-list">
          {historyQuery.data?.map((session) => (
            <li key={session.id} className="sf-list-row">
              <span>
                <strong>{session.title}</strong>
                <br />
                <small>
                  {session.mode} · {session.loadMode} · {session.itemCount} items
                </small>
              </span>
              <Link className="sf-link" href={`/sessions/${session.id}`}>
                {session.status === 'COMPLETED' ? 'Итоги' : 'Продолжить'} →
              </Link>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}
