import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../src/database/prisma.service.js';
import { ExportService } from '../src/modules/import-export/export.service.js';

describe('ExportService pending review scope', () => {
  it('includes mixed PREDICT_OUTPUT tasks awaiting explanation review', async () => {
    const findAttempts = vi.fn().mockResolvedValue([]);
    const database = {
      client: {
        user: {
          findUnique: vi.fn().mockResolvedValue({
            displayName: 'Test User',
            locale: 'ru',
            settings: { targetTrackKey: 'frontend-engineer' },
          }),
        },
        attempt: { findMany: findAttempts },
        topic: { findMany: vi.fn().mockResolvedValue([]) },
        exportBundle: { create: vi.fn().mockResolvedValue({}) },
      },
    } as unknown as PrismaService;
    const service = new ExportService(database);

    await expect(service.create({ bundleType: 'pending-review', scope: {} })).rejects.toMatchObject(
      {
        code: 'EXPORT_SCOPE_EMPTY',
      },
    );

    expect(findAttempts).toHaveBeenCalledOnce();
    expect(JSON.stringify(findAttempts.mock.calls)).toContain('PREDICT_OUTPUT');
  });
});
