'use client';

import {
  EvidenceBadge,
  InsufficientData,
  PageHeader,
  SectionCard,
  SkillForgeProgress,
  StatusBadge,
} from '@skillforge/ui';
import { useQuery } from '@tanstack/react-query';
import { Download, ExternalLink, Play } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState, type KeyboardEvent } from 'react';
import { ErrorState, LoadingState } from '@/components/data-state';
import { apiFetch } from '@/shared/api/client';
import type { TopicSummary } from '@/shared/api/types';
import { TopicCapabilityMatrix } from './topic-capability-matrix';

type TopicDetailData = TopicSummary & {
  whyImportant: string;
  atWork: string;
  atInterview: string;
  explanation: {
    algorithmVersion: string;
    summary: string;
    factors: {
      totalReliableWeight: number;
      independentDays: number;
      taskKindCount: number;
      evidenceKindCount: number;
      hasDelayedEvidence: boolean;
      hasNoHelpSuccess: boolean;
      hasTransferEvidence: boolean;
      recentFailureCount: number;
    };
    statusGates: Array<{
      code: string;
      met: boolean;
      actual: boolean | number | string;
      required: boolean | number | string;
    }>;
  } | null;
  misconceptions: Array<{
    key: string;
    title: string;
    count: number;
    remediation: string;
  }>;
  evidenceByKind: Record<string, number>;
  lastEvidenceAt: string | null;
  content: Array<{ id: string; kind: string; title: string; bodyMarkdown: string | null }>;
  tasks: Array<{ stableKey: string; kind: string; difficulty: string; versions: number }>;
  evidence: Array<{
    id: string;
    kind: string;
    normalizedScore: number;
    weight: number;
    occurredAt: string;
    provenance: { evaluator?: string; attemptId?: string; externalArtifactId?: string };
  }>;
};

const tabs = [
  'Обзор',
  'Теория',
  'Задачи',
  'История',
  'Ошибки',
  'Критерии mastery',
  'Зависимости',
] as const;
type Tab = (typeof tabs)[number];

const gateLabels: Record<string, string> = {
  'minimum-reliable-weight': 'Достаточный надёжный вес evidence',
  'submitted-attempt': 'Есть завершённая попытка',
  'solid-estimate': 'Estimate для SOLID',
  'solid-confidence': 'Confidence для SOLID',
  'mastered-estimate': 'Estimate для MASTERED',
  'mastered-confidence': 'Confidence для MASTERED',
  'delayed-evidence': 'Есть отложенная проверка',
  'transfer-evidence': 'Есть transfer / battle / interview evidence',
  'last-evidence-not-failed': 'Последнее evidence не является провалом',
};

function formatGateValue(value: boolean | number | string): string {
  if (typeof value === 'boolean') return value ? 'да' : 'нет';
  return String(value);
}

export function TopicDetail({ topicKey }: { topicKey: string }) {
  const [tab, setTab] = useState<Tab>('Обзор');
  const tabButtons = useRef<Array<HTMLButtonElement | null>>([]);
  const query = useQuery({
    queryKey: ['topic', topicKey],
    queryFn: () => apiFetch<TopicDetailData>(`/api/v1/topics/${encodeURIComponent(topicKey)}`),
  });

  if (query.isLoading) return <LoadingState count={4} />;
  if (query.error) return <ErrorState error={query.error} retry={() => void query.refetch()} />;
  if (!query.data) return null;
  const topic = query.data;
  const evidenceKinds = Object.entries(topic.evidenceByKind).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const activeTabIndex = tabs.indexOf(tab);
  const selectTabByKeyboard = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = tabs[nextIndex];
    if (nextTab) setTab(nextTab);
    tabButtons.current[nextIndex]?.focus();
  };

  return (
    <div className="sf-stack">
      <PageHeader
        eyebrow={`${topic.trackTitle} · ${topic.key}`}
        title={topic.title}
        description={topic.shortDescription}
        actions={
          <>
            <Link
              className="sf-button sf-button--secondary"
              href={`/assessment?topic=${topic.key}`}
            >
              Диагностика
            </Link>
            <Link className="sf-button sf-button--primary" href={`/sessions?topic=${topic.key}`}>
              <Play aria-hidden="true" size={16} /> Тренировка
            </Link>
            <Link className="sf-button sf-button--ghost" href={`/battle?topic=${topic.key}`}>
              <ExternalLink aria-hidden="true" size={16} /> Внешний результат
            </Link>
            <Link
              className="sf-button sf-button--ghost"
              href={`/import-export?mode=export&topic=${topic.key}`}
            >
              <Download aria-hidden="true" size={16} /> Экспорт
            </Link>
          </>
        }
      />
      <div className="sf-grid sf-grid--4">
        <SectionCard>
          <div className="sf-card-title-row">
            <h2>Состояние</h2>
            <StatusBadge status={topic.status} />
          </div>
          {topic.masteryEstimate === null ? (
            <InsufficientData>
              Есть {topic.evidenceCount} evidence — этого пока мало для устойчивого вывода.
            </InsufficientData>
          ) : (
            <SkillForgeProgress value={topic.masteryEstimate} label="Mastery estimate" />
          )}
        </SectionCard>
        <SectionCard>
          <h2>Надёжность оценки</h2>
          <strong className="sf-large-value">
            {topic.masteryEstimate === null
              ? 'Не откалибровано'
              : `${Math.round(topic.masteryConfidence)}%`}
          </strong>
          <p className="sf-muted">
            {topic.evidenceCount} evidence · {Object.keys(topic.evidenceByKind).length} типов
          </p>
          <p className="sf-muted">
            Последнее:{' '}
            {topic.lastEvidenceAt
              ? new Date(topic.lastEvidenceAt).toLocaleString('ru-RU')
              : 'ещё не было'}
          </p>
        </SectionCard>
        <SectionCard>
          <h2>Evidence по типам</h2>
          {evidenceKinds.length > 0 ? (
            <ul className="sf-list">
              {evidenceKinds.map(([kind, count]) => (
                <li className="sf-list-row" key={kind}>
                  <span>{kind}</span>
                  <strong>{count}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <InsufficientData title="Evidence пока нет" />
          )}
        </SectionCard>
        <SectionCard>
          <h2>Повторение</h2>
          <strong>
            {topic.needsReview
              ? 'Готово к повторению'
              : topic.nextReviewAt
                ? new Date(topic.nextReviewAt).toLocaleDateString('ru-RU')
                : '—'}
          </strong>
          <p className="sf-muted">Время само по себе не понижает mastery.</p>
        </SectionCard>
      </div>
      <TopicCapabilityMatrix topicKey={topicKey} />
      <div className="sf-tabs" role="tablist" aria-label="Разделы темы">
        {tabs.map((item, index) => (
          <button
            key={item}
            ref={(element) => {
              tabButtons.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`topic-tab-${String(index)}`}
            aria-controls="topic-tabpanel"
            aria-selected={tab === item}
            tabIndex={tab === item ? 0 : -1}
            onClick={() => setTab(item)}
            onKeyDown={(event) => selectTabByKeyboard(event, index)}
          >
            {item}
          </button>
        ))}
      </div>
      <SectionCard
        role="tabpanel"
        id="topic-tabpanel"
        aria-labelledby={`topic-tab-${String(activeTabIndex)}`}
      >
        {tab === 'Обзор' ? (
          <div className="sf-grid sf-grid--3">
            <div>
              <h3>Почему важно</h3>
              <p>{topic.whyImportant}</p>
            </div>
            <div>
              <h3>В работе</h3>
              <p>{topic.atWork}</p>
            </div>
            <div>
              <h3>На интервью</h3>
              <p>{topic.atInterview}</p>
            </div>
            <div>
              <h3>Target relevance</h3>
              <p>{topic.targetRelevance > 0 ? `${topic.targetRelevance} из 5` : 'Не задана'}</p>
            </div>
            {topic.explanation ? (
              <div>
                <h3>Почему такой статус</h3>
                <p>{topic.explanation.summary}</p>
                <small className="sf-muted">{topic.explanation.algorithmVersion}</small>
              </div>
            ) : null}
          </div>
        ) : null}
        {tab === 'Теория' ? (
          topic.content.length > 0 ? (
            <ul className="sf-list">
              {topic.content.map((item) => (
                <li key={item.id}>
                  <h3>{item.title}</h3>
                  <p className="sf-muted">{item.bodyMarkdown}</p>
                </li>
              ))}
            </ul>
          ) : (
            <InsufficientData title="Материалов пока нет" />
          )
        ) : null}
        {tab === 'Задачи' ? (
          <ul className="sf-list">
            {topic.tasks.map((task) => (
              <li className="sf-list-row" key={task.stableKey}>
                <span>
                  <strong>{task.stableKey}</strong>
                  <br />
                  <small>
                    {task.kind} · {task.difficulty}
                  </small>
                </span>
                <EvidenceBadge>v{task.versions}</EvidenceBadge>
              </li>
            ))}
          </ul>
        ) : null}
        {tab === 'История' ? (
          topic.evidence.length > 0 ? (
            <ol className="sf-list">
              {topic.evidence.map((item) => (
                <li className="sf-list-row" key={item.id}>
                  <span>
                    <strong>{item.kind}</strong>
                    <br />
                    <small>{new Date(item.occurredAt).toLocaleString('ru-RU')}</small>
                  </span>
                  <span>
                    {Math.round(item.normalizedScore)} · вес {item.weight.toFixed(2)}
                    {item.provenance.evaluator ? ` · ${item.provenance.evaluator}` : ''}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <InsufficientData />
          )
        ) : null}
        {tab === 'Ошибки' ? (
          topic.misconceptions.length > 0 ? (
            <ul className="sf-list">
              {topic.misconceptions.map((misconception) => (
                <li key={misconception.key}>
                  <div className="sf-card-title-row">
                    <h3>{misconception.title}</h3>
                    <EvidenceBadge>{misconception.count} evidence</EvidenceBadge>
                  </div>
                  <p>{misconception.remediation}</p>
                </li>
              ))}
            </ul>
          ) : (
            <InsufficientData title="Повторяющиеся ошибки пока не найдены">
              Они появятся только после нескольких совпадающих evidence.
            </InsufficientData>
          )
        ) : null}
        {tab === 'Критерии mastery' ? (
          <div className="sf-stack sf-stack--compact">
            <ul>
              <li>SOLID: ≥70, confidence ≥55, два дня и два типа задач.</li>
              <li>MASTERED: ≥85, confidence ≥75, delayed retrieval и transfer/battle/interview.</li>
              <li>Одна успешная попытка не может дать mastered.</li>
            </ul>
            {topic.explanation ? (
              <>
                <h3>Фактические gates</h3>
                <ul className="sf-list">
                  {topic.explanation.statusGates.map((gate) => (
                    <li className="sf-list-row" key={gate.code}>
                      <span>{gateLabels[gate.code] ?? gate.code}</span>
                      <span>
                        {gate.met ? 'Выполнено' : 'Не выполнено'} · {formatGateValue(gate.actual)} /{' '}
                        {formatGateValue(gate.required)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <InsufficientData title="Gates ещё не рассчитаны" />
            )}
          </div>
        ) : null}
        {tab === 'Зависимости' ? (
          topic.prerequisites.length ? (
            <ul>
              {topic.prerequisites.map((item) => (
                <li key={item.key}>
                  <Link className="sf-link" href={`/topics/${item.key}`}>
                    {item.title}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sf-muted">У темы нет обязательных prerequisite.</p>
          )
        ) : null}
      </SectionCard>
    </div>
  );
}
