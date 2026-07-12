'use client';

import { InsufficientData, MetricCard, PageHeader, SectionCard, StatusBadge } from '@skillforge/ui';
import { useQuery } from '@tanstack/react-query';
import { Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ErrorState, LoadingState } from '@/components/data-state';
import { apiFetch } from '@/shared/api/client';
import type { DataSufficiency } from '@/shared/api/types';

type MetricsData = {
  dataSufficiency: DataSufficiency;
  coverage: Array<{ trackKey: string; title: string; assessed: number; total: number }>;
  masteryDistribution: Record<'UNKNOWN' | 'WEAK' | 'UNSTABLE' | 'SOLID' | 'MASTERED', number>;
  freshness: { fresh: number; reviewDue: number; noEvidence: number };
  pendingExternalReviews: number;
  calibration: { dataSufficiency: DataSufficiency; absoluteGap: number | null; attempts: number };
  misconceptions: Array<{ key: string; title: string; count: number }>;
  loadFeedback: Record<string, number>;
  readiness: {
    dataSufficiency: DataSufficiency;
    value: number | null;
    targetTitle: string;
    targetVersion: string;
    covered: number;
    required: number;
    gates: string[];
  };
};

const colors = ['#94a3b8', '#e5484d', '#f0a020', '#104ff2', '#22a06b'];

export function Metrics() {
  const query = useQuery({
    queryKey: ['metrics'],
    queryFn: () => apiFetch<MetricsData>('/api/v1/metrics/topics'),
  });
  if (query.isLoading) return <LoadingState count={6} />;
  if (query.error) return <ErrorState error={query.error} retry={() => void query.refetch()} />;
  if (!query.data) return null;
  const metrics = query.data;
  const distribution = Object.entries(metrics.masteryDistribution).map(([name, value], index) => ({
    name,
    value,
    fill: colors[index] ?? '#94a3b8',
  }));

  return (
    <div className="sf-stack">
      <PageHeader
        eyebrow="Объяснимые метрики"
        title="Metrics"
        description="Coverage, confidence и freshness показываются отдельно. Readiness — покрытие target profile, а не вероятность оффера."
      />
      <div className="sf-grid sf-grid--4">
        <MetricCard
          label="JS baseline coverage"
          value={`${Math.round(metrics.dataSufficiency.coverage * 100)}%`}
          note={metrics.dataSufficiency.reason}
        />
        <MetricCard
          label="Pending review"
          value={String(metrics.pendingExternalReviews)}
          note="Свободные ответы"
        />
        <MetricCard
          label="Review due"
          value={String(metrics.freshness.reviewDue)}
          note="Статус не понижен"
        />
        <MetricCard
          label="Calibration gap"
          value={
            metrics.calibration.absoluteGap === null
              ? '—'
              : `${Math.round(metrics.calibration.absoluteGap)} п.п.`
          }
          note={`${metrics.calibration.attempts} evaluated attempts`}
        />
      </div>
      <div className="sf-grid sf-grid--2 sf-align-start">
        <SectionCard>
          <h2>Mastery distribution</h2>
          <div className="sf-chart" aria-hidden="true">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={distribution}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={58}
                  outerRadius={92}
                />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <table className="sf-data-table">
            <caption className="sf-sr-only">Распределение статусов тем</caption>
            <tbody>
              {distribution.map((item, index) => (
                <tr key={item.name}>
                  <th>
                    <span className="sf-color-dot" style={{ background: colors[index] }} />
                    {item.name}
                  </th>
                  <td>{item.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
        <SectionCard>
          <h2>{metrics.readiness.targetTitle}</h2>
          {!metrics.readiness.dataSufficiency.sufficient ? (
            <InsufficientData
              title={
                metrics.readiness.required > 0
                  ? 'Целевой трек: частично откалиброван'
                  : 'Целевой профиль не настроен'
              }
            >
              {metrics.readiness.required > 0
                ? `Покрыто ${metrics.readiness.covered} из ${metrics.readiness.required} обязательных компетенций. Единый score скрыт.`
                : metrics.readiness.dataSufficiency.reason}
            </InsufficientData>
          ) : (
            <>
              <strong className="sf-large-value">
                {Math.round(metrics.readiness.value ?? 0)}%
              </strong>
              <p>Покрытие компетенций · target {metrics.readiness.targetVersion}</p>
            </>
          )}
          {metrics.readiness.gates.length > 0 ? (
            <ul>
              {metrics.readiness.gates.map((gate) => (
                <li key={gate}>{gate}</li>
              ))}
            </ul>
          ) : null}
          <small className="sf-muted">Оценка покрытия компетенций, не вероятность оффера.</small>
        </SectionCard>
      </div>
      <div className="sf-grid sf-grid--2">
        <SectionCard>
          <h2>Coverage по Track</h2>
          <ul className="sf-list">
            {metrics.coverage.map((track) => (
              <li className="sf-list-row" key={track.trackKey}>
                <span>{track.title}</span>
                <strong>
                  {track.assessed} из {track.total}
                </strong>
              </li>
            ))}
          </ul>
        </SectionCard>
        <SectionCard>
          <h2>Recurring misconceptions</h2>
          {metrics.misconceptions.length === 0 ? (
            <InsufficientData title="Повторяющихся ошибок пока нет">
              Нужно несколько совпадающих оценок, а не одиночная догадка.
            </InsufficientData>
          ) : (
            <ul className="sf-list">
              {metrics.misconceptions.map((item) => (
                <li className="sf-list-row" key={item.key}>
                  <span>{item.title}</span>
                  <span>{item.count} evidence</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
      <SectionCard>
        <h2>Нагрузка сессий</h2>
        {Object.keys(metrics.loadFeedback).length === 0 ? (
          <InsufficientData title="Feedback пока не собран" />
        ) : (
          <div className="sf-grid sf-grid--4">
            {Object.entries(metrics.loadFeedback).map(([label, value]) => (
              <MetricCard key={label} label={label} value={String(value)} />
            ))}
          </div>
        )}
      </SectionCard>
      <section className="sf-sr-only" aria-label="Текстовое пояснение статусов">
        <StatusBadge status="UNKNOWN" /> означает отсутствие достаточных evidence; это не нулевой
        навык.
      </section>
    </div>
  );
}
