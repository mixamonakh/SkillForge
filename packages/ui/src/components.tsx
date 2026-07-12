'use client';

import * as Dialog from '@radix-ui/react-dialog';
import * as Progress from '@radix-ui/react-progress';
import * as Tabs from '@radix-ui/react-tabs';
import { AlertCircle, Check, CircleHelp, Clock3, RefreshCw, Trophy, X } from 'lucide-react';
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { cn } from './utils';

export type TopicStatus = 'UNKNOWN' | 'WEAK' | 'UNSTABLE' | 'SOLID' | 'MASTERED';

const statusCopy: Record<TopicStatus, string> = {
  UNKNOWN: 'Нет данных',
  WEAK: 'Слабая опора',
  UNSTABLE: 'Нестабильно',
  SOLID: 'Уверенно',
  MASTERED: 'Освоено',
};

const statusIcon: Record<TopicStatus, ReactNode> = {
  UNKNOWN: <CircleHelp aria-hidden="true" size={14} />,
  WEAK: <AlertCircle aria-hidden="true" size={14} />,
  UNSTABLE: <Clock3 aria-hidden="true" size={14} />,
  SOLID: <Check aria-hidden="true" size={14} />,
  MASTERED: <Trophy aria-hidden="true" size={14} />,
};

export function StatusBadge({ status }: { status: TopicStatus }) {
  return (
    <span className={cn('sf-status', `sf-status--${status.toLowerCase()}`)}>
      {statusIcon[status]}
      {statusCopy[status]}
    </span>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  busy?: boolean;
};

function Button({ busy = false, className, children, disabled, ...props }: ButtonProps) {
  return (
    <button className={className} disabled={disabled === true || busy} aria-busy={busy} {...props}>
      {busy ? <RefreshCw className="sf-spin" aria-hidden="true" size={16} /> : null}
      {children}
    </button>
  );
}

export function PrimaryButton({ className, ...props }: ButtonProps) {
  return <Button className={cn('sf-button sf-button--primary', className)} {...props} />;
}

export function SecondaryButton({ className, ...props }: ButtonProps) {
  return <Button className={cn('sf-button sf-button--secondary', className)} {...props} />;
}

export function GhostButton({ className, ...props }: ButtonProps) {
  return <Button className={cn('sf-button sf-button--ghost', className)} {...props} />;
}

export function SectionCard({ className, children, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section className={cn('sf-card', className)} {...props}>
      {children}
    </section>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="sf-page-header">
      <div>
        {eyebrow ? <p className="sf-eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p className="sf-muted sf-page-description">{description}</p> : null}
      </div>
      {actions ? <div className="sf-actions">{actions}</div> : null}
    </header>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="sf-empty">
      <CircleHelp aria-hidden="true" size={30} />
      <h2>{title}</h2>
      <p>{description}</p>
      {action ? <div className="sf-actions">{action}</div> : null}
    </div>
  );
}

export function InsufficientData({
  title = 'Пока недостаточно доказательств',
  children,
}: {
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div className="sf-insufficient" role="status">
      <CircleHelp aria-hidden="true" size={20} />
      <div>
        <strong>{title}</strong>
        <p>{children ?? 'Нужно больше независимых попыток, чтобы показать устойчивую оценку.'}</p>
      </div>
    </div>
  );
}

export type AutosaveState = 'idle' | 'saving' | 'saved' | 'error' | 'offline';

export function AutosaveIndicator({ state }: { state: AutosaveState }) {
  const copy: Record<AutosaveState, string> = {
    idle: 'Изменений нет',
    saving: 'Сохраняется…',
    saved: 'Сохранено',
    error: 'Ошибка сохранения',
    offline: 'Черновик сохранён локально',
  };
  return (
    <span className={cn('sf-autosave', `sf-autosave--${state}`)} role="status" aria-live="polite">
      {state === 'saving' ? <RefreshCw className="sf-spin" aria-hidden="true" size={14} /> : null}
      {state === 'saved' ? <Check aria-hidden="true" size={14} /> : null}
      {state === 'error' || state === 'offline' ? (
        <AlertCircle aria-hidden="true" size={14} />
      ) : null}
      {copy[state]}
    </span>
  );
}

export function ResumeBanner({
  topic,
  step,
  action,
}: {
  topic: string;
  step?: string | null;
  action: ReactNode;
}) {
  return (
    <section className="sf-resume">
      <div>
        <p className="sf-eyebrow">С возвращением</p>
        <h2>{topic}</h2>
        <p>
          {step ? `Ты остановился: ${step}. ` : ''}Можно спокойно восстановить контекст за 15–20
          минут.
        </p>
      </div>
      {action}
    </section>
  );
}

export function MetricCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <SectionCard className="sf-metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {note ? <small>{note}</small> : null}
    </SectionCard>
  );
}

export function EvidenceBadge({ children }: { children: ReactNode }) {
  return <span className="sf-evidence-badge">{children}</span>;
}

export function SkillForgeProgress({ value, label }: { value: number; label: string }) {
  const bounded = Math.max(0, Math.min(100, value));
  return (
    <div className="sf-progress-wrap">
      <div className="sf-progress-label">
        <span>{label}</span>
        <span>{Math.round(bounded)}%</span>
      </div>
      <Progress.Root className="sf-progress" value={bounded} aria-label={label}>
        <Progress.Indicator
          className="sf-progress-bar"
          style={{ transform: `translateX(-${100 - bounded}%)` }}
        />
      </Progress.Root>
    </div>
  );
}

export const SkillForgeTabs = Tabs;

export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  destructive = false,
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="sf-dialog-overlay" />
        <Dialog.Content className="sf-dialog-content">
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Description>{description}</Dialog.Description>
          <div className="sf-actions sf-actions--end">
            <Dialog.Close asChild>
              <SecondaryButton>Отмена</SecondaryButton>
            </Dialog.Close>
            <Dialog.Close asChild>
              <PrimaryButton
                className={destructive ? 'sf-button--danger' : undefined}
                onClick={onConfirm}
              >
                {confirmLabel}
              </PrimaryButton>
            </Dialog.Close>
          </div>
          <Dialog.Close className="sf-dialog-close" aria-label="Закрыть">
            <X aria-hidden="true" size={18} />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// Named semantic wrappers keep the shared vocabulary stable while allowing feature-specific content.
export const TopicCard = SectionCard;
export const ReadinessCard = SectionCard;
export const ImportPreviewDiff = SectionCard;
export const EvidenceTimeline = SectionCard;
export const LoadModeSelector = SectionCard;
export const SessionModeSelector = SectionCard;
export const AnswerEditor = SectionCard;
