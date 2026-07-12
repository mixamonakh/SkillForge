import { HttpStatus, Injectable } from '@nestjs/common';

import { ApiError } from '../../common/api-error.js';
import { PrismaService } from '../../database/prisma.service.js';

type MigrationHealth = {
  applied: number;
  pendingOrFailed: number;
};

@Injectable()
export class HealthService {
  public constructor(private readonly database: PrismaService) {}

  public live(): unknown {
    return {
      status: 'ok',
      service: 'skillforge-api',
      version: process.env.npm_package_version ?? '1.0.0',
      timestamp: new Date().toISOString(),
    };
  }

  public async ready(): Promise<unknown> {
    const startedAt = performance.now();
    try {
      await this.database.client.$queryRaw`SELECT 1`;
      const latencyMs = Math.max(0, Math.round((performance.now() - startedAt) * 10) / 10);
      const [migrationHealth] = await this.database.client.$queryRaw<MigrationHealth[]>`
        SELECT
          count(*) FILTER (WHERE finished_at IS NOT NULL)::int AS applied,
          count(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL)::int AS "pendingOrFailed"
        FROM "_prisma_migrations"
      `;
      const contentPack = await this.database.client.contentPack.findFirst({
        where: { status: 'ACTIVE' },
        orderBy: { importedAt: 'desc' },
        select: { key: true, version: true },
      });
      if (!migrationHealth || migrationHealth.applied < 1 || migrationHealth.pendingOrFailed > 0) {
        throw new ApiError(
          'MIGRATIONS_NOT_READY',
          'Prisma migrations не применены полностью',
          HttpStatus.SERVICE_UNAVAILABLE,
          { migrations: migrationHealth ?? { applied: 0, pendingOrFailed: 0 } },
        );
      }
      if (!contentPack) {
        throw new ApiError(
          'CONTENT_NOT_READY',
          'Активный content pack не импортирован',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      return {
        status: 'ready',
        service: 'skillforge-api',
        version: process.env.npm_package_version ?? '1.0.0',
        checks: {
          database: { status: 'up', latencyMs },
          migrations: { status: 'applied', count: migrationHealth.applied },
          content: { status: 'loaded', pack: `${contentPack.key}@${contentPack.version}` },
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        'READINESS_CHECK_FAILED',
        'API ещё не готов к работе',
        HttpStatus.SERVICE_UNAVAILABLE,
        { database: 'unavailable-or-unmigrated' },
      );
    }
  }
}
