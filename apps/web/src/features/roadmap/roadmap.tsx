'use client';

import { EmptyState, PageHeader, StatusBadge, TopicCard } from '@skillforge/ui';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Search } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ErrorState, LoadingState } from '@/components/data-state';
import { apiFetch } from '@/shared/api/client';
import type { TopicSummary } from '@/shared/api/types';

type RoadmapFilter =
  | 'ALL'
  | 'UNKNOWN'
  | 'WEAK'
  | 'UNSTABLE'
  | 'TARGET'
  | 'REVIEW'
  | 'SOLID'
  | 'MASTERED';

const filters: Array<{ value: RoadmapFilter; label: string }> = [
  { value: 'ALL', label: 'Все' },
  { value: 'UNKNOWN', label: 'Нет данных' },
  { value: 'WEAK', label: 'Слабые' },
  { value: 'UNSTABLE', label: 'Нестабильные' },
  { value: 'TARGET', label: 'Для Яндекса' },
  { value: 'REVIEW', label: 'Готовы к повторению' },
  { value: 'SOLID', label: 'Уверенные' },
  { value: 'MASTERED', label: 'Освоенные' },
];

function matches(topic: TopicSummary, filter: RoadmapFilter): boolean {
  if (filter === 'ALL') return true;
  if (filter === 'TARGET') return topic.targetRelevance > 0;
  if (filter === 'REVIEW') return topic.needsReview;
  return topic.status === filter;
}

export function Roadmap() {
  const [filter, setFilter] = useState<RoadmapFilter>('ALL');
  const [search, setSearch] = useState('');
  const query = useQuery({
    queryKey: ['topics'],
    queryFn: () => apiFetch<TopicSummary[]>('/api/v1/topics'),
  });

  const grouped = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase('ru');
    const visible = (query.data ?? []).filter(
      (topic) =>
        matches(topic, filter) &&
        (normalized.length === 0 ||
          topic.title.toLocaleLowerCase('ru').includes(normalized) ||
          topic.key.includes(normalized)),
    );
    const groups = new Map<string, TopicSummary[]>();
    for (const topic of visible) {
      const current = groups.get(topic.trackTitle) ?? [];
      current.push(topic);
      groups.set(topic.trackTitle, current);
    }
    return groups;
  }, [filter, query.data, search]);
  const trackStats = useMemo(() => {
    const stats = new Map<string, { assessed: number; total: number; mastery: number | null }>();
    const byTrack = new Map<string, TopicSummary[]>();
    for (const topic of query.data ?? []) {
      const current = byTrack.get(topic.trackTitle) ?? [];
      current.push(topic);
      byTrack.set(topic.trackTitle, current);
    }
    for (const [trackTitle, topics] of byTrack) {
      const assessed = topics.filter((topic) => topic.masteryEstimate !== null);
      stats.set(trackTitle, {
        assessed: assessed.length,
        total: topics.length,
        mastery:
          assessed.length === 0
            ? null
            : assessed.reduce((sum, topic) => sum + (topic.masteryEstimate ?? 0), 0) /
              assessed.length,
      });
    }
    return stats;
  }, [query.data]);

  return (
    <div className="sf-stack">
      <PageHeader
        eyebrow="Карта компетенций"
        title="Roadmap"
        description="Coverage и mastery разделены: неизвестная тема не считается нулём и не получает придуманный процент."
      />
      <div className="sf-filter-bar" role="group" aria-label="Фильтры тем">
        <label className="sf-search-field">
          <Search aria-hidden="true" size={17} />
          <span className="sf-sr-only">Поиск по темам</span>
          <input
            className="sf-input"
            type="search"
            placeholder="Название или key"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        {filters.map((item) => (
          <button
            key={item.value}
            type="button"
            className="sf-filter-chip"
            data-active={filter === item.value}
            aria-pressed={filter === item.value}
            onClick={() => setFilter(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {query.isLoading ? <LoadingState count={6} /> : null}
      {query.error ? <ErrorState error={query.error} retry={() => void query.refetch()} /> : null}
      {!query.isLoading && !query.error && grouped.size === 0 ? (
        <EmptyState
          title="Темы не найдены"
          description="Измени поисковый запрос или выбранный фильтр."
        />
      ) : null}
      {Array.from(grouped, ([trackTitle, topics]) => (
        <section className="sf-stack" key={trackTitle}>
          <div className="sf-track-heading">
            <h2>{trackTitle}</h2>
            <span>
              {trackStats.get(trackTitle)?.assessed ?? 0} из{' '}
              {trackStats.get(trackTitle)?.total ?? topics.length} оценено
              {trackStats.get(trackTitle)?.mastery === null ||
              trackStats.get(trackTitle)?.mastery === undefined
                ? ' · mastery —'
                : ` · mastery ${Math.round(trackStats.get(trackTitle)?.mastery ?? 0)}%`}
            </span>
          </div>
          <div className="sf-grid sf-grid--3">
            {topics.map((topic) => (
              <TopicCard key={topic.key} className="sf-topic-card">
                <div className="sf-card-title-row">
                  <StatusBadge status={topic.status} />
                  {topic.needsReview ? <span className="sf-pill">Готово к повторению</span> : null}
                </div>
                <h3>{topic.title}</h3>
                <p className="sf-muted">{topic.shortDescription}</p>
                <dl className="sf-topic-signals">
                  <div>
                    <dt>Evidence</dt>
                    <dd>{topic.evidenceCount || '—'}</dd>
                  </div>
                  <div>
                    <dt>Mastery</dt>
                    <dd>
                      {topic.masteryEstimate === null
                        ? '—'
                        : `${Math.round(topic.masteryEstimate)}%`}
                    </dd>
                  </div>
                  <div>
                    <dt>Цель</dt>
                    <dd>{topic.targetRelevance > 0 ? `${topic.targetRelevance}/5` : '—'}</dd>
                  </div>
                </dl>
                {topic.prerequisites.length > 0 ? (
                  <p className="sf-prerequisite">
                    Зависит от: {topic.prerequisites.map((item) => item.title).join(', ')}
                  </p>
                ) : null}
                <Link className="sf-link sf-topic-link" href={`/topics/${topic.key}`}>
                  Открыть тему <ArrowRight aria-hidden="true" size={16} />
                </Link>
              </TopicCard>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
