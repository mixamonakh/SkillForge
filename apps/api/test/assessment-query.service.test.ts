import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../src/database/prisma.service.js';
import { AssessmentQueryService } from '../src/modules/assessment/assessment-query.service.js';

describe('AssessmentQueryService catalog', () => {
  it('exposes the latest completed run when no run is active', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        key: 'js-baseline',
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
      activeRun: unknown;
      latestCompletedRun: { id: string; status: string; answered: number } | null;
      completedRuns: number;
    }>;

    expect(catalog[0]).toMatchObject({
      activeRun: null,
      latestCompletedRun: { id: 'completed-newest', status: 'COMPLETED', answered: 1 },
      completedRuns: 2,
    });
  });
});
