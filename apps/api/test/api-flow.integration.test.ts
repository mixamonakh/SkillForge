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
});
