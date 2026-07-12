import { validate } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../src/database/prisma.service.js';
import type { SessionRecommendationService } from '../src/modules/sessions/session-recommendation.service.js';
import type { MasteryService } from '../src/modules/mastery/mastery.service.js';
import { SessionPlanDto } from '../src/modules/sessions/sessions.dto.js';
import { SessionsService } from '../src/modules/sessions/sessions.service.js';

const RETURN_FROM_SESSION_ID = 'b6a95d8b-2a95-43f9-8427-5e5d41c42fc8';
const mastery = {} as MasteryService;

function planDto(overrides: Partial<SessionPlanDto> = {}): SessionPlanDto {
  return Object.assign(new SessionPlanDto(), {
    mode: 'TRAINING',
    loadMode: 'NORMAL',
    topicKeys: ['js.global-recommendation'],
    documentationAllowed: true,
    codeLanguage: 'javascript',
    ...overrides,
  });
}

describe('SessionPlanDto', () => {
  it('allows empty topicKeys only with a valid returnFromSessionId', async () => {
    const withoutReturn = await validate(planDto({ topicKeys: [] }));
    const withReturn = await validate(
      planDto({ topicKeys: [], returnFromSessionId: RETURN_FROM_SESSION_ID }),
    );

    expect(withoutReturn.some((error) => error.property === 'returnFromSessionId')).toBe(true);
    expect(withReturn).toHaveLength(0);
  });
});

describe('SessionsService return plan', () => {
  it('uses source-session topics and normalizes mode regardless of submitted topics', async () => {
    const findPrevious = vi.fn().mockResolvedValue({
      items: [
        { taskVersion: { task: { topic: { key: 'js.source-topic' } } } },
        { taskVersion: { task: { topic: { key: 'js.source-topic' } } } },
      ],
    });
    const findTopics = vi.fn().mockResolvedValue([{ key: 'js.source-topic' }]);
    const database = {
      client: {
        learningSession: { findFirst: findPrevious },
        topic: { findMany: findTopics },
      },
    } as unknown as PrismaService;
    const recommendations = {} as SessionRecommendationService;
    const service = new SessionsService(database, recommendations, mastery);

    const result = await service.plan(
      planDto({
        mode: 'TRAINING',
        loadMode: 'DEEP',
        topicKeys: ['js.global-recommendation'],
        returnFromSessionId: RETURN_FROM_SESSION_ID,
      }),
    );

    expect(result).toMatchObject({
      mode: 'RETURN',
      loadMode: 'RETURN',
      topicKeys: ['js.source-topic'],
      returnFromSessionId: RETURN_FROM_SESSION_ID,
    });
    expect(findTopics).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: { in: ['js.source-topic'] }, status: 'ACTIVE' },
      }),
    );
  });

  it('rejects an empty topic selection outside a return flow at the use-case boundary', async () => {
    const database = { client: {} } as PrismaService;
    const recommendations = {} as SessionRecommendationService;
    const service = new SessionsService(database, recommendations, mastery);

    await expect(service.plan(planDto({ topicKeys: [] }))).rejects.toMatchObject({
      code: 'SESSION_TOPICS_REQUIRED',
    });
  });

  it('rejects TypeScript when selected topics have no matching active code task', async () => {
    const database = {
      client: {
        topic: { findMany: vi.fn().mockResolvedValue([{ key: 'js.source-topic' }]) },
        task: { findMany: vi.fn().mockResolvedValue([{ versions: [{ language: 'javascript' }] }]) },
      },
    } as unknown as PrismaService;
    const recommendations = {} as SessionRecommendationService;
    const service = new SessionsService(database, recommendations, mastery);

    await expect(
      service.plan(planDto({ topicKeys: ['js.source-topic'], codeLanguage: 'typescript' })),
    ).rejects.toMatchObject({ code: 'SESSION_CODE_LANGUAGE_UNAVAILABLE' });
  });
});
