import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../src/database/prisma.service.js';
import { AssessmentQueryService } from '../src/modules/assessment/assessment-query.service.js';

describe('AssessmentQueryService catalog', () => {
  it('exposes the latest completed run when no run is active', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        key: 'js-baseline-v1',
        version: 1,
        title: 'JavaScript Baseline v1',
        description: 'Baseline',
        totalBlocks: 4,
        estimatedMin: 120,
        items: [{ taskVersion: { task: { kind: 'PREDICT_OUTPUT' } } }],
        runs: [
          {
            id: 'completed-newest',
            status: 'COMPLETED',
            createdAt: new Date('2026-07-11T10:00:00.000Z'),
            session: { attempts: [{ submittedAt: new Date('2026-07-11T09:00:00.000Z') }] },
          },
          {
            id: 'completed-older',
            status: 'COMPLETED',
            createdAt: new Date('2026-07-10T10:00:00.000Z'),
            session: { attempts: [{ submittedAt: null }] },
          },
        ],
      },
    ]);
    const database = {
      client: { assessmentBlueprint: { findMany } },
    } as unknown as PrismaService;
    const service = new AssessmentQueryService(database);

    const catalog = (await service.catalog()) as Array<{
      title: string;
      flow: string;
      activeRun: unknown;
      latestCompletedRun: { id: string; status: string; answered: number } | null;
      completedRuns: number;
    }>;

    expect(catalog[0]).toMatchObject({
      title: 'Расширенная диагностика JavaScript Core',
      flow: 'FIXED_ASSESSMENT',
      activeRun: null,
      latestCompletedRun: { id: 'completed-newest', status: 'COMPLETED', answered: 1 },
      completedRuns: 2,
    });
  });

  it('rejects the fixed-run endpoint for the adaptive prebaseline key', async () => {
    const database = { client: {} } as unknown as PrismaService;
    const service = new AssessmentQueryService(database);

    await expect(service.createRun('js-prebaseline-v1')).rejects.toThrow(
      /только через adaptive start/iu,
    );
  });

  it('puts the short adaptive calibration before the legacy baseline for a new user', async () => {
    const blueprint = (key: string, status: 'ACTIVE' | 'DRAFT') => ({
      key,
      version: 1,
      title: key,
      description: key,
      status,
      totalBlocks: 1,
      estimatedMin: 10,
      items: [{ taskVersion: { task: { kind: 'EXPLAIN' } } }],
      runs: [],
    });
    const database = {
      client: {
        assessmentBlueprint: {
          findMany: vi
            .fn()
            .mockResolvedValue([
              blueprint('js-baseline-v1', 'ACTIVE'),
              blueprint('js-prebaseline-v1', 'DRAFT'),
            ]),
        },
      },
    } as unknown as PrismaService;

    const catalog = (await new AssessmentQueryService(database).catalog()) as Array<{
      key: string;
    }>;

    expect(catalog.map((item) => item.key)).toEqual([
      'js-prebaseline-v1',
      'js-baseline-v1',
    ]);
  });
});
