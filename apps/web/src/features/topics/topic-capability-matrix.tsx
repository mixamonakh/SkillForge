'use client';

import { InsufficientData, SectionCard } from '@skillforge/ui';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, CircleHelp, Clock3 } from 'lucide-react';

import { ErrorState, LoadingState } from '@/components/data-state';
import { apiFetch } from '@/shared/api/client';
import type {
  CapabilityCoverage,
  CapabilityFamily,
  CapabilityState,
  TopicCapabilityProfile,
} from '@/shared/api/types';

const CAPABILITY_FAMILIES = [
  'TERM',
  'MECHANISM',
  'TRACE',
  'DEBUG',
  'CODE_PRODUCTION',
  'TRANSFER',
  'CALIBRATION',
] as const satisfies readonly CapabilityFamily[];

const FAMILY_COPY: Record<CapabilityFamily, { title: string; description: string }> = {
  TERM: {
    title: 'Терминология',
    description: 'Узнавание и корректное использование технических терминов.',
  },
  MECHANISM: {
    title: 'Понимание механизма',
    description: 'Причинная модель: почему код ведёт себя именно так.',
  },
  TRACE: {
    title: 'Чтение и трассировка',
    description: 'Пошаговое чтение кода и предсказание выполнения.',
  },
  DEBUG: {
    title: 'Поиск и исправление ошибок',
    description: 'Локализация причины сбоя и выбор корректного исправления.',
  },
  CODE_PRODUCTION: {
    title: 'Самостоятельное написание кода',
    description: 'Решение задачи без готового ответа или показанного решения.',
  },
  TRANSFER: {
    title: 'Перенос в рабочую задачу',
    description: 'Применение знания в новом рабочем или интервью-контексте.',
  },
  CALIBRATION: {
    title: 'Точность самооценки',
    description: 'Соответствие уверенности фактическому результату.',
  },
};

const COVERAGE_COPY: Record<CapabilityCoverage, string> = {
  NOT_TESTED: 'Не проверено',
  INSUFFICIENT: 'Недостаточно данных',
  SUFFICIENT: 'Данных достаточно',
};

function CoverageBadge({ coverage, family }: { coverage: CapabilityCoverage; family: string }) {
  return (
    <span
      className={`sf-capability-status sf-capability-status--${coverage.toLowerCase()}`}
      aria-label={`${family}: ${COVERAGE_COPY[coverage]}`}
    >
      {coverage === 'NOT_TESTED' ? <CircleHelp aria-hidden="true" size={16} /> : null}
      {coverage === 'INSUFFICIENT' ? <Clock3 aria-hidden="true" size={16} /> : null}
      {coverage === 'SUFFICIENT' ? <CheckCircle2 aria-hidden="true" size={16} /> : null}
      {COVERAGE_COPY[coverage]}
    </span>
  );
}

function formatLastEvidence(value: string | null): string {
  if (!value) return 'ещё не было';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'дата недоступна' : parsed.toLocaleString('ru-RU');
}

function estimateCopy(state: CapabilityState): string {
  if (state.coverage === 'NOT_TESTED') return 'не проверено';
  if (state.coverage !== 'SUFFICIENT') return 'недостаточно данных';
  return state.estimate === null ? 'не рассчитана' : `${Math.round(state.estimate)} из 100`;
}

function confidenceCopy(state: CapabilityState): string {
  return state.coverage === 'NOT_TESTED'
    ? 'не рассчитана'
    : `${Math.round(state.confidence)} из 100`;
}

function MissingCapability({ family }: { family: CapabilityFamily }) {
  const copy = FAMILY_COPY[family];
  return (
    <li className="sf-capability-item">
      <article aria-labelledby={`capability-${family.toLowerCase()}`}>
        <div className="sf-capability-heading">
          <div>
            <h3 id={`capability-${family.toLowerCase()}`}>{copy.title}</h3>
            <p className="sf-muted">{copy.description}</p>
          </div>
          <CoverageBadge coverage="NOT_TESTED" family={copy.title} />
        </div>
        <p className="sf-muted">API пока не вернул состояние этого компонента.</p>
      </article>
    </li>
  );
}

function CapabilityItem({ state }: { state: CapabilityState }) {
  const copy = FAMILY_COPY[state.family];
  return (
    <li className="sf-capability-item">
      <article aria-labelledby={`capability-${state.family.toLowerCase()}`}>
        <div className="sf-capability-heading">
          <div>
            <h3 id={`capability-${state.family.toLowerCase()}`}>{copy.title}</h3>
            <p className="sf-muted">{copy.description}</p>
          </div>
          <CoverageBadge coverage={state.coverage} family={copy.title} />
        </div>
        <dl className="sf-capability-facts">
          <div>
            <dt>Оценка</dt>
            <dd>{estimateCopy(state)}</dd>
          </div>
          <div>
            <dt>Достаточность сигнала</dt>
            <dd>{confidenceCopy(state)}</dd>
          </div>
          <div>
            <dt>Evidence</dt>
            <dd>{state.evidenceCount}</dd>
          </div>
          <div>
            <dt>Независимых дней</dt>
            <dd>{state.independentDays}</dd>
          </div>
          <div>
            <dt>Успехов без подсказки</dt>
            <dd>{state.noHelpSuccessCount}</dd>
          </div>
          <div>
            <dt>Ожидают проверки</dt>
            <dd>{state.pendingReviewCount}</dd>
          </div>
          <div>
            <dt>Последний сигнал</dt>
            <dd>{formatLastEvidence(state.lastEvidenceAt)}</dd>
          </div>
        </dl>
        {state.explanation.length > 0 ? (
          <div className="sf-capability-explanation">
            <h4>Почему такой coverage</h4>
            <ul>
              {state.explanation.map((explanation) => (
                <li key={explanation}>{explanation}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="sf-muted">Пояснение пока не сформировано.</p>
        )}
      </article>
    </li>
  );
}

export function TopicCapabilityMatrix({ topicKey }: { topicKey: string }) {
  const query = useQuery({
    queryKey: ['topic-capability-profile', topicKey],
    queryFn: () =>
      apiFetch<TopicCapabilityProfile>(
        `/api/v1/topics/${encodeURIComponent(topicKey)}/capability-profile`,
      ),
  });

  if (query.isLoading) {
    return (
      <SectionCard aria-labelledby="topic-capability-title">
        <h2 id="topic-capability-title">Компоненты навыка</h2>
        <LoadingState count={3} />
      </SectionCard>
    );
  }
  if (query.error) {
    return (
      <SectionCard aria-labelledby="topic-capability-title">
        <h2 id="topic-capability-title">Компоненты навыка</h2>
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      </SectionCard>
    );
  }

  const profile = query.data;
  if (!profile?.capabilities) {
    return (
      <SectionCard aria-labelledby="topic-capability-title">
        <h2 id="topic-capability-title">Компоненты навыка</h2>
        <InsufficientData title="Профиль пока недоступен">
          Сервер не вернул ни одного состояния capability. Mastery и readiness из этого не
          выводятся.
        </InsufficientData>
      </SectionCard>
    );
  }

  const states = CAPABILITY_FAMILIES.flatMap((family) => {
    const state = profile.capabilities[family];
    return state ? [state] : [];
  });
  const calibrated = states.some(
    (state) =>
      state.coverage !== 'NOT_TESTED' || state.evidenceCount > 0 || state.pendingReviewCount > 0,
  );

  return (
    <SectionCard aria-labelledby="topic-capability-title">
      <div className="sf-card-title-row">
        <div>
          <h2 id="topic-capability-title">Компоненты навыка</h2>
          <p className="sf-muted">
            Отдельно показываем терминологию, понимание, чтение, debugging, написание кода, transfer
            и точность самооценки.
          </p>
        </div>
        <code>{profile.algorithmVersion}</code>
      </div>
      {!calibrated ? (
        <InsufficientData title="Профиль пока не откалиброван">
          Нет достаточных сигналов. «Не проверено» не означает нулевой навык.
        </InsufficientData>
      ) : null}
      <ul className="sf-capability-list" aria-label="Компоненты навыка">
        {CAPABILITY_FAMILIES.map((family) => {
          const state = profile.capabilities[family];
          return state ? (
            <CapabilityItem key={family} state={state} />
          ) : (
            <MissingCapability key={family} family={family} />
          );
        })}
      </ul>
    </SectionCard>
  );
}
