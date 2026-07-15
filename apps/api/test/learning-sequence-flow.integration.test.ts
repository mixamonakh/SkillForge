import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  createPrismaClient,
  DEFAULT_USER_ID,
  ensureDefaultUser,
  importContentPack,
  type SkillForgePrismaClient,
} from '@skillforge/db';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createSkillForgeApplication } from '../src/bootstrap.js';

const PACK_KEY = 'js-core-training-v1';
const PACK_VERSION = '1.0.0';
const TOPIC_KEY = 'cs.mutability';
const ACQUISITION_SEQUENCE_KEY = 'cs.mutability.training.acquisition-v1';
const CONSOLIDATION_SEQUENCE_KEY = 'cs.mutability.training.consolidation-v1';
const ACQUISITION_TASK_KEYS = [
  'cs.mutability.training.cart-shallow-trace-001',
  'cs.mutability.training.board-mutation-debug-001',
  'cs.mutability.training.update-locale-guided-001',
  'cs.mutability.training.increment-line-independent-001',
] as const;
const ACQUISITION_CONTENT_KEYS = [
  'cs.mutability.training.canonical-boundaries',
  'cs.mutability.training.worked-contact-update',
  'cs.mutability.training.primitive-object-contrast',
  'cs.mutability.training.shallow-copy-mistake',
] as const;

const AttemptSchema = z.looseObject({
  id: z.uuid(),
  revision: z.number().int().nonnegative(),
  submittedAt: z.iso.datetime().nullable(),
});
const TaskItemSchema = z.looseObject({
  id: z.uuid(),
  position: z.number().int().nonnegative(),
  task: z.looseObject({ stableKey: z.string(), kind: z.string() }),
  attempt: AttemptSchema,
});
const ContentStepSchema = z.looseObject({
  kind: z.literal('CONTENT'),
  id: z.uuid(),
  position: z.number().int().nonnegative(),
  required: z.boolean(),
  completedAt: z.iso.datetime().nullable(),
  content: z.looseObject({ stableKey: z.string(), version: z.number().int().positive() }),
});
const TaskStepSchema = z.looseObject({
  kind: z.literal('TASK'),
  id: z.uuid(),
  position: z.number().int().nonnegative(),
  required: z.boolean(),
  taskItem: TaskItemSchema,
});
const SequenceSessionSchema = z.looseObject({
  id: z.uuid(),
  status: z.string(),
  learningPhase: z.string(),
  itemCount: z.number().int(),
  stepCount: z.number().int(),
  sequence: z.looseObject({
    key: z.string(),
    version: z.number().int().positive(),
    completionRule: z.looseObject({
      requiredSteps: z.number().int().positive(),
      minimumNoHelpSuccesses: z.number().int().nonnegative(),
    }),
  }),
  items: z.array(TaskItemSchema),
  steps: z.array(z.discriminatedUnion('kind', [ContentStepSchema, TaskStepSchema])),
});
const RecommendationSchema = z.looseObject({
  topicKey: z.string().optional(),
  learningPhase: z.string().optional(),
  sequenceKey: z.string().optional(),
  mode: z.string(),
  loadMode: z.string(),
});
const ApiErrorSchema = z.looseObject({ error: z.looseObject({ code: z.string() }) });
const CapabilityProfileSchema = z.looseObject({
  topicKey: z.string(),
  capabilities: z.looseObject({
    TRACE: z.looseObject({
      coverage: z.string(),
      evidenceCount: z.number().int(),
      noHelpSuccessCount: z.number().int(),
    }),
    CODE_PRODUCTION: z.looseObject({
      coverage: z.string(),
      evidenceCount: z.number().int(),
    }),
  }),
});

const configuredDatabaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://skillforge:skillforge@127.0.0.1:5432/skillforge?schema=public';
const adminUrl = new URL(configuredDatabaseUrl);
adminUrl.searchParams.delete('schema');
adminUrl.searchParams.delete('options');
const schemaName = `sfv2_sequence_${randomUUID().replaceAll('-', '')}`;
const quotedSchemaName = `"${schemaName}"`;
const isolatedUrl = new URL(adminUrl);
isolatedUrl.searchParams.set('schema', schemaName);
const migrationRoot = path.resolve(process.cwd(), '../../packages/db/prisma/migrations');
const baselinePackPath = path.resolve(process.cwd(), '../../content/packs/js-baseline-v1');
const trainingPackPath = path.resolve(process.cwd(), '../../content/packs/js-core-training-v1');

let app: NestFastifyApplication | undefined;
let server: FastifyInstance | undefined;
let admin: SkillForgePrismaClient | undefined;
let database: SkillForgePrismaClient | undefined;
const originalDatabaseUrl = process.env.DATABASE_URL;

async function applyMigrations(client: SkillForgePrismaClient): Promise<void> {
  const directories = (await readdir(migrationRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
  for (const directory of directories) {
    const sql = await readFile(path.join(migrationRoot, directory, 'migration.sql'), 'utf8');
    await client.$executeRawUnsafe(`SET search_path TO ${quotedSchemaName};\n${sql}`);
  }
}

async function inject(options: InjectOptions) {
  if (server === undefined) throw new Error('Integration server is not ready');
  return server.inject(options);
}

function attemptDraft(input: {
  revision: number;
  answerText?: string;
  answerCode?: string;
  helpLevel: 'NONE' | 'HINT';
}) {
  return {
    revision: input.revision,
    answerText: input.answerText ?? '',
    answerCode: input.answerCode ?? '',
    selectedOptions: [],
    selfRating: 4,
    confidence: 70,
    helpLevel: input.helpLevel,
    hintsUsed: input.helpLevel === 'HINT' ? ['isolated-flow-hint'] : [],
    clientUpdatedAt: new Date().toISOString(),
  };
}

function successfulRunner(testCount: number) {
  return {
    requestId: `sequence-flow-${randomUUID()}`,
    status: 'passed',
    tests: Array.from({ length: testCount }, (_, index) => ({
      name: `deterministic-${String(index + 1)}`,
      passed: true,
    })),
    console: [],
    durationMs: 5,
  };
}

async function saveAttempt(
  sessionId: string,
  item: z.infer<typeof TaskItemSchema>,
  input: ReturnType<typeof attemptDraft>,
) {
  const response = await inject({
    method: 'PUT',
    url: `/api/v1/sessions/${sessionId}/items/${item.id}/attempt`,
    payload: input,
  });
  expect(response.statusCode).toBe(200);
  return AttemptSchema.parse(JSON.parse(response.body) as unknown);
}

async function submitAttempt(attemptId: string) {
  const response = await inject({
    method: 'POST',
    url: `/api/v1/attempts/${attemptId}/submit`,
  });
  expect(response.statusCode).toBe(201);
  return z
    .looseObject({ attempt: AttemptSchema, evaluation: z.unknown().nullable() })
    .parse(JSON.parse(response.body) as unknown);
}

describe('js-core-training-v1 isolated acquisition flow', () => {
  beforeAll(async () => {
    process.env.LOG_LEVEL = 'silent';
    admin = createPrismaClient(adminUrl.toString());
    await admin.$executeRawUnsafe(`CREATE SCHEMA ${quotedSchemaName}`);
    database = createPrismaClient(isolatedUrl.toString());
    await applyMigrations(database);
    await ensureDefaultUser(database);
    await importContentPack(database, baselinePackPath);
    await importContentPack(database, trainingPackPath);

    process.env.DATABASE_URL = isolatedUrl.toString();
    const created = await createSkillForgeApplication();
    app = created.app;
    await app.init();
    server = app.getHttpAdapter().getInstance();
    await server.ready();
  }, 30_000);

  afterAll(async () => {
    await app?.close();
    await database?.$disconnect();
    if (admin !== undefined) {
      await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${quotedSchemaName} CASCADE`);
      await admin.$disconnect();
    }
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it('keeps DRAFT hidden, then completes only the isolated acquisition rows end to end', async () => {
    if (database === undefined) throw new Error('Integration database is not ready');

    const canonicalPack = await database.contentPack.findUniqueOrThrow({
      where: { key_version: { key: PACK_KEY, version: PACK_VERSION } },
    });
    expect(canonicalPack.status).toBe('DRAFT');
    await expect(
      database.task.count({
        where: { stableKey: { in: [...ACQUISITION_TASK_KEYS] }, status: 'DRAFT' },
      }),
    ).resolves.toBe(4);
    await expect(
      database.contentItem.count({
        where: { stableKey: { in: [...ACQUISITION_CONTENT_KEYS] }, status: 'DRAFT' },
      }),
    ).resolves.toBe(4);

    const hiddenRecommendationResponse = await inject({
      method: 'GET',
      url: '/api/v1/sessions/recommendation',
    });
    expect(hiddenRecommendationResponse.statusCode).toBe(200);
    const hiddenRecommendation = RecommendationSchema.parse(
      JSON.parse(hiddenRecommendationResponse.body) as unknown,
    );
    expect(hiddenRecommendation.sequenceKey).not.toBe(ACQUISITION_SEQUENCE_KEY);

    const hiddenPlan = await inject({
      method: 'POST',
      url: '/api/v1/sessions/plan',
      payload: {
        mode: 'TRAINING',
        loadMode: 'NORMAL',
        topicKeys: [TOPIC_KEY],
        documentationAllowed: true,
        codeLanguage: 'javascript',
        learningPhase: 'ACQUISITION',
        sequenceKey: ACQUISITION_SEQUENCE_KEY,
      },
    });
    expect(hiddenPlan.statusCode).toBe(404);
    expect(ApiErrorSchema.parse(JSON.parse(hiddenPlan.body) as unknown).error.code).toBe(
      'SESSION_SEQUENCE_NOT_FOUND',
    );

    const topic = await database.topic.findUniqueOrThrow({ where: { key: TOPIC_KEY } });
    await expect(
      database.topicState.count({ where: { userId: DEFAULT_USER_ID, topicId: topic.id } }),
    ).resolves.toBe(0);
    const prerequisite = await database.topicDependency.findFirstOrThrow({
      where: { topicId: topic.id },
      select: { prerequisiteId: true },
    });
    await database.topicState.create({
      data: {
        userId: DEFAULT_USER_ID,
        topicId: prerequisite.prerequisiteId,
        status: 'SOLID',
        masteryEstimate: 75,
        masteryConfidence: 60,
        evidenceWeight: 2,
        evidenceCount: 2,
        independentDays: 2,
        taskKindCount: 2,
        needsReview: false,
        lastEvidenceAt: new Date(),
        algorithmVersion: 'mastery-v1.0',
        explanation: { fixture: 'isolated prerequisite only' },
      },
    });

    const [activatedPack, activatedTasks, activatedContent] = await database.$transaction([
      database.contentPack.update({
        where: { key_version: { key: PACK_KEY, version: PACK_VERSION } },
        data: { status: 'ACTIVE' },
      }),
      database.task.updateMany({
        where: { stableKey: { in: [...ACQUISITION_TASK_KEYS] } },
        data: { status: 'ACTIVE' },
      }),
      database.contentItem.updateMany({
        where: {
          stableKey: { in: [...ACQUISITION_CONTENT_KEYS] },
          sourcePack: PACK_KEY,
          sourceVersion: PACK_VERSION,
        },
        data: { status: 'ACTIVE' },
      }),
    ]);
    expect(activatedPack.status).toBe('ACTIVE');
    expect(activatedTasks.count).toBe(4);
    expect(activatedContent.count).toBe(4);

    const unavailableConsolidation = await inject({
      method: 'POST',
      url: '/api/v1/sessions/plan',
      payload: {
        mode: 'REVIEW',
        loadMode: 'NORMAL',
        topicKeys: [TOPIC_KEY],
        documentationAllowed: true,
        codeLanguage: 'javascript',
        learningPhase: 'CONSOLIDATION',
        sequenceKey: CONSOLIDATION_SEQUENCE_KEY,
      },
    });
    expect(unavailableConsolidation.statusCode).toBe(404);
    expect(
      ApiErrorSchema.parse(JSON.parse(unavailableConsolidation.body) as unknown).error.code,
    ).toBe('SESSION_SEQUENCE_NOT_FOUND');

    const recommendationResponse = await inject({
      method: 'GET',
      url: '/api/v1/sessions/recommendation',
    });
    expect(recommendationResponse.statusCode).toBe(200);
    const recommendation = RecommendationSchema.parse(
      JSON.parse(recommendationResponse.body) as unknown,
    );
    expect(recommendation).toMatchObject({
      topicKey: TOPIC_KEY,
      learningPhase: 'ACQUISITION',
      sequenceKey: ACQUISITION_SEQUENCE_KEY,
      mode: 'TRAINING',
    });

    const createResponse = await inject({
      method: 'POST',
      url: '/api/v1/sessions',
      payload: {
        mode: recommendation.mode,
        loadMode: recommendation.loadMode,
        topicKeys: [recommendation.topicKey],
        documentationAllowed: true,
        codeLanguage: 'javascript',
        learningPhase: recommendation.learningPhase,
        sequenceKey: recommendation.sequenceKey,
      },
    });
    expect(createResponse.statusCode).toBe(201);
    const created = SequenceSessionSchema.parse(JSON.parse(createResponse.body) as unknown);
    expect(created).toMatchObject({
      status: 'DRAFT',
      learningPhase: 'ACQUISITION',
      itemCount: 4,
      stepCount: 8,
      sequence: {
        key: ACQUISITION_SEQUENCE_KEY,
        version: 1,
        completionRule: { requiredSteps: 8, minimumNoHelpSuccesses: 1 },
      },
    });
    expect(
      created.steps.map((step) =>
        step.kind === 'CONTENT'
          ? `CONTENT:${step.content.stableKey}`
          : `TASK:${step.taskItem.task.stableKey}`,
      ),
    ).toEqual([
      `CONTENT:${ACQUISITION_CONTENT_KEYS[0]}`,
      `CONTENT:${ACQUISITION_CONTENT_KEYS[1]}`,
      `TASK:${ACQUISITION_TASK_KEYS[0]}`,
      `CONTENT:${ACQUISITION_CONTENT_KEYS[2]}`,
      `TASK:${ACQUISITION_TASK_KEYS[1]}`,
      `TASK:${ACQUISITION_TASK_KEYS[2]}`,
      `TASK:${ACQUISITION_TASK_KEYS[3]}`,
      `CONTENT:${ACQUISITION_CONTENT_KEYS[3]}`,
    ]);

    const startResponse = await inject({
      method: 'POST',
      url: `/api/v1/sessions/${created.id}/start`,
    });
    expect(startResponse.statusCode).toBe(201);

    for (const step of created.steps) {
      if (step.kind !== 'CONTENT') continue;
      const response = await inject({
        method: 'POST',
        url: `/api/v1/sessions/${created.id}/content-steps/${step.id}/complete`,
      });
      expect(response.statusCode).toBe(201);
      expect(
        ContentStepSchema.parse(JSON.parse(response.body) as unknown).completedAt,
      ).not.toBeNull();
    }

    const itemByKey = new Map(created.items.map((item) => [item.task.stableKey, item]));
    const predictItem = itemByKey.get(ACQUISITION_TASK_KEYS[0]);
    const debugItem = itemByKey.get(ACQUISITION_TASK_KEYS[1]);
    const guidedItem = itemByKey.get(ACQUISITION_TASK_KEYS[2]);
    const independentItem = itemByKey.get(ACQUISITION_TASK_KEYS[3]);
    expect(predictItem).toBeDefined();
    expect(debugItem).toBeDefined();
    expect(guidedItem).toBeDefined();
    expect(independentItem).toBeDefined();
    if (!predictItem || !debugItem || !guidedItem || !independentItem) return;

    const firstPredict = await saveAttempt(
      created.id,
      predictItem,
      attemptDraft({
        revision: predictItem.attempt.revision,
        answerText: '2\ntrue',
        helpLevel: 'HINT',
      }),
    );
    const firstPredictResult = await submitAttempt(firstPredict.id);
    expect(firstPredictResult.evaluation).toMatchObject({ score: 100, passed: true });

    const debug = await saveAttempt(
      created.id,
      debugItem,
      attemptDraft({
        revision: debugItem.attempt.revision,
        answerText:
          'Внешний spread сохраняет общую ссылку на tasks и элементы; копировать нужно изменяемый путь.',
        helpLevel: 'HINT',
      }),
    );
    const debugResult = await submitAttempt(debug.id);
    expect(debugResult.evaluation).toBeNull();

    const guidedCode =
      'export function updateLocale(settings, locale) { return { ...settings, preferences: { ...settings.preferences, locale } }; }';
    const guided = await saveAttempt(
      created.id,
      guidedItem,
      attemptDraft({
        revision: guidedItem.attempt.revision,
        answerCode: guidedCode,
        helpLevel: 'HINT',
      }),
    );
    const guidedRun = await inject({
      method: 'POST',
      url: `/api/v1/attempts/${guided.id}/run-code`,
      payload: { revision: guided.revision, runnerResult: successfulRunner(2) },
    });
    expect(guidedRun.statusCode).toBe(201);
    const guidedResult = await submitAttempt(guided.id);
    expect(guidedResult.evaluation).toMatchObject({
      score: null,
      passed: null,
      coverage: {
        evaluatedDimensions: ['CODE_CORRECTNESS'],
        unsupportedDimensions: ['EDGE_CASES'],
      },
    });

    const independentCode =
      'export function incrementLineQuantity(state, lineId) { const found = state.lines.some((line) => line.id === lineId); if (!found) return state; return { ...state, lines: state.lines.map((line) => line.id === lineId ? { ...line, quantity: line.quantity + 1 } : line) }; }';
    const independent = await saveAttempt(
      created.id,
      independentItem,
      attemptDraft({
        revision: independentItem.attempt.revision,
        answerCode: independentCode,
        helpLevel: 'HINT',
      }),
    );
    const independentRun = await inject({
      method: 'POST',
      url: `/api/v1/attempts/${independent.id}/run-code`,
      payload: { revision: independent.revision, runnerResult: successfulRunner(3) },
    });
    expect(independentRun.statusCode).toBe(201);
    const independentResult = await submitAttempt(independent.id);
    expect(independentResult.evaluation).toMatchObject({ score: null, passed: null });

    const blockedCompletion = await inject({
      method: 'POST',
      url: `/api/v1/sessions/${created.id}/complete`,
      payload: { loadFeedback: 'RIGHT' },
    });
    expect(blockedCompletion.statusCode).toBe(422);
    expect(ApiErrorSchema.parse(JSON.parse(blockedCompletion.body) as unknown).error.code).toBe(
      'SESSION_COMPLETION_RULE_NOT_MET',
    );

    const retryPredict = await saveAttempt(
      created.id,
      predictItem,
      attemptDraft({
        revision: firstPredictResult.attempt.revision,
        answerText: '2\ntrue',
        helpLevel: 'NONE',
      }),
    );
    const retryPredictResult = await submitAttempt(retryPredict.id);
    expect(retryPredictResult.evaluation).toMatchObject({ score: 100, passed: true });

    const completedResponse = await inject({
      method: 'POST',
      url: `/api/v1/sessions/${created.id}/complete`,
      payload: { loadFeedback: 'RIGHT', summary: 'Disposable acquisition flow' },
    });
    expect(completedResponse.statusCode).toBe(201);
    expect(SequenceSessionSchema.parse(JSON.parse(completedResponse.body) as unknown).status).toBe(
      'COMPLETED',
    );

    const profileResponse = await inject({
      method: 'GET',
      url: `/api/v1/topics/${TOPIC_KEY}/capability-profile`,
    });
    expect(profileResponse.statusCode).toBe(200);
    const profile = CapabilityProfileSchema.parse(JSON.parse(profileResponse.body) as unknown);
    expect(profile).toMatchObject({
      topicKey: TOPIC_KEY,
      capabilities: {
        TRACE: { coverage: 'INSUFFICIENT', evidenceCount: 1, noHelpSuccessCount: 1 },
        CODE_PRODUCTION: { coverage: 'SUFFICIENT', evidenceCount: 2 },
      },
    });

    await expect(
      database.evidence.count({ where: { userId: DEFAULT_USER_ID, topicId: topic.id } }),
    ).resolves.toBe(4);
    await expect(
      database.topicState.findUnique({
        where: { userId_topicId: { userId: DEFAULT_USER_ID, topicId: topic.id } },
      }),
    ).resolves.toMatchObject({
      status: 'UNSTABLE',
      evidenceCount: 3,
      needsReview: false,
      algorithmVersion: 'mastery-v1.0',
    });
    await expect(
      database.reviewSchedule.findFirst({
        where: { userId: DEFAULT_USER_ID, topicId: topic.id, completedAt: null },
      }),
    ).resolves.toMatchObject({
      intervalDays: 6,
      reason: 'successful-independent-attempt',
      algorithmVersion: 'review-v1.0',
    });
  });
});
