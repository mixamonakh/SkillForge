import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../src/database/prisma.service.js';
import { MetricsReadService } from '../src/modules/metrics/metrics-read.service.js';

describe('MetricsReadService', () => {
  it('never synthesizes readiness when TargetTrack is absent', async () => {
    const database = {
      client: {
        userSettings: {
          findUnique: vi.fn().mockResolvedValue({ targetTrackKey: 'missing-target' }),
        },
        targetTrack: { findFirst: vi.fn().mockResolvedValue(null) },
      },
    } as unknown as PrismaService;
    const result = (await new MetricsReadService(database).readiness()) as {
      value: number | null;
      dataSufficiency: { sufficient: boolean; reason: string };
    };

    expect(result.value).toBeNull();
    expect(result.dataSufficiency.sufficient).toBe(false);
    expect(result.dataSufficiency.reason).toContain('не импортирован');
  });
});
