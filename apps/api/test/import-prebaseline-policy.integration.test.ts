import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DEFAULT_USER_ID } from '@skillforge/db';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createSkillForgeApplication } from '../src/bootstrap.js';
import { asJsonInput } from '../src/common/json.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { evidenceKindForTask } from '../src/modules/mastery/mastery.service.js';

const ExportResponseSchema = z.looseObject({ id: z.uuid(), json: z.string() });
const ValidationResponseSchema = z.looseObject({ importId: z.uuid() });
const SuppressedEffectSchema = z.strictObject({
  attemptId: z.uuid(),
  reason: z.literal('PREBASELINE_ROUTING_ONLY'),
  evaluationAction: z.literal('CREATE_AUDIT_RECORD'),
  evidenceAction: z.literal('SUPPRESSED'),
  topicStateAction: z.literal('NO_MUTATION'),
  masteryAction: z.literal('NO_MUTATION'),
  requestedEvidenceItems: z.number().int().nonnegative(),
});
const PreviewSchema = z.looseObject({
  evaluationsToCreate: z.number().int(),
  evidenceToCreate: z.number().int(),
  projectedTopics: z.array(z.unknown()),
  suppressedEvaluationEffects: z.array(SuppressedEffectSchema),
});
const ApplySchema = z.looseObject({
  status: z.literal('APPLIED'),
  affectedTopics: z.number().int().optional(),
  suppressedEvaluationEffects: z.array(SuppressedEffectSchema),
  idempotent: z.boolean(),
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

describe('external evaluator import policy for pre-baseline', () => {
  let app: NestFastifyApplication;
  let server: FastifyInstance;
  let runId: string | null = null;
  let sessionId: string | null = null;
  let bundleId: string | null = null;
  let importId: string | null = null;

  beforeAll(async () => {
    process.env.LOG_LEVEL = 'silent';
    ({ app, server } = await startApplication());
  });

  afterAll(async () => {
    const database = app.get(PrismaService).client;
    if (importId !== null) {
      await database.evaluation.deleteMany({ where: { importBatchId: importId } });
      await database.importBatch.deleteMany({ where: { id: importId } });
    }
    if (bundleId !== null) await database.exportBundle.deleteMany({ where: { id: bundleId } });
    if (sessionId !== null) {
      await database.learningSession.deleteMany({ where: { id: sessionId } });
    }
    if (runId !== null) await database.assessmentRun.deleteMany({ where: { id: runId } });
    await app.close();
  });

  it('creates an audit Evaluation but no Evidence, TopicState, review, or mastery snapshot', async () => {
    const database = app.get(PrismaService).client;
    const blueprint = await database.assessmentBlueprint.findFirst({
      where: { key: 'js-prebaseline-v1' },
      orderBy: { version: 'desc' },
      include: {
        items: {
          orderBy: [{ blockIndex: 'asc' }, { position: 'asc' }],
          take: 1,
          include: {
            taskVersion: { include: { task: { include: { topic: true } } } },
          },
        },
      },
    });
    const blueprintItem = blueprint?.items[0];
    expect(blueprintItem).toBeDefined();
    if (!blueprint || !blueprintItem) return;

    const marker = asJsonInput({ schemaVersion: '2.0', kind: 'ADAPTIVE_PREBASELINE' });
    const completedAt = new Date();
    const fixture = await database.$transaction(async (transaction) => {
      const run = await transaction.assessmentRun.create({
        data: {
          userId: DEFAULT_USER_ID,
          blueprintId: blueprint.id,
          status: 'COMPLETED',
          startedAt: completedAt,
          completedAt,
          snapshot: marker,
        },
      });
      const session = await transaction.learningSession.create({
        data: {
          userId: DEFAULT_USER_ID,
          assessmentRunId: run.id,
          mode: 'ASSESSMENT',
          learningPhase: 'CALIBRATION',
          loadMode: 'MINIMAL',
          title: 'Import suppression integration fixture',
          goal: 'Audit-only external evaluation',
          status: 'COMPLETED',
          planSnapshot: marker,
          startedAt: completedAt,
          completedAt,
        },
      });
      const item = await transaction.sessionItem.create({
        data: {
          sessionId: session.id,
          taskVersionId: blueprintItem.taskVersionId,
          position: 0,
          purpose: 'PREBASELINE',
          required: false,
        },
      });
      const attempt = await transaction.attempt.create({
        data: {
          userId: DEFAULT_USER_ID,
          sessionId: session.id,
          sessionItemId: item.id,
          taskVersionId: blueprintItem.taskVersionId,
          sequence: 1,
          answerText: 'Интеграционный ответ для внешнего audit.',
          submittedAt: completedAt,
        },
      });
      return { run, session, attempt };
    });
    runId = fixture.run.id;
    sessionId = fixture.session.id;
    const topic = blueprintItem.taskVersion.task.topic;
    const topicStateBefore = await database.topicState.findUnique({
      where: { userId_topicId: { userId: DEFAULT_USER_ID, topicId: topic.id } },
    });
    const reviewBefore = await database.reviewSchedule.findMany({
      where: { userId: DEFAULT_USER_ID, topicId: topic.id },
      orderBy: { id: 'asc' },
    });

    const exportedResponse = await server.inject({
      method: 'POST',
      url: '/api/v1/exports',
      payload: { bundleType: 'assessment-run', scope: { id: fixture.run.id } },
    });
    expect(exportedResponse.statusCode).toBe(201);
    const exported = ExportResponseSchema.parse(JSON.parse(exportedResponse.body) as unknown);
    bundleId = exported.id;
    const analysis = {
      schemaVersion: '1.0',
      contract: 'skillforge-analysis-v1',
      sourceBundleId: exported.id,
      evaluator: {
        kind: 'external-ai',
        model: 'fake-integration-evaluator',
        analyzedAt: new Date().toISOString(),
      },
      attemptEvaluations: [
        {
          attemptId: fixture.attempt.id,
          overallScore: 20,
          passed: false,
          reliability: 0.6,
          dimensions: { TRACE: 20 },
          feedbackMarkdown: 'External audit feedback.',
          misconceptions: [],
          topicEvidence: [
            {
              topicKey: topic.key,
              kind: evidenceKindForTask(blueprintItem.taskVersion.task.kind),
              score: 20,
            },
          ],
        },
      ],
      recommendations: [],
      summary: 'Audit only.',
      warnings: [],
    };
    const validatedResponse = await server.inject({
      method: 'POST',
      url: '/api/v1/imports/validate',
      payload: { payload: JSON.stringify(analysis), source: 'integration-prebaseline-policy' },
    });
    expect(validatedResponse.statusCode).toBe(201);
    const validated = ValidationResponseSchema.parse(JSON.parse(validatedResponse.body) as unknown);
    importId = validated.importId;

    const previewResponse = await server.inject({
      method: 'POST',
      url: `/api/v1/imports/${validated.importId}/preview`,
    });
    expect(previewResponse.statusCode).toBe(201);
    const preview = PreviewSchema.parse(JSON.parse(previewResponse.body) as unknown);
    expect(preview).toMatchObject({
      evaluationsToCreate: 1,
      evidenceToCreate: 0,
      projectedTopics: [],
      suppressedEvaluationEffects: [
        {
          attemptId: fixture.attempt.id,
          evaluationAction: 'CREATE_AUDIT_RECORD',
          evidenceAction: 'SUPPRESSED',
          topicStateAction: 'NO_MUTATION',
          masteryAction: 'NO_MUTATION',
        },
      ],
    });

    const applyResponse = await server.inject({
      method: 'POST',
      url: `/api/v1/imports/${validated.importId}/apply`,
    });
    expect(applyResponse.statusCode).toBe(201);
    const applied = ApplySchema.parse(JSON.parse(applyResponse.body) as unknown);
    expect(applied).toMatchObject({
      status: 'APPLIED',
      affectedTopics: 0,
      idempotent: false,
      suppressedEvaluationEffects: [{ attemptId: fixture.attempt.id }],
    });
    expect(await database.evaluation.count({ where: { importBatchId: validated.importId } })).toBe(
      1,
    );
    expect(
      await database.evidence.count({
        where: { evaluation: { importBatchId: validated.importId } },
      }),
    ).toBe(0);
    expect(
      await database.metricSnapshot.count({ where: { scope: `import:${validated.importId}` } }),
    ).toBe(0);
    expect(
      await database.topicState.findUnique({
        where: { userId_topicId: { userId: DEFAULT_USER_ID, topicId: topic.id } },
      }),
    ).toEqual(topicStateBefore);
    expect(
      await database.reviewSchedule.findMany({
        where: { userId: DEFAULT_USER_ID, topicId: topic.id },
        orderBy: { id: 'asc' },
      }),
    ).toEqual(reviewBefore);

    const repeatedResponse = await server.inject({
      method: 'POST',
      url: `/api/v1/imports/${validated.importId}/apply`,
    });
    expect(repeatedResponse.statusCode).toBe(201);
    expect(ApplySchema.parse(JSON.parse(repeatedResponse.body) as unknown)).toMatchObject({
      idempotent: true,
      suppressedEvaluationEffects: [{ attemptId: fixture.attempt.id }],
    });
    expect(await database.evaluation.count({ where: { importBatchId: validated.importId } })).toBe(
      1,
    );
  });
});
