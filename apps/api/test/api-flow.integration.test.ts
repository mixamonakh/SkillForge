import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createSkillForgeApplication } from '../src/bootstrap.js';
import { PrismaService } from '../src/database/prisma.service.js';

const TopicSchema = z.looseObject({ key: z.string() });
const AttemptSchema = z.looseObject({
  id: z.uuid(),
  revision: z.number().int(),
  answerText: z.string().nullable(),
});
const SessionSchema = z.looseObject({
  id: z.uuid(),
  status: z.string(),
  documentationAllowed: z.boolean(),
  items: z.array(
    z.looseObject({
      id: z.uuid(),
      task: z.looseObject({
        topicKey: z.string(),
        kind: z.string(),
        hints: z.array(z.string()),
      }),
      attempt: AttemptSchema.nullable(),
    }),
  ),
});
const ContentStepSchema = z.looseObject({
  kind: z.literal('CONTENT'),
  id: z.uuid(),
  position: z.number().int().nonnegative(),
  required: z.boolean(),
  completedAt: z.iso.datetime().nullable(),
  content: z.looseObject({
    stableKey: z.string(),
    version: z.number().int().positive(),
    checksum: z.string(),
    kind: z.string(),
    title: z.string(),
    bodyMarkdown: z.string().nullable(),
  }),
});
const TaskStepSchema = z.looseObject({
  kind: z.literal('TASK'),
  id: z.uuid(),
  position: z.number().int().nonnegative(),
  required: z.boolean(),
  taskItem: z.looseObject({
    id: z.uuid(),
    position: z.number().int().nonnegative(),
    attempt: AttemptSchema.nullable(),
  }),
});
const SequenceSessionSchema = z.looseObject({
  id: z.uuid(),
  status: z.string(),
  itemCount: z.number().int().nonnegative(),
  stepCount: z.number().int().nonnegative(),
  items: z.array(
    z.looseObject({
      id: z.uuid(),
      position: z.number().int().nonnegative(),
      attempt: AttemptSchema.nullable(),
    }),
  ),
  steps: z.array(z.discriminatedUnion('kind', [ContentStepSchema, TaskStepSchema])),
});
const ApiErrorSchema = z.looseObject({
  error: z.object({
    code: z.string(),
    requestId: z.string(),
    details: z.record(z.string(), z.unknown()),
  }),
});

async function startApplication(): Promise<{
  app: NestFastifyApplication;
  server: FastifyInstance;
}> {
  const { app } = await createSkillForgeApplication();
  await app.init();
  const instance = app.getHttpAdapter().getInstance() as unknown;
  const server = instance as FastifyInstance;
  await server.ready();
  return { app, server };
}

describe('SkillForge API PostgreSQL flow', () => {
  let app: NestFastifyApplication;
  let server: FastifyInstance;
  const createdSessionIds: string[] = [];
  const createdSequenceIds: string[] = [];

  beforeAll(async () => {
    process.env.LOG_LEVEL = 'silent';
    ({ app, server } = await startApplication());
  });

  afterAll(async () => {
    if (createdSessionIds.length > 0) {
      await app.get(PrismaService).client.learningSession.deleteMany({
        where: { id: { in: createdSessionIds } },
      });
    }
    if (createdSequenceIds.length > 0) {
      await app.get(PrismaService).client.learningSequenceBlueprint.deleteMany({
        where: { id: { in: createdSequenceIds } },
      });
    }
    await app.close();
  });

  it('persists autosave and pause across an application restart and rejects stale revision', async () => {
    const ready = await server.inject({ method: 'GET', url: '/api/v1/health/ready' });
    expect(ready.statusCode).toBe(200);

    const profile = await server.inject({ method: 'GET', url: '/api/v1/profile' });
    expect(profile.statusCode).toBe(200);
    expect(profile.body).toContain('"aiMode":"manual"');

    const topicsResponse = await server.inject({ method: 'GET', url: '/api/v1/topics' });
    expect(topicsResponse.statusCode).toBe(200);
    const topics = z.array(TopicSchema).parse(JSON.parse(topicsResponse.body) as unknown);
    const topic = topics[0];
    expect(topic).toBeDefined();
    if (topic === undefined) return;

    const unsupportedTypeScript = await server.inject({
      method: 'POST',
      url: '/api/v1/sessions/plan',
      payload: {
        mode: 'TRAINING',
        loadMode: 'MINIMAL',
        topicKeys: [topic.key],
        documentationAllowed: true,
        codeLanguage: 'typescript',
      },
    });
    expect(unsupportedTypeScript.statusCode).toBe(422);
    expect(ApiErrorSchema.parse(JSON.parse(unsupportedTypeScript.body) as unknown).error.code).toBe(
      'SESSION_CODE_LANGUAGE_UNAVAILABLE',
    );

    const createResponse = await server.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      payload: {
        mode: 'TRAINING',
        loadMode: 'MINIMAL',
        topicKeys: [topic.key],
        documentationAllowed: false,
        codeLanguage: 'javascript',
      },
    });
    expect(createResponse.statusCode).toBe(201);
    const created = SessionSchema.parse(JSON.parse(createResponse.body) as unknown);
    createdSessionIds.push(created.id);
    expect(created.documentationAllowed).toBe(false);
    expect(created.items.every((sessionItem) => sessionItem.task.hints.length === 0)).toBe(true);

    const startResponse = await server.inject({
      method: 'POST',
      url: `/api/v1/sessions/${created.id}/start`,
    });
    expect(startResponse.statusCode).toBe(201);

    const item = created.items[0];
    expect(item).toBeDefined();
    if (item === undefined) return;
    const initialRevision = item.attempt?.revision ?? 0;
    const marker = `api-integration-${String(Date.now())}`;
    const draft = {
      revision: initialRevision,
      answerText: marker,
      answerCode: '',
      selectedOptions: [],
      selfRating: 3,
      confidence: 50,
      helpLevel: 'NONE',
      hintsUsed: [],
      clientUpdatedAt: new Date().toISOString(),
    };
    const saveResponse = await server.inject({
      method: 'PUT',
      url: `/api/v1/sessions/${created.id}/items/${item.id}/attempt`,
      payload: draft,
    });
    expect(saveResponse.statusCode).toBe(200);
    const saved = AttemptSchema.parse(JSON.parse(saveResponse.body) as unknown);
    expect(saved.revision).toBe(initialRevision + 1);
    expect(saved.answerText).toBe(marker);

    const staleResponse = await server.inject({
      method: 'PUT',
      url: `/api/v1/sessions/${created.id}/items/${item.id}/attempt`,
      payload: { ...draft, answerText: 'stale write' },
    });
    expect(staleResponse.statusCode).toBe(409);
    const staleError = ApiErrorSchema.parse(JSON.parse(staleResponse.body) as unknown);
    expect(staleError.error.code).toBe('ATTEMPT_REVISION_CONFLICT');
    expect(staleError.error.requestId).toMatch(/^req_/u);

    const pauseResponse = await server.inject({
      method: 'POST',
      url: `/api/v1/sessions/${created.id}/pause`,
    });
    expect(pauseResponse.statusCode).toBe(201);
    expect(SessionSchema.parse(JSON.parse(pauseResponse.body) as unknown).status).toBe('PAUSED');

    await app.close();
    ({ app, server } = await startApplication());

    const resumedRead = await server.inject({
      method: 'GET',
      url: `/api/v1/sessions/${created.id}`,
    });
    expect(resumedRead.statusCode).toBe(200);
    const persisted = SessionSchema.parse(JSON.parse(resumedRead.body) as unknown);
    expect(persisted.status).toBe('PAUSED');
    expect(persisted.items[0]?.attempt?.answerText).toBe(marker);

    const resumeResponse = await server.inject({
      method: 'POST',
      url: `/api/v1/sessions/${created.id}/start`,
    });
    expect(resumeResponse.statusCode).toBe(201);
    expect(SessionSchema.parse(JSON.parse(resumeResponse.body) as unknown).status).toBe('ACTIVE');

    const unrelatedTopic = topics.find((candidate) => candidate.key !== topic.key);
    expect(unrelatedTopic).toBeDefined();
    if (unrelatedTopic === undefined) return;
    const returnResponse = await server.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      payload: {
        mode: 'TRAINING',
        loadMode: 'DEEP',
        topicKeys: [unrelatedTopic.key],
        documentationAllowed: false,
        codeLanguage: 'javascript',
        returnFromSessionId: created.id,
      },
    });
    expect(returnResponse.statusCode).toBe(201);
    const returning = SessionSchema.parse(JSON.parse(returnResponse.body) as unknown);
    createdSessionIds.push(returning.id);
    expect(returning.mode).toBe('RETURN');
    expect(returning.loadMode).toBe('RETURN');
    expect(returning.documentationAllowed).toBe(false);
    expect(returning.items).toHaveLength(2);
    expect(returning.items.every((sessionItem) => sessionItem.task.topicKey === topic.key)).toBe(
      true,
    );
    expect(['FIND_BUG', 'CODE']).toContain(returning.items[1]?.task.kind);
    expect(returning.items.every((sessionItem) => sessionItem.task.hints.length === 0)).toBe(true);
  });

  it('persists an interleaved CONTENT/TASK sequence completion across pause and restart', async () => {
    const database = app.get(PrismaService).client;
    const fixture = await database.topic.findFirst({
      where: {
        status: 'ACTIVE',
        contentItems: { some: { status: 'ACTIVE' } },
        tasks: {
          some: {
            status: 'ACTIVE',
            kind: { not: 'CODE' },
            versions: { some: {} },
          },
        },
      },
      select: {
        id: true,
        key: true,
        contentItems: {
          where: { status: 'ACTIVE' },
          orderBy: [{ stableKey: 'asc' }, { version: 'desc' }],
          take: 1,
          select: {
            stableKey: true,
            version: true,
            sourcePack: true,
            sourceVersion: true,
          },
        },
        tasks: {
          where: { status: 'ACTIVE', kind: { not: 'CODE' } },
          orderBy: { stableKey: 'asc' },
          take: 1,
          select: {
            stableKey: true,
            versions: {
              orderBy: { version: 'desc' },
              take: 1,
              select: { version: true, sourcePack: true, sourceVersion: true },
            },
          },
        },
      },
    });
    expect(fixture).toBeDefined();
    const content = fixture?.contentItems[0];
    const task = fixture?.tasks[0];
    const taskVersion = task?.versions[0];
    expect(content).toBeDefined();
    expect(taskVersion).toBeDefined();
    if (!fixture || !content || !task || !taskVersion) return;
    expect(taskVersion).toMatchObject({
      sourcePack: content.sourcePack,
      sourceVersion: content.sourceVersion,
    });

    const sequenceKey = `integration.sequence.${String(Date.now())}`;
    const sequence = await database.learningSequenceBlueprint.create({
      data: {
        key: sequenceKey,
        version: 1,
        topicId: fixture.id,
        schemaVersion: '1.0',
        phase: 'ACQUISITION',
        estimatedMinutes: 5,
        steps: [
          {
            kind: 'CONTENT',
            contentItemKey: content.stableKey,
            version: content.version,
          },
          {
            kind: 'TASK',
            taskKey: task.stableKey,
            version: taskVersion.version,
            purpose: 'PREDICT',
          },
        ],
        completionRule: { requiredSteps: 2, minimumNoHelpSuccesses: 0 },
        sourcePack: content.sourcePack,
        sourceVersion: content.sourceVersion,
        checksum: 'f'.repeat(64),
      },
    });
    createdSequenceIds.push(sequence.id);

    const createResponse = await server.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      payload: {
        mode: 'TRAINING',
        learningPhase: 'ACQUISITION',
        loadMode: 'MINIMAL',
        topicKeys: [fixture.key],
        documentationAllowed: true,
        codeLanguage: 'javascript',
        sequenceKey,
        sequenceVersion: 1,
      },
    });
    expect(createResponse.statusCode).toBe(201);
    const created = SequenceSessionSchema.parse(JSON.parse(createResponse.body) as unknown);
    createdSessionIds.push(created.id);
    expect(created.itemCount).toBe(1);
    expect(created.stepCount).toBe(2);
    expect(created.items[0]?.position).toBe(1);
    expect(created.steps.map((step) => [step.kind, step.position])).toEqual([
      ['CONTENT', 0],
      ['TASK', 1],
    ]);
    const contentStep = created.steps[0];
    expect(contentStep?.kind).toBe('CONTENT');
    if (contentStep?.kind !== 'CONTENT') return;
    expect(contentStep.completedAt).toBeNull();

    const beforeStart = await server.inject({
      method: 'POST',
      url: `/api/v1/sessions/${created.id}/content-steps/${contentStep.id}/complete`,
    });
    expect(beforeStart.statusCode).toBe(422);
    expect(ApiErrorSchema.parse(JSON.parse(beforeStart.body) as unknown).error.code).toBe(
      'SESSION_CONTENT_STEP_NOT_ACTIVE',
    );

    const startResponse = await server.inject({
      method: 'POST',
      url: `/api/v1/sessions/${created.id}/start`,
    });
    expect(startResponse.statusCode).toBe(201);

    const firstComplete = await server.inject({
      method: 'POST',
      url: `/api/v1/sessions/${created.id}/content-steps/${contentStep.id}/complete`,
    });
    expect(firstComplete.statusCode).toBe(201);
    const firstCompletedStep = ContentStepSchema.parse(JSON.parse(firstComplete.body) as unknown);
    expect(firstCompletedStep.completedAt).not.toBeNull();

    const idempotentComplete = await server.inject({
      method: 'POST',
      url: `/api/v1/sessions/${created.id}/content-steps/${contentStep.id}/complete`,
    });
    expect(idempotentComplete.statusCode).toBe(201);
    expect(
      ContentStepSchema.parse(JSON.parse(idempotentComplete.body) as unknown).completedAt,
    ).toBe(firstCompletedStep.completedAt);

    const pauseResponse = await server.inject({
      method: 'POST',
      url: `/api/v1/sessions/${created.id}/pause`,
    });
    expect(pauseResponse.statusCode).toBe(201);

    await app.close();
    ({ app, server } = await startApplication());

    const persistedResponse = await server.inject({
      method: 'GET',
      url: `/api/v1/sessions/${created.id}`,
    });
    expect(persistedResponse.statusCode).toBe(200);
    const persisted = SequenceSessionSchema.parse(JSON.parse(persistedResponse.body) as unknown);
    expect(persisted.status).toBe('PAUSED');
    const persistedContent = persisted.steps[0];
    expect(persistedContent?.kind).toBe('CONTENT');
    if (persistedContent?.kind === 'CONTENT') {
      expect(persistedContent.completedAt).toBe(firstCompletedStep.completedAt);
    }

    const resumeResponse = await server.inject({
      method: 'POST',
      url: `/api/v1/sessions/${created.id}/start`,
    });
    expect(resumeResponse.statusCode).toBe(201);
    expect(SequenceSessionSchema.parse(JSON.parse(resumeResponse.body) as unknown).status).toBe(
      'ACTIVE',
    );
  });
});
