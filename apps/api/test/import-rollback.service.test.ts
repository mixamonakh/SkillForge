import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../src/database/prisma.service.js';
import { ImportApplyService } from '../src/modules/import-export/import-apply.service.js';
import type { MasteryService } from '../src/modules/mastery/mastery.service.js';

describe('ImportApplyService rollback', () => {
  it('removes only batch evidence/evaluations and recomputes topics atomically', async () => {
    const updateInputs: unknown[] = [];
    const updateBatch = vi.fn((input: unknown) => {
      updateInputs.push(input);
      return Promise.resolve({});
    });
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'import-1' }]),
      importBatch: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({
            id: 'import-1',
            status: 'APPLIED',
            appliedAt: new Date('2026-07-11T10:00:00.000Z'),
            validationErrors: null,
          })
          .mockResolvedValueOnce(null),
        update: updateBatch,
      },
      evidence: {
        findMany: vi.fn().mockResolvedValue([{ topicId: 'topic-1' }, { topicId: 'topic-1' }]),
        deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      evaluation: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    const runTransaction = vi.fn(
      (callback: (client: typeof transaction) => Promise<unknown>): Promise<unknown> =>
        callback(transaction),
    );
    const database = {
      client: { $transaction: runTransaction },
    } as unknown as PrismaService;
    const recomputeWithin = vi.fn().mockResolvedValue(undefined);
    const snapshotWithin = vi.fn().mockResolvedValue(undefined);
    const mastery = {
      recomputeWithin,
      snapshotWithin,
    } as unknown as MasteryService;

    const result = await new ImportApplyService(database, mastery).rollback(
      '00000000-0000-4000-8000-000000000010',
    );

    expect(result).toMatchObject({ rolledBack: true, affectedTopics: 1, idempotent: false });
    expect(transaction.evidence.deleteMany).toHaveBeenCalledWith({
      where: { evaluation: { importBatchId: 'import-1' } },
    });
    expect(transaction.evaluation.deleteMany).toHaveBeenCalledWith({
      where: { importBatchId: 'import-1' },
    });
    expect(recomputeWithin).toHaveBeenCalledWith(transaction, ['topic-1']);
    expect(updateInputs[0]).toMatchObject({
      where: { id: 'import-1' },
      data: { status: 'REJECTED', appliedAt: null },
    });
  });
});
