import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createSkillForgeApplication } from '../src/bootstrap.js';
import { PrismaService } from '../src/database/prisma.service.js';

const TaskItemSchema = z.looseObject({
  id: z.uuid(),
  task: z.looseObject({
    stableKey: z.string(),
    starterCode: z.string().nullable(),
  }),
  attempt: z.looseObject({ id: z.uuid(), revision: z.number().int() }),
});

const NextResponseSchema = z.looseObject({
  flow: z.literal('ADAPTIVE_PREBASELINE'),
  runId: z.uuid(),
  sessionId: z.uuid(),
  status: z.enum(['ACTIVE', 'PAUSED', 'COMPLETED']),
  blueprint: z.looseObject({
    key: z.literal('js-prebaseline-v1'),
    contentStatus: z.enum(['DRAFT', 'ACTIVE']),
    reviewState: z.enum(['NEEDS_HUMAN_REVIEW', 'APPROVED']),
  }),
  progress: z.looseObject({
    selected: z.number().int(),
    answered: z.number().int(),
    totalCandidates: z.number().int(),
  }),
  decision: z.enum(['NEXT_ITEM', 'STOP_AND_ROUTE', 'ASSESSMENT_COMPLETE']),
  item: TaskItemSchema.nullable(),
  explanation: z.string(),
  dataSufficiency: z.enum(['LOW', 'ROUTING_SUFFICIENT', 'DEEP_SUFFICIENT']),
  recommendedPhase: z.enum(['ACQUISITION', 'CONSOLIDATION', 'TRANSFER']).nullable(),
  routingProfile: z.unknown().nullable(),
});

async function startApplication(): Promise<{
  app: NestFastifyApplication;
  server: FastifyInstance;
}> {
  const { app } = await createSkillForgeApplication();
  await app.init();
  const server = app.getHttpAdapter().getInstance();
  await server.ready();
  return { app, server };
}

describe('adaptive pre-baseline PostgreSQL flow', () => {
  let app: NestFastifyApplication;
  let server: FastifyInstance;
  let runId: string | null = null;

  beforeAll(async () => {
    process.env.LOG_LEVEL = 'silent';
    ({ app, server } = await startApplication());
  });

  afterAll(async () => {
    if (runId !== null) {
      const database = app.get(PrismaService).client;
      await database.learningSession.deleteMany({ where: { assessmentRunId: runId } });
      await database.assessmentRun.deleteMany({ where: { id: runId } });
    }
    await app.close();
  });

  it('persists dynamic selections, stops after two errors, and never mutates TopicState', async () => {
    const database = app.get(PrismaService).client;
    const existing = await database.assessmentRun.count({
      where: {
        blueprint: { key: 'js-prebaseline-v1' },
        status: { in: ['DRAFT', 'ACTIVE', 'PAUSED'] },
      },
    });
    expect(existing).toBe(0);
    const evidenceBefore = await database.evidence.count();
    const topicStatesBefore = JSON.stringify(
      await database.topicState.findMany({ orderBy: { id: 'asc' } }),
    );

    const startedResponse = await server.inject({
      method: 'POST',
      url: '/api/v1/assessments/prebaseline/start',
    });
    expect(startedResponse.statusCode).toBe(201);
    let current = NextResponseSchema.parse(JSON.parse(startedResponse.body) as unknown);
    runId = current.runId;
    expect(current).toMatchObject({
      status: 'ACTIVE',
      decision: 'NEXT_ITEM',
      blueprint: {
        contentStatus: 'DRAFT',
        reviewState: 'NEEDS_HUMAN_REVIEW',
      },
      progress: { selected: 1, answered: 0, totalCandidates: 18 },
    });
    expect(current.item).not.toBeNull();
    const firstItemId = current.item?.id;

    const paused = await server.inject({
      method: 'POST',
      url: `/api/v1/assessment-runs/${current.runId}/pause`,
    });
    expect(paused.statusCode).toBe(201);
    expect(JSON.parse(paused.body)).toMatchObject({
      flow: 'ADAPTIVE_PREBASELINE',
      status: 'PAUSED',
      items: [{ id: firstItemId }],
    });
    const resumed = await server.inject({
      method: 'POST',
      url: `/api/v1/assessment-runs/${current.runId}/resume`,
    });
    expect(resumed.statusCode).toBe(201);
    expect(JSON.parse(resumed.body)).toMatchObject({ status: 'ACTIVE' });
    const idempotent = await server.inject({
      method: 'POST',
      url: `/api/v1/assessments/${current.runId}/next`,
    });
    current = NextResponseSchema.parse(JSON.parse(idempotent.body) as unknown);
    expect(current.item?.id).toBe(firstItemId);
    expect(current.explanation).toMatch(/незавершённый/iu);

    const submitWrong = async (state: z.infer<typeof NextResponseSchema>) => {
      const item = state.item;
      expect(item).not.toBeNull();
      if (item === null) throw new Error('Expected active pre-baseline item');
      const saved = await server.inject({
        method: 'PUT',
        url: `/api/v1/sessions/${state.sessionId}/items/${item.id}/attempt`,
        payload: {
          revision: item.attempt.revision,
          answerText: 'неверный вывод',
          answerCode: item.task.starterCode ?? '',
          selectedOptions: [],
          selfRating: null,
          confidence: null,
          helpLevel: 'NONE',
          hintsUsed: [],
          clientUpdatedAt: new Date().toISOString(),
        },
      });
      expect(saved.statusCode).toBe(200);
      const savedAttempt = z
        .looseObject({ id: z.uuid() })
        .parse(JSON.parse(saved.body) as unknown);
      const submitted = await server.inject({
        method: 'POST',
        url: `/api/v1/attempts/${savedAttempt.id}/submit`,
      });
      expect(submitted.statusCode).toBe(201);
    };

    await submitWrong(current);
    const secondResponse = await server.inject({
      method: 'POST',
      url: `/api/v1/assessments/${current.runId}/next`,
    });
    current = NextResponseSchema.parse(JSON.parse(secondResponse.body) as unknown);
    expect(current.decision).toBe('NEXT_ITEM');
    expect(current.item?.id).not.toBe(firstItemId);
    expect(current.progress).toMatchObject({ selected: 2, answered: 1 });

    await submitWrong(current);
    const stopResponse = await server.inject({
      method: 'POST',
      url: `/api/v1/assessments/${current.runId}/next`,
    });
    expect(stopResponse.statusCode).toBe(201);
    const stopped = NextResponseSchema.parse(JSON.parse(stopResponse.body) as unknown);
    expect(stopped).toMatchObject({
      status: 'COMPLETED',
      decision: 'STOP_AND_ROUTE',
      item: null,
      dataSufficiency: 'ROUTING_SUFFICIENT',
      recommendedPhase: 'ACQUISITION',
      progress: { selected: 2, answered: 2 },
    });
    expect(stopped.routingProfile).toMatchObject({ sufficientForRouting: true });

    const repeatedStop = await server.inject({
      method: 'POST',
      url: `/api/v1/assessments/${current.runId}/next`,
    });
    expect(NextResponseSchema.parse(JSON.parse(repeatedStop.body) as unknown)).toMatchObject({
      decision: 'STOP_AND_ROUTE',
      progress: { selected: 2, answered: 2 },
    });
    const persistedItems = await database.sessionItem.count({
      where: { session: { assessmentRunId: current.runId } },
    });
    expect(persistedItems).toBe(2);

    const profileResponse = await server.inject({
      method: 'GET',
      url: `/api/v1/assessments/${current.runId}/routing-profile`,
    });
    expect(profileResponse.statusCode).toBe(200);
    const profile = JSON.parse(profileResponse.body) as unknown;
    expect(profile).toMatchObject({
      assessmentRunId: current.runId,
      sufficientForRouting: true,
      topicRoutes: [
        { recommendedPhase: 'ACQUISITION', primaryGap: 'TRACE' },
        { recommendedPhase: 'ACQUISITION', primaryGap: 'TRACE' },
      ],
    });
    expect(JSON.stringify(profile)).not.toMatch(/mastery|passed|pass\/fail/iu);
    expect(await database.evidence.count()).toBe(evidenceBefore);
    expect(JSON.stringify(await database.topicState.findMany({ orderBy: { id: 'asc' } }))).toBe(
      topicStatesBefore,
    );
  });
});
