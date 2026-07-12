import { createHash, randomUUID } from 'node:crypto';

import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ExportBundleV1,
  JsonValueSchema,
  createExportBundleMarkdown,
  stringifyJsonDocument,
  type ExportAttemptV1,
  type ExportTopicV1,
} from '@skillforge/contracts';
import { DEFAULT_USER_ID, Prisma, type TaskKind } from '@skillforge/db';

import { ApiError, invalidState, notFound } from '../../common/api-error.js';
import { asJsonInput } from '../../common/json.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { CreateExportDto } from './import-export.dto.js';
import { parseCreateExportRequest, type CreateExportRequest } from './export-scope.js';

const FREE_TEXT_KINDS: TaskKind[] = [
  'EXPLAIN',
  'PREDICT_OUTPUT',
  'FIND_BUG',
  'COMPARE_SOLUTIONS',
  'AI_REVIEW',
];

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

@Injectable()
export class ExportService {
  public constructor(private readonly database: PrismaService) {}

  public async create(input: CreateExportDto): Promise<unknown> {
    const request = parseCreateExportRequest(input);
    const user = await this.database.client.user.findUnique({
      where: { id: DEFAULT_USER_ID },
      include: { settings: true },
    });
    if (!user?.settings) throw notFound('PROFILE_NOT_FOUND', 'Локальный профиль не найден');
    const where = await this.attemptScope(request);
    const attempts = await this.database.client.attempt.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: {
        taskVersion: { include: { task: { include: { topic: true } } } },
        evaluations: {
          where: { evaluatorType: { in: ['EXACT_MATCH', 'TEST_RUNNER'] }, supersededBy: null },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (request.bundleType !== 'profile' && attempts.length === 0) {
      throw new ApiError(
        'EXPORT_SCOPE_EMPTY',
        'В выбранном scope нет попыток для экспорта',
        HttpStatus.BAD_REQUEST,
        { bundleType: request.bundleType },
      );
    }
    const topicKeys = new Set(attempts.map((attempt) => attempt.taskVersion.task.topic.key));
    if (request.bundleType === 'profile') {
      const activeTopics = await this.database.client.topic.findMany({
        where: { status: 'ACTIVE' },
        select: { key: true },
      });
      for (const topic of activeTopics) topicKeys.add(topic.key);
    }
    if (request.bundleType === 'topic') {
      topicKeys.add(request.scope.topicKey);
    }
    const topics = await this.database.client.topic.findMany({
      where: { key: { in: [...topicKeys] } },
      orderBy: { key: 'asc' },
      include: { topicStates: { where: { userId: DEFAULT_USER_ID }, take: 1 } },
    });
    const bundleId = randomUUID();
    const payload = ExportBundleV1.parse({
      schemaVersion: '1.0',
      bundleId,
      generatedAt: new Date().toISOString(),
      appVersion: process.env.npm_package_version ?? '1.0.0',
      bundleType: request.bundleType,
      user: {
        displayName: user.displayName,
        targetTrack: user.settings.targetTrackKey,
        locale: user.locale,
      },
      scope: request.scope,
      topics: topics.map((topic): ExportTopicV1 => {
        const state = topic.topicStates[0];
        return {
          key: topic.key,
          status: state?.status ?? 'UNKNOWN',
          masteryEstimate: state?.masteryEstimate ?? null,
          masteryConfidence: state?.masteryConfidence ?? 0,
          evidenceCount: state?.evidenceCount ?? 0,
        };
      }),
      attempts: attempts.map((attempt): ExportAttemptV1 => {
        const evaluation = attempt.evaluations[0];
        return {
          attemptId: attempt.id,
          taskKey: attempt.taskVersion.task.stableKey,
          taskVersion: attempt.taskVersion.version,
          topicKey: attempt.taskVersion.task.topic.key,
          taskKind: attempt.taskVersion.task.kind,
          prompt: attempt.taskVersion.promptMarkdown,
          answerText: attempt.answerText,
          answerCode: attempt.answerCode,
          selfRating: attempt.selfRating,
          confidence: attempt.confidence,
          helpLevel: attempt.helpLevel,
          deterministicEvaluation: evaluation
            ? {
                evaluatorType: evaluation.evaluatorType,
                evaluatorVersion: evaluation.evaluatorVersion,
                rawScore: evaluation.rawScore,
                passed: evaluation.passed,
                dimensionScores: JsonValueSchema.parse(evaluation.dimensionScores),
              }
            : null,
        };
      }),
      requestedAnalysis: {
        contract: 'skillforge-analysis-v1',
        language: 'ru',
        instructions: [
          'Оцени каждый свободный ответ по rubric и evidence, не по вежливости.',
          'Не выставляй mastery/status напрямую: верни только attempt evaluations и topic evidence.',
          'Отмечай конкретные misconceptions и remediation.',
        ],
      },
    });
    const json = stringifyJsonDocument(payload);
    const checksum = sha256(json);
    await this.database.client.exportBundle.create({
      data: {
        id: bundleId,
        userId: DEFAULT_USER_ID,
        schemaVersion: payload.schemaVersion,
        bundleType: payload.bundleType,
        scope: asJsonInput(payload.scope),
        checksum,
        payload: asJsonInput(payload),
      },
    });
    return this.result(bundleId, payload, checksum);
  }

  public async get(bundleId: string): Promise<unknown> {
    const bundle = await this.database.client.exportBundle.findFirst({
      where: { id: bundleId, userId: DEFAULT_USER_ID },
    });
    if (!bundle) throw notFound('EXPORT_NOT_FOUND', 'Export bundle не найден');
    const payload = ExportBundleV1.safeParse(bundle.payload);
    if (!payload.success) {
      throw invalidState(
        'EXPORT_PAYLOAD_INVALID',
        'Сохранённый export bundle не прошёл schema validation',
      );
    }
    return this.result(bundle.id, payload.data, bundle.checksum);
  }

  private result(id: string, payload: ExportBundleV1, checksum: string): unknown {
    const json = stringifyJsonDocument(payload);
    return {
      id,
      bundleId: payload.bundleId,
      fileName: `skillforge-${payload.bundleType}-${payload.bundleId}`,
      json,
      markdown: createExportBundleMarkdown(payload),
      checksum,
    };
  }

  private async attemptScope(input: CreateExportRequest): Promise<Prisma.AttemptWhereInput> {
    switch (input.bundleType) {
      case 'assessment-run': {
        const run = await this.database.client.assessmentRun.findFirst({
          where: { id: input.scope.id, userId: DEFAULT_USER_ID },
          select: { id: true },
        });
        if (!run) {
          throw notFound('EXPORT_ASSESSMENT_RUN_NOT_FOUND', 'Диагностика для экспорта не найдена');
        }
        return { userId: DEFAULT_USER_ID, session: { assessmentRunId: input.scope.id } };
      }
      case 'session': {
        const session = await this.database.client.learningSession.findFirst({
          where: { id: input.scope.id, userId: DEFAULT_USER_ID },
          select: { id: true },
        });
        if (!session) {
          throw notFound('EXPORT_SESSION_NOT_FOUND', 'Сессия для экспорта не найдена');
        }
        return { userId: DEFAULT_USER_ID, sessionId: input.scope.id };
      }
      case 'topic': {
        const topic = await this.database.client.topic.findFirst({
          where: { key: input.scope.topicKey, status: 'ACTIVE' },
          select: { id: true },
        });
        if (!topic) throw notFound('EXPORT_TOPIC_NOT_FOUND', 'Тема для экспорта не найдена');
        return {
          userId: DEFAULT_USER_ID,
          taskVersion: { task: { topic: { key: input.scope.topicKey } } },
        };
      }
      case 'pending-review':
        return {
          userId: DEFAULT_USER_ID,
          submittedAt: { not: null },
          taskVersion: { task: { kind: { in: FREE_TEXT_KINDS } } },
          evaluations: { none: { evaluatorType: { in: ['EXTERNAL_AI', 'MANUAL'] } } },
        };
      case 'profile':
        return {
          userId: DEFAULT_USER_ID,
          ...(input.scope.from || input.scope.to
            ? {
                createdAt: {
                  ...(input.scope.from ? { gte: new Date(input.scope.from) } : {}),
                  ...(input.scope.to ? { lte: new Date(input.scope.to) } : {}),
                },
              }
            : {}),
        };
    }
  }
}
