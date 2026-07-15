import { DEFAULT_USER_ID } from '@skillforge/db';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../src/database/prisma.service.js';
import { CapabilityProjectionService } from '../src/modules/capability/capability-projection.service.js';

const topic = {
  id: 'topic-id',
  key: 'js.references',
  defaultHalfLifeDays: 90,
};

function databaseMock(input: {
  topic?: typeof topic | null;
  topics?: Array<typeof topic>;
  evidence?: unknown[];
  attempts?: unknown[];
}) {
  const findUnique = vi.fn().mockResolvedValue(input.topic === undefined ? topic : input.topic);
  const findTopics = vi.fn().mockResolvedValue(input.topics ?? [topic]);
  const findEvidence = vi.fn().mockResolvedValue(input.evidence ?? []);
  const findAttempts = vi.fn().mockResolvedValue(input.attempts ?? []);
  const database = {
    client: {
      topic: { findUnique, findMany: findTopics },
      evidence: { findMany: findEvidence },
      attempt: { findMany: findAttempts },
    },
  } as unknown as PrismaService;
  return { database, findUnique, findTopics, findEvidence, findAttempts };
}

function evidenceSource(input: {
  kind: 'EXPLANATION' | 'PREDICT_OUTPUT';
  metadata: unknown;
  taskKind: 'EXPLAIN' | 'PREDICT_OUTPUT';
}) {
  return {
    topicId: topic.id,
    kind: input.kind,
    rawScore: 100,
    occurredAt: new Date('2026-07-14T10:00:00.000Z'),
    createdAt: new Date('2026-07-14T10:00:00.000Z'),
    provenance: { evaluator: 'EXACT_MATCH' },
    evaluation: {
      evaluatorType: 'EXACT_MATCH',
      reliability: 0.95,
      passed: null,
      attempt: {
        helpLevel: 'NONE',
        taskVersion: { metadata: input.metadata, task: { kind: input.taskKind } },
      },
    },
  };
}

describe('CapabilityProjectionService', () => {
  it('returns TOPIC_NOT_FOUND without querying user evidence', async () => {
    const { database, findEvidence, findAttempts } = databaseMock({ topic: null });
    const service = new CapabilityProjectionService(database);

    const error = await service.topicProfile('missing-topic').catch((reason: unknown) => reason);

    expect(error).toMatchObject({ code: 'TOPIC_NOT_FOUND' });
    expect(findEvidence).not.toHaveBeenCalled();
    expect(findAttempts).not.toHaveBeenCalled();
  });

  it('returns honest NOT_TESTED states when no evidence exists', async () => {
    const { database } = databaseMock({ evidence: [], attempts: [] });
    const profile = await new CapabilityProjectionService(database).topicProfile(topic.key);

    expect(profile.algorithmVersion).toBe('capability-profile-v1.0');
    for (const state of Object.values(profile.capabilities)) {
      expect(state).toMatchObject({
        coverage: 'NOT_TESTED',
        estimate: null,
        confidence: 0,
        evidenceCount: 0,
      });
    }
  });

  it('keeps evaluated TRACE separate from pending MECHANISM on a mixed v2 task', async () => {
    const metadata = {
      schemaVersion: '2.0',
      evidenceFamilies: ['TRACE', 'MECHANISM'],
      mixedEvidence: true,
    };
    const { database } = databaseMock({
      evidence: [evidenceSource({ kind: 'PREDICT_OUTPUT', metadata, taskKind: 'PREDICT_OUTPUT' })],
      attempts: [
        {
          id: 'attempt-v2',
          sessionItemId: 'session-item-v2',
          sequence: 1,
          helpLevel: 'NONE',
          submittedAt: new Date('2026-07-14T10:00:00.000Z'),
          createdAt: new Date('2026-07-14T09:59:00.000Z'),
          taskVersion: {
            metadata,
            rubric: { dimensions: { PREDICT_OUTPUT: 40, EXPLANATION: 60 } },
            task: { topicId: topic.id, kind: 'PREDICT_OUTPUT' },
          },
          evaluations: [
            {
              evaluatorType: 'EXACT_MATCH',
              dimensionScores: { PREDICT_OUTPUT: 100 },
              rubricResult: {
                coverage: {
                  evaluatedDimensions: ['PREDICT_OUTPUT'],
                  pendingDimensions: ['EXPLANATION'],
                  unsupportedDimensions: [],
                  isFinal: false,
                },
              },
            },
          ],
        },
      ],
    });

    const profile = await new CapabilityProjectionService(database).topicProfile(topic.key);

    expect(profile.capabilities.TRACE).toMatchObject({
      coverage: 'INSUFFICIENT',
      estimate: null,
      evidenceCount: 1,
      pendingReviewCount: 0,
    });
    expect(profile.capabilities.MECHANISM).toMatchObject({
      coverage: 'INSUFFICIENT',
      estimate: null,
      evidenceCount: 0,
      pendingReviewCount: 1,
    });
  });

  it('keeps a submitted free explanation pending until review evidence exists', async () => {
    const { database } = databaseMock({
      evidence: [],
      attempts: [
        {
          id: 'attempt-explanation',
          sessionItemId: 'session-item-explanation',
          sequence: 1,
          helpLevel: 'NONE',
          submittedAt: new Date('2026-07-14T11:00:00.000Z'),
          createdAt: new Date('2026-07-14T10:59:00.000Z'),
          taskVersion: {
            metadata: {
              schemaVersion: '2.0',
              evidenceFamilies: ['MECHANISM'],
              mixedEvidence: false,
            },
            rubric: { dimensions: { EXPLANATION: 100 } },
            task: { topicId: topic.id, kind: 'EXPLAIN' },
          },
          evaluations: [],
        },
      ],
    });

    const profile = await new CapabilityProjectionService(database).topicProfile(topic.key);

    expect(profile.capabilities.MECHANISM).toMatchObject({
      coverage: 'INSUFFICIENT',
      estimate: null,
      evidenceCount: 0,
      pendingReviewCount: 1,
    });
  });

  it('uses only narrow v1 evidence mapping and does not invent MECHANISM', async () => {
    const legacyMetadata = {
      yandexRelevance: 4,
      estimatedMinutes: 5,
      mixedEvidence: true,
      documentationUrls: ['https://developer.mozilla.org/'],
    };
    const { database } = databaseMock({
      evidence: [
        evidenceSource({
          kind: 'PREDICT_OUTPUT',
          metadata: legacyMetadata,
          taskKind: 'PREDICT_OUTPUT',
        }),
      ],
      attempts: [],
    });

    const profile = await new CapabilityProjectionService(database).topicProfile(topic.key);

    expect(profile.capabilities.TRACE).toMatchObject({
      coverage: 'INSUFFICIENT',
      estimate: null,
      evidenceCount: 1,
    });
    expect(profile.capabilities.MECHANISM).toMatchObject({
      coverage: 'NOT_TESTED',
      estimate: null,
      evidenceCount: 0,
    });
  });

  it('scopes every evidence, attempt and evaluation query to the local user', async () => {
    const { database, findEvidence, findAttempts } = databaseMock({ evidence: [], attempts: [] });

    await new CapabilityProjectionService(database).topicProfile(topic.key);

    const evidenceCalls: unknown = findEvidence.mock.calls;
    const attemptCalls: unknown = findAttempts.mock.calls;
    const evidenceQuery = JSON.stringify(evidenceCalls);
    const attemptQuery = JSON.stringify(attemptCalls);
    expect(evidenceQuery).toContain(`"userId":"${DEFAULT_USER_ID}"`);
    expect(evidenceQuery).toContain(
      `"evaluation":{"userId":"${DEFAULT_USER_ID}","supersededBy":null,"attempt":{"userId":"${DEFAULT_USER_ID}"}}`,
    );
    expect(attemptQuery).toContain(`"where":{"userId":"${DEFAULT_USER_ID}"`);
    expect(attemptQuery).toContain(
      `"evaluations":{"where":{"userId":"${DEFAULT_USER_ID}","supersededBy":null}`,
    );
  });

  it('summarizes coverage as counts, never as a fabricated aggregate score', async () => {
    const { database, findTopics } = databaseMock({ topics: [topic], evidence: [], attempts: [] });
    const summary = await new CapabilityProjectionService(database).userSummary();

    expect(summary).toMatchObject({
      algorithmVersion: 'capability-profile-v1.0',
      coverage: {
        topicCount: 1,
        capabilityStates: { NOT_TESTED: 7, INSUFFICIENT: 0, SUFFICIENT: 0 },
      },
    });
    expect(summary).not.toHaveProperty('score');
    expect(findTopics).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'ACTIVE' } }),
    );
  });
});
