'use client';

import { EmptyState, PageHeader, SectionCard } from '@skillforge/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import { CheckCircle2, FileCode2 } from 'lucide-react';
import { useState } from 'react';
import { ErrorState, LoadingState } from '@/components/data-state';
import { apiFetch } from '@/shared/api/client';

type LibraryItem = {
  id: string;
  stableKey: string;
  version: number;
  kind: string;
  title: string;
  topicKey: string;
  topicTitle: string;
  sourcePack: string;
  sourceVersion: string;
  checksum: string;
  status: string;
  bodyPreview: string | null;
};

type LibraryData = {
  items: LibraryItem[];
  counts: {
    topics: number;
    tasks: number;
    taskVersions: number;
    theory: number;
    blueprints: number;
  };
  sourcePacks: Array<{ key: string; version: string; validationStatus: string }>;
  nextCursor: string | null;
};

export function ContentLibrary() {
  const [kind, setKind] = useState('');
  const [topicKey, setTopicKey] = useState('');
  const query = useInfiniteQuery({
    queryKey: ['content', kind, topicKey],
    initialPageParam: '',
    queryFn: ({ pageParam }) =>
      apiFetch<LibraryData>(
        `/api/v1/content?kind=${encodeURIComponent(kind)}&topicKey=${encodeURIComponent(topicKey)}&cursor=${encodeURIComponent(pageParam)}`,
      ),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  const firstPage = query.data?.pages[0];
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <div className="sf-stack">
      <PageHeader
        eyebrow="Read-only"
        title="Content Library"
        description="Курируемый контент импортируется из versioned pack в Git. Used TaskVersion не редактируются через UI."
      />
      {firstPage ? (
        <div className="sf-grid sf-grid--4">
          {Object.entries(firstPage.counts).map(([label, value]) => (
            <SectionCard key={label}>
              <span className="sf-muted">{label}</span>
              <strong className="sf-large-value">{value}</strong>
            </SectionCard>
          ))}
        </div>
      ) : null}
      <SectionCard>
        <div className="sf-card-title-row">
          <h2>Source packs</h2>
          <CheckCircle2 aria-hidden="true" size={18} />
        </div>
        <ul className="sf-list">
          {firstPage?.sourcePacks.map((pack) => (
            <li className="sf-list-row" key={`${pack.key}:${pack.version}`}>
              <span>
                <strong>{pack.key}</strong> · {pack.version}
              </span>
              <span className="sf-pill">{pack.validationStatus}</span>
            </li>
          ))}
        </ul>
      </SectionCard>
      <div className="sf-filter-bar">
        <label className="sf-field">
          Тип
          <select
            className="sf-select"
            value={kind}
            onChange={(event) => setKind(event.target.value)}
          >
            <option value="">Все</option>
            <option value="THEORY">Theory</option>
            <option value="TASK">Tasks</option>
            <option value="LINK">Links</option>
            <option value="ASSESSMENT">Assessment blueprints</option>
          </select>
        </label>
        <label className="sf-field">
          Topic key
          <input
            className="sf-input"
            value={topicKey}
            onChange={(event) => setTopicKey(event.target.value)}
            placeholder="js.async.promises"
          />
        </label>
      </div>
      {query.isLoading ? <LoadingState count={6} /> : null}
      {query.error ? <ErrorState error={query.error} retry={() => void query.refetch()} /> : null}
      {firstPage && items.length === 0 ? (
        <EmptyState
          title="Материалы не найдены"
          description="Измени фильтр или проверь content import."
        />
      ) : null}
      <div className="sf-grid sf-grid--3">
        {items.map((item) => (
          <SectionCard key={`${item.stableKey}:${item.version}`}>
            <div className="sf-card-title-row">
              <span className="sf-pill">{item.kind}</span>
              <FileCode2 aria-hidden="true" size={17} />
            </div>
            <h3>{item.title}</h3>
            <p className="sf-muted">
              {item.topicTitle} · {item.topicKey}
            </p>
            {item.bodyPreview ? <p>{item.bodyPreview}</p> : null}
            <hr className="sf-divider" />
            <small>
              {item.stableKey} · v{item.version}
              <br />
              {item.sourcePack}@{item.sourceVersion}
              <br />
              SHA {item.checksum.slice(0, 12)}… · {item.status}
            </small>
          </SectionCard>
        ))}
      </div>
      {query.hasNextPage ? (
        <button
          className="sf-button sf-button--secondary"
          type="button"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? 'Загрузка…' : 'Загрузить ещё'}
        </button>
      ) : null}
    </div>
  );
}
