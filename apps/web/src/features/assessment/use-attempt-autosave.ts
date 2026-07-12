'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, apiMutation } from '@/shared/api/client';
import type { AutosaveState } from '@skillforge/ui';
import type { TaskItem } from '@/shared/api/types';

export type AttemptDraft = {
  answerText: string;
  answerCode: string;
  selectedOptions: string[];
  selfRating: number | null;
  confidence: number | null;
  helpLevel: string;
  hintsUsed: string[];
};

type SavedAttempt = NonNullable<TaskItem['attempt']>;

const EMPTY_DRAFT: AttemptDraft = {
  answerText: '',
  answerCode: '',
  selectedOptions: [],
  selfRating: null,
  confidence: null,
  helpLevel: 'NONE',
  hintsUsed: [],
};

function storageKey(sessionId: string, itemId: string): string {
  return `skillforge:draft:${sessionId}:${itemId}`;
}

function initialDraft(item: TaskItem): AttemptDraft {
  const server = item.attempt;
  return {
    answerText: server?.answerText ?? '',
    answerCode: server?.answerCode ?? item.task.starterCode ?? '',
    selectedOptions: server?.selectedOptions ?? [],
    selfRating: server?.selfRating ?? null,
    confidence: server?.confidence ?? null,
    helpLevel: server?.helpLevel ?? 'NONE',
    hintsUsed: server?.hintsUsed ?? [],
  };
}

export function useAttemptAutosave(sessionId: string, item: TaskItem) {
  const [draft, setDraftState] = useState<AttemptDraft>(() => initialDraft(item));
  const [state, setState] = useState<AutosaveState>('idle');
  const [attempt, setAttempt] = useState<SavedAttempt | null>(item.attempt);
  const timerRef = useRef<number | null>(null);
  const retryCountRef = useRef(0);
  const retryableRef = useRef(true);
  const draftRef = useRef(draft);
  const attemptRef = useRef(attempt);
  draftRef.current = draft;
  attemptRef.current = attempt;

  useEffect(() => {
    let next = initialDraft(item);
    let hasEmergencyDraft = false;
    try {
      const local = window.localStorage.getItem(storageKey(sessionId, item.id));
      if (local) {
        next = { ...next, ...(JSON.parse(local) as Partial<AttemptDraft>) };
        hasEmergencyDraft = true;
      }
    } catch {
      // A corrupt emergency draft must never hide the authoritative server copy.
    }
    setDraftState(next);
    setAttempt(item.attempt);
    setState(hasEmergencyDraft ? (navigator.onLine ? 'error' : 'offline') : 'idle');
  }, [item.id, item.attempt, sessionId]);

  const persist = useCallback(async (): Promise<SavedAttempt> => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    setState('saving');
    const currentAttempt = attemptRef.current;
    try {
      const saved = await apiMutation<
        SavedAttempt,
        AttemptDraft & { revision: number; clientUpdatedAt: string }
      >(`/api/v1/sessions/${sessionId}/items/${item.id}/attempt`, 'PUT', {
        ...draftRef.current,
        revision: currentAttempt?.revision ?? 0,
        clientUpdatedAt: new Date().toISOString(),
      });
      setAttempt(saved);
      attemptRef.current = saved;
      retryCountRef.current = 0;
      retryableRef.current = true;
      window.localStorage.removeItem(storageKey(sessionId, item.id));
      setState('saved');
      return saved;
    } catch (error: unknown) {
      retryableRef.current = !(error instanceof ApiError && error.status === 409);
      if (!retryableRef.current) setState('error');
      else setState(navigator.onLine ? 'error' : 'offline');
      throw error;
    }
  }, [item.id, sessionId]);

  const setDraft = useCallback(
    (update: AttemptDraft | ((current: AttemptDraft) => AttemptDraft)) => {
      setDraftState((current) => {
        const next = typeof update === 'function' ? update(current) : update;
        draftRef.current = next;
        try {
          window.localStorage.setItem(storageKey(sessionId, item.id), JSON.stringify(next));
        } catch {
          // Backend persistence remains active even when browser storage is unavailable.
        }
        return next;
      });
      setState('saving');
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => void persist().catch(() => undefined), 900);
    },
    [item.id, persist, sessionId],
  );

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  useEffect(() => {
    if ((state !== 'error' && state !== 'offline') || !retryableRef.current) return;
    const retry = () => {
      const delay = Math.min(800 * 2 ** retryCountRef.current, 8_000);
      retryCountRef.current += 1;
      timerRef.current = window.setTimeout(() => void persist().catch(() => undefined), delay);
    };
    if (navigator.onLine) {
      retry();
      return () => {
        if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      };
    }
    const onOnline = () => retry();
    window.addEventListener('online', onOnline, { once: true });
    return () => window.removeEventListener('online', onOnline);
  }, [persist, state]);

  useEffect(() => {
    if (state !== 'saving' && state !== 'error' && state !== 'offline') return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [state]);

  return { draft: draft ?? EMPTY_DRAFT, setDraft, state, attempt, persist };
}
