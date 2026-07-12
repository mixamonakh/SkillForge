import { randomUUID } from 'node:crypto';

import { HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '../src/common/api-error.js';
import type { PrismaService } from '../src/database/prisma.service.js';
import { ExportService } from '../src/modules/import-export/export.service.js';
import { parseCreateExportRequest } from '../src/modules/import-export/export-scope.js';

describe('strict export scope', () => {
  it('accepts only the exact scope for each bundle type', () => {
    const id = randomUUID();

    expect(parseCreateExportRequest({ bundleType: 'assessment-run', scope: { id } })).toEqual({
      bundleType: 'assessment-run',
      scope: { id },
    });
    expect(
      parseCreateExportRequest({
        bundleType: 'topic',
        scope: { topicKey: 'js.runtime.event-loop' },
      }),
    ).toEqual({
      bundleType: 'topic',
      scope: { topicKey: 'js.runtime.event-loop' },
    });
    expect(parseCreateExportRequest({ bundleType: 'pending-review', scope: {} })).toEqual({
      bundleType: 'pending-review',
      scope: {},
    });
  });

  it.each([
    { bundleType: 'assessment-run', scope: { id: 'not-a-uuid' } },
    { bundleType: 'session', scope: {} },
    { bundleType: 'topic', scope: { topicKey: 'Русская тема' } },
    { bundleType: 'pending-review', scope: { id: randomUUID() } },
    {
      bundleType: 'profile',
      scope: { from: '2026-07-12T00:00:00.000Z', to: '2026-07-11T00:00:00.000Z' },
    },
  ])('rejects an invalid or mismatched scope: $bundleType', (input) => {
    expect(() => parseCreateExportRequest(input)).toThrow(
      expect.objectContaining({ code: 'EXPORT_SCOPE_INVALID' }),
    );
  });

  it('returns a readable 400 instead of persisting an empty pending-review bundle', async () => {
    const database = {
      client: {
        user: {
          findUnique: vi.fn().mockResolvedValue({
            displayName: 'Михаил',
            locale: 'ru',
            settings: { targetTrackKey: 'yandex-frontend-2026' },
          }),
        },
        attempt: { findMany: vi.fn().mockResolvedValue([]) },
      },
    } as unknown as PrismaService;
    const service = new ExportService(database);

    const error = await service
      .create({ bundleType: 'pending-review', scope: {} })
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'EXPORT_SCOPE_EMPTY' });
    expect((error as ApiError).getStatus()).toBe(HttpStatus.BAD_REQUEST);
  });

  it('does not turn an unknown but syntactically valid topic into an empty export', async () => {
    const database = {
      client: {
        user: {
          findUnique: vi.fn().mockResolvedValue({
            displayName: 'Михаил',
            locale: 'ru',
            settings: { targetTrackKey: 'yandex-frontend-2026' },
          }),
        },
        topic: { findFirst: vi.fn().mockResolvedValue(null) },
      },
    } as unknown as PrismaService;
    const service = new ExportService(database);

    const error = await service
      .create({ bundleType: 'topic', scope: { topicKey: 'js.unknown-topic' } })
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'EXPORT_TOPIC_NOT_FOUND' });
    expect((error as ApiError).getStatus()).toBe(HttpStatus.NOT_FOUND);
  });
});
