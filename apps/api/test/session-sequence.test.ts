import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../src/database/prisma.service.js';
import type { MasteryService } from '../src/modules/mastery/mastery.service.js';
import type { SessionRecommendationService } from '../src/modules/sessions/session-recommendation.service.js';
import { SessionPlanDto } from '../src/modules/sessions/sessions.dto.js';
import { SessionsService } from '../src/modules/sessions/sessions.service.js';

const TOPIC_KEY = 'js.references';
const SEQUENCE_KEY = 'js.references.acquisition-v1';

function planDto(overrides: Partial<SessionPlanDto> = {}): SessionPlanDto {
  return Object.assign(new SessionPlanDto(), {
    mode: 'TRAINING',
    loadMode: 'NORMAL',
    topicKeys: [TOPIC_KEY],
    documentationAllowed: true,
    codeLanguage: 'javascript',
    learningPhase: 'ACQUISITION',
    sequenceKey: SEQUENCE_KEY,
    ...overrides,
  });
}

function blueprint(steps: unknown[]) {
  return {
    id: 'sequence-id',
    key: SEQUENCE_KEY,
    version: 3,
    topicId: 'topic-id',
    schemaVersion: '1.0',
    phase: 'ACQUISITION',
    estimatedMinutes: 25,
    steps,
    completionRule: { requiredSteps: steps.length, minimumNoHelpSuccesses: 1 },
    sourcePack: 'js-core-v1',
    sourceVersion: '1.0.0',
    checksum: 'sequence-checksum',
    topic: { key: TOPIC_KEY },
    createdAt: new Date('2026-07-15T00:00:00.000Z'),
  };
}

function service(database: PrismaService): SessionsService {
  return new SessionsService(database, {} as SessionRecommendationService, {} as MasteryService);
}

describe('SessionsService versioned sequence path', () => {
  it('creates interleaved task/content rows and stores an exact deep sequence snapshot', async () => {
    const sourceSteps = [
      {
        kind: 'CONTENT',
        contentItemKey: 'js.references.canonical-model',
        version: 2,
      },
      {
        kind: 'TASK',
        taskKey: 'js.references.predict-basic-001',
        version: 4,
        purpose: 'PREDICT',
      },
    ];
    const stored = blueprint(sourceSteps);
    const createInputs: unknown[] = [];
    const sessionItemInputs: unknown[] = [];
    const contentStepInputs: unknown[] = [];
    const attemptInputs: unknown[] = [];
    const transaction = {
      learningSession: {
        create: vi.fn((input: unknown) => {
          createInputs.push(input);
          return Promise.resolve({ id: 'session-id' });
        }),
      },
      sessionItem: {
        create: vi.fn((input: unknown) => {
          sessionItemInputs.push(input);
          return Promise.resolve({ id: `item-${String(sessionItemInputs.length)}` });
        }),
      },
      learningSessionContentStep: {
        create: vi.fn((input: unknown) => {
          contentStepInputs.push(input);
          return Promise.resolve({ id: `content-step-${String(contentStepInputs.length)}` });
        }),
      },
      attempt: {
        create: vi.fn((input: unknown) => {
          attemptInputs.push(input);
          return Promise.resolve({ id: `attempt-${String(attemptInputs.length)}` });
        }),
      },
    };
    type TransactionOperation = (value: typeof transaction) => Promise<unknown>;
    const database = {
      client: {
        topic: {
          findMany: vi
            .fn()
            .mockResolvedValueOnce([{ key: TOPIC_KEY }])
            .mockResolvedValueOnce([{ key: TOPIC_KEY, title: 'Ссылки и объекты', tasks: [] }]),
        },
        learningSequenceBlueprint: { findMany: vi.fn().mockResolvedValue([stored]) },
        contentPack: {
          findMany: vi.fn().mockResolvedValue([{ key: 'js-core-v1', version: '1.0.0' }]),
        },
        taskVersion: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 'task-version-id',
              version: 4,
              checksum: 'task-checksum',
              language: 'javascript',
              sourcePack: 'js-core-v1',
              sourceVersion: '1.0.0',
              task: { stableKey: 'js.references.predict-basic-001', kind: 'PREDICT_OUTPUT' },
            },
          ]),
        },
        contentItem: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 'content-item-id',
              stableKey: 'js.references.canonical-model',
              version: 2,
              checksum: 'content-checksum',
              kind: 'CONCEPT_NOTE',
              title: 'Модель ссылок',
              bodyMarkdown: 'Объект хранится отдельно от ссылки.',
              payload: { source: 'mdn' },
              sourcePack: 'js-core-v1',
              sourceVersion: '1.0.0',
            },
          ]),
        },
        $transaction: vi.fn((operation: TransactionOperation) => operation(transaction)),
      },
    } as unknown as PrismaService;
    const sessions = service(database);
    vi.spyOn(sessions, 'get').mockResolvedValue({ id: 'session-id' });

    await expect(sessions.create(planDto())).resolves.toEqual({ id: 'session-id' });

    expect(createInputs).toHaveLength(1);
    expect(createInputs[0]).toMatchObject({
      data: {
        mode: 'TRAINING',
        learningPhase: 'ACQUISITION',
        planSnapshot: {
          schemaVersion: '2.0',
          request: { sequenceKey: SEQUENCE_KEY, sequenceVersion: 3 },
          sequence: {
            key: SEQUENCE_KEY,
            version: 3,
            blueprintId: 'sequence-id',
            checksum: 'sequence-checksum',
            estimatedMinutes: 25,
            completionRule: { requiredSteps: 2, minimumNoHelpSuccesses: 1 },
            steps: [
              {
                kind: 'CONTENT',
                contentItemKey: 'js.references.canonical-model',
                version: 2,
                sequencePosition: 0,
                required: true,
                contentItemId: 'content-item-id',
                checksum: 'content-checksum',
              },
              {
                kind: 'TASK',
                taskKey: 'js.references.predict-basic-001',
                version: 4,
                purpose: 'PREDICT',
                sequencePosition: 1,
                required: true,
                taskVersionId: 'task-version-id',
                checksum: 'task-checksum',
              },
            ],
          },
        },
      },
    });
    expect(sessionItemInputs).toEqual([
      {
        data: {
          sessionId: 'session-id',
          taskVersionId: 'task-version-id',
          position: 1,
          purpose: 'PREDICT',
          required: true,
        },
      },
    ]);
    expect(contentStepInputs).toEqual([
      {
        data: {
          sessionId: 'session-id',
          contentItemId: 'content-item-id',
          sequencePosition: 0,
          required: true,
          snapshot: {
            schemaVersion: '1.0',
            stableKey: 'js.references.canonical-model',
            version: 2,
            checksum: 'content-checksum',
            kind: 'CONCEPT_NOTE',
            title: 'Модель ссылок',
            bodyMarkdown: 'Объект хранится отдельно от ссылки.',
            payload: { source: 'mdn' },
          },
        },
      },
    ]);
    expect(attemptInputs).toHaveLength(1);

    sourceSteps[0] = { kind: 'CONTENT', contentItemKey: 'changed', version: 99 };
    expect(createInputs[0]).toMatchObject({
      data: {
        planSnapshot: {
          sequence: {
            steps: [
              {
                kind: 'CONTENT',
                contentItemKey: 'js.references.canonical-model',
                version: 2,
              },
              { kind: 'TASK', taskKey: 'js.references.predict-basic-001', version: 4 },
            ],
          },
        },
      },
    });
  });

  it('returns an actionable error when the requested topic/phase sequence is missing', async () => {
    const database = {
      client: {
        topic: { findMany: vi.fn().mockResolvedValue([{ key: TOPIC_KEY }]) },
        learningSequenceBlueprint: { findMany: vi.fn().mockResolvedValue([]) },
      },
    } as unknown as PrismaService;

    await expect(service(database).plan(planDto())).rejects.toMatchObject({
      code: 'SESSION_SEQUENCE_NOT_FOUND',
    });
  });

  it('rejects direct selection while the exact source ContentPack version is not ACTIVE', async () => {
    const database = {
      client: {
        topic: { findMany: vi.fn().mockResolvedValue([{ key: TOPIC_KEY }]) },
        learningSequenceBlueprint: { findMany: vi.fn().mockResolvedValue([blueprint([])]) },
        contentPack: { findMany: vi.fn().mockResolvedValue([]) },
        taskVersion: { findMany: vi.fn().mockResolvedValue([]) },
        contentItem: { findMany: vi.fn().mockResolvedValue([]) },
      },
    } as unknown as PrismaService;

    await expect(service(database).plan(planDto())).rejects.toMatchObject({
      code: 'SESSION_SEQUENCE_NOT_FOUND',
    });
  });

  it('rejects duplicate exact task refs instead of creating redundant attempts', async () => {
    const duplicate = {
      kind: 'TASK',
      taskKey: 'js.references.predict-basic-001',
      version: 4,
      purpose: 'PREDICT',
    };
    const stored = blueprint([duplicate, { ...duplicate }]);
    const transaction = vi.fn();
    const database = {
      client: {
        topic: {
          findMany: vi
            .fn()
            .mockResolvedValueOnce([{ key: TOPIC_KEY }])
            .mockResolvedValueOnce([{ key: TOPIC_KEY, title: 'Ссылки и объекты', tasks: [] }]),
        },
        learningSequenceBlueprint: { findMany: vi.fn().mockResolvedValue([stored]) },
        contentPack: {
          findMany: vi.fn().mockResolvedValue([{ key: 'js-core-v1', version: '1.0.0' }]),
        },
        taskVersion: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 'task-version-id',
              version: 4,
              sourcePack: 'js-core-v1',
              sourceVersion: '1.0.0',
              task: { stableKey: 'js.references.predict-basic-001' },
            },
          ]),
        },
        contentItem: { findMany: vi.fn().mockResolvedValue([]) },
        $transaction: transaction,
      },
    } as unknown as PrismaService;

    await expect(service(database).create(planDto())).rejects.toMatchObject({
      code: 'SESSION_SEQUENCE_DUPLICATE_TASK',
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('keeps a migrated legacy snapshot readable and exposes its backfilled phase', async () => {
    const database = {
      client: {
        learningSession: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'legacy-session',
            title: 'Старая сессия',
            mode: 'REVIEW',
            learningPhase: 'CONSOLIDATION',
            loadMode: 'NORMAL',
            status: 'PAUSED',
            planSnapshot: {
              schemaVersion: '1.0',
              request: { documentationAllowed: true },
              taskVersions: [],
            },
            lastStepLabel: null,
            startedAt: new Date('2026-07-01T10:00:00.000Z'),
            completedAt: null,
            goal: 'Повторение',
            loadFeedback: null,
            summary: null,
            items: [],
            contentSteps: [],
          }),
        },
      },
    } as unknown as PrismaService;

    await expect(service(database).get('legacy-session')).resolves.toMatchObject({
      id: 'legacy-session',
      learningPhase: 'CONSOLIDATION',
      documentationAllowed: true,
      sequence: null,
      items: [],
    });
  });

  it('returns an ordered CONTENT/TASK union while preserving legacy items', async () => {
    const submittedAt = new Date('2026-07-15T10:05:00.000Z');
    const database = {
      client: {
        learningSession: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'sequence-session',
            title: 'Ссылки и объекты',
            mode: 'TRAINING',
            learningPhase: 'ACQUISITION',
            loadMode: 'NORMAL',
            status: 'ACTIVE',
            planSnapshot: {
              schemaVersion: '2.0',
              request: { documentationAllowed: true },
              sequence: { key: SEQUENCE_KEY, version: 3 },
            },
            lastStepLabel: null,
            startedAt: new Date('2026-07-15T10:00:00.000Z'),
            completedAt: null,
            goal: 'Практика',
            loadFeedback: null,
            summary: null,
            contentSteps: [
              {
                id: 'content-step-id',
                sequencePosition: 0,
                required: true,
                snapshot: {
                  schemaVersion: '1.0',
                  stableKey: 'js.references.canonical-model',
                  version: 2,
                  checksum: 'content-checksum',
                  kind: 'CONCEPT_NOTE',
                  title: 'Модель ссылок',
                  bodyMarkdown: 'Текст',
                  payload: null,
                },
                completedAt: submittedAt,
              },
            ],
            items: [
              {
                id: 'task-item-id',
                position: 1,
                purpose: 'PREDICT',
                required: true,
                taskVersion: {
                  version: 4,
                  promptMarkdown: 'Что выведет код?',
                  starterCode: null,
                  language: null,
                  options: [],
                  rubric: {},
                  hints: [],
                  testCases: [],
                  task: {
                    stableKey: 'js.references.predict-basic-001',
                    kind: 'EXPLAIN',
                    topic: { key: TOPIC_KEY, title: 'Ссылки и объекты' },
                  },
                },
                attempts: [
                  {
                    id: 'attempt-id',
                    revision: 0,
                    answerText: null,
                    answerCode: null,
                    selectedOptions: [],
                    selfRating: null,
                    confidence: null,
                    helpLevel: 'NONE',
                    hintsUsed: [],
                    submittedAt: null,
                    runnerOutput: null,
                    evaluations: [],
                  },
                ],
              },
            ],
          }),
        },
      },
    } as unknown as PrismaService;

    await expect(service(database).get('sequence-session')).resolves.toMatchObject({
      itemCount: 1,
      stepCount: 2,
      items: [{ id: 'task-item-id', position: 1 }],
      steps: [
        {
          kind: 'CONTENT',
          id: 'content-step-id',
          position: 0,
          completedAt: submittedAt.toISOString(),
        },
        {
          kind: 'TASK',
          id: 'task-item-id',
          position: 1,
          taskItem: { id: 'task-item-id', position: 1 },
        },
      ],
    });
  });

  it('does not complete a sequence before its no-help success rule is met', async () => {
    const database = {
      client: {
        learningSession: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'sequence-session',
            status: 'ACTIVE',
            startedAt: new Date('2026-07-15T10:00:00.000Z'),
            planSnapshot: {
              schemaVersion: '2.0',
              sequence: {
                key: SEQUENCE_KEY,
                version: 3,
                completionRule: { requiredSteps: 1, minimumNoHelpSuccesses: 1 },
              },
            },
            contentSteps: [],
            items: [
              {
                required: true,
                attempts: [
                  {
                    submittedAt: new Date('2026-07-15T10:05:00.000Z'),
                    helpLevel: 'HINT',
                    evaluations: [{ passed: true }],
                  },
                ],
                taskVersion: { task: { topicId: 'topic-id' } },
              },
            ],
          }),
        },
      },
    } as unknown as PrismaService;

    await expect(
      service(database).complete('sequence-session', { loadFeedback: 'RIGHT' }),
    ).rejects.toMatchObject({ code: 'SESSION_COMPLETION_RULE_NOT_MET' });
  });

  it('completes an active user-owned content step idempotently', async () => {
    const persistedCompletedAt = new Date('2026-07-15T11:00:00.000Z');
    const baseStep = {
      id: 'content-step-id',
      sequencePosition: 0,
      required: true,
      snapshot: {
        stableKey: 'js.references.canonical-model',
        version: 2,
        title: 'Модель ссылок',
      },
      session: { status: 'ACTIVE' },
    };
    const transaction = {
      learningSessionContentStep: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({ ...baseStep, completedAt: null })
          .mockResolvedValueOnce({ ...baseStep, completedAt: persistedCompletedAt }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    type TransactionOperation = (value: typeof transaction) => Promise<unknown>;
    const database = {
      client: {
        $transaction: vi.fn((operation: TransactionOperation) => operation(transaction)),
      },
    } as unknown as PrismaService;
    const sessions = service(database);

    const first = await sessions.completeContentStep('session-id', 'content-step-id');
    const second = await sessions.completeContentStep('session-id', 'content-step-id');

    expect(first).toMatchObject({
      kind: 'CONTENT',
      id: 'content-step-id',
    });
    expect(typeof (first as { completedAt: unknown }).completedAt).toBe('string');
    expect(second).toMatchObject({
      kind: 'CONTENT',
      id: 'content-step-id',
      completedAt: persistedCompletedAt.toISOString(),
    });
    expect(transaction.learningSessionContentStep.updateMany).toHaveBeenCalledTimes(1);
  });

  it('returns the persisted completion when concurrent idempotent requests race', async () => {
    const persistedCompletedAt = new Date('2026-07-15T11:00:00.000Z');
    const transaction = {
      learningSessionContentStep: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({
            id: 'content-step-id',
            sequencePosition: 0,
            required: true,
            snapshot: { title: 'Модель ссылок' },
            completedAt: null,
            session: { status: 'ACTIVE' },
          })
          .mockResolvedValueOnce({
            id: 'content-step-id',
            sequencePosition: 0,
            required: true,
            snapshot: { title: 'Модель ссылок' },
            completedAt: persistedCompletedAt,
          }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    type TransactionOperation = (value: typeof transaction) => Promise<unknown>;
    const database = {
      client: {
        $transaction: vi.fn((operation: TransactionOperation) => operation(transaction)),
      },
    } as unknown as PrismaService;

    await expect(
      service(database).completeContentStep('session-id', 'content-step-id'),
    ).resolves.toMatchObject({ completedAt: persistedCompletedAt.toISOString() });
  });

  it('requires every required content step before session completion', async () => {
    const database = {
      client: {
        learningSession: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'sequence-session',
            status: 'ACTIVE',
            startedAt: new Date('2026-07-15T10:00:00.000Z'),
            planSnapshot: {
              schemaVersion: '2.0',
              sequence: {
                key: SEQUENCE_KEY,
                version: 3,
                completionRule: { requiredSteps: 1, minimumNoHelpSuccesses: 0 },
              },
            },
            contentSteps: [{ required: true, completedAt: null }],
            items: [],
          }),
        },
      },
    } as unknown as PrismaService;

    await expect(
      service(database).complete('sequence-session', { loadFeedback: 'RIGHT' }),
    ).rejects.toMatchObject({ code: 'SESSION_CONTENT_INCOMPLETE' });
  });

  it('requires every required TASK submission after content is complete', async () => {
    const database = {
      client: {
        learningSession: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'sequence-session',
            status: 'ACTIVE',
            startedAt: new Date('2026-07-15T10:00:00.000Z'),
            planSnapshot: {
              schemaVersion: '2.0',
              sequence: {
                key: SEQUENCE_KEY,
                version: 3,
                completionRule: { requiredSteps: 2, minimumNoHelpSuccesses: 0 },
              },
            },
            contentSteps: [{ required: true, completedAt: new Date('2026-07-15T10:03:00.000Z') }],
            items: [
              {
                required: true,
                attempts: [{ submittedAt: null, evaluations: [] }],
                taskVersion: { task: { topicId: 'topic-id' } },
              },
            ],
          }),
        },
      },
    } as unknown as PrismaService;

    await expect(
      service(database).complete('sequence-session', { loadFeedback: 'RIGHT' }),
    ).rejects.toMatchObject({ code: 'SESSION_INCOMPLETE' });
  });
});
