import { Inject, Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { AI_RUNTIME, type AiRuntime } from './ai-runtime.provider.js';
import { AI_USER_ID, currentAiPeriod, money } from './ai-shared.js';

export async function readAiUsage(
  database: PrismaService['client'],
  runtime: AiRuntime,
  now: Date = new Date(),
): Promise<unknown> {
  const period = currentAiPeriod(now);
  const start = new Date(`${period}-01T00:00:00.000Z`);
  const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  // PrismaPg can use a single schema-scoped client in tests; sequential reads avoid concurrent
  // client.query calls while keeping this endpoint a pure, bounded read model.
  const budget = await database.aiBudgetPeriod.findUnique({
    where: { userId_period: { userId: AI_USER_ID, period } },
  });
  const requestCount = await database.aiInvocation.count({
    where: { userId: AI_USER_ID, createdAt: { gte: start, lt: next } },
  });
  const cacheHits = await database.aiInvocation.count({
    where: { userId: AI_USER_ID, status: 'CACHED', createdAt: { gte: start, lt: next } },
  });
  const failures = await database.aiInvocation.count({
    where: {
      userId: AI_USER_ID,
      status: { in: ['FAILED', 'REJECTED_BUDGET'] },
      createdAt: { gte: start, lt: next },
    },
  });
  const draftCounts = await database.aiEvaluationDraft.groupBy({
    by: ['status'],
    where: { attempt: { userId: AI_USER_ID }, createdAt: { gte: start, lt: next } },
    _count: { _all: true },
  });
  const average = await database.aiInvocation.aggregate({
    where: {
      userId: AI_USER_ID,
      status: { in: ['SUCCEEDED', 'CACHED'] },
      createdAt: { gte: start, lt: next },
    },
    _avg: { actualCostUsd: true },
  });
  const models = await database.aiInvocation.groupBy({
    by: ['provider', 'model', 'promptKey', 'promptVersion'],
    where: { userId: AI_USER_ID, createdAt: { gte: start, lt: next } },
    orderBy: [
      { provider: 'asc' },
      { model: 'asc' },
      { promptKey: 'asc' },
      { promptVersion: 'asc' },
    ],
    _count: { _all: true },
    _sum: { actualCostUsd: true },
  });
  const limitUsd = money(budget?.limitUsd ?? runtime.config.monthlyBudgetUsd) ?? 0;
  const spentUsd = money(budget?.spentUsd ?? 0) ?? 0;
  const reservedUsd = money(budget?.reservedUsd ?? 0) ?? 0;
  const count = (status: string): number =>
    draftCounts.find((item) => item.status === status)?._count._all ?? 0;
  return {
    period,
    mode: runtime.config.mode,
    features: runtime.config.features,
    limitUsd,
    spentUsd,
    reservedUsd,
    remainingUsd: Math.max(0, Number((limitUsd - spentUsd - reservedUsd).toFixed(6))),
    requestCount,
    cacheHits,
    failures,
    averageCostUsd: money(average._avg.actualCostUsd) ?? 0,
    appliedDrafts: count('APPLIED') + count('ROLLED_BACK'),
    rejectedDrafts: count('REJECTED'),
    models: models.map((item) => ({
      provider: item.provider,
      model: item.model,
      promptKey: item.promptKey,
      promptVersion: item.promptVersion,
      requestCount: item._count._all,
      costUsd: money(item._sum.actualCostUsd) ?? 0,
    })),
  };
}

@Injectable()
export class AiUsageService {
  public constructor(
    @Inject(PrismaService) private readonly database: PrismaService,
    @Inject(AI_RUNTIME) private readonly runtime: AiRuntime,
  ) {}

  public current(): Promise<unknown> {
    return readAiUsage(this.database.client, this.runtime);
  }
}
