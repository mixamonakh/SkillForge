import { Injectable } from '@nestjs/common';
import { DEFAULT_USER_ID } from '@skillforge/db';
import {
  calculateCalibration,
  calculateReadiness,
  type ReadinessTarget,
  type ReadinessTopicState,
} from '@skillforge/learning-engine';

import { objectValue } from '../../common/json.js';
import { PrismaService } from '../../database/prisma.service.js';
import { sufficiency } from './metrics-utils.js';

@Injectable()
export class MetricsReadService {
  public constructor(private readonly database: PrismaService) {}

  public async readiness(targetKey?: string): Promise<unknown> {
    const settings = await this.database.client.userSettings.findUnique({
      where: { userId: DEFAULT_USER_ID },
    });
    const key = targetKey ?? settings?.targetTrackKey ?? 'yandex-frontend-2026';
    const target = await this.database.client.targetTrack.findFirst({
      where: { key, status: 'ACTIVE' },
      orderBy: { version: 'desc' },
      include: {
        rules: {
          include: {
            track: { include: { topics: { where: { status: 'ACTIVE' } } } },
            topic: true,
          },
        },
      },
    });
    if (!target) {
      return {
        dataSufficiency: {
          sufficient: false,
          coverage: 0,
          reason: `Целевой профиль ${key} не импортирован; readiness не рассчитана`,
        },
        value: null,
        targetTitle: 'Целевой профиль не настроен',
        targetVersion: 'not-configured',
        covered: 0,
        required: 0,
        gates: ['TargetTrack отсутствует'],
        result: null,
      };
    }
    const required = new Map<string, { topicKey: string; domainKey: string; weight: number }>();
    for (const rule of target?.rules ?? []) {
      if (rule.topic) {
        required.set(rule.topic.key, {
          topicKey: rule.topic.key,
          domainKey: rule.track?.key ?? rule.topic.key.split('.').slice(0, 2).join('.'),
          weight: rule.weight,
        });
      }
      for (const topic of rule.track?.topics ?? []) {
        required.set(topic.key, {
          topicKey: topic.key,
          domainKey: rule.track?.key ?? 'general',
          weight: rule.weight,
        });
      }
    }
    const gates = (target?.rules ?? []).flatMap((rule) => {
      const metadata = objectValue(rule.metadata);
      if (!rule.gate || rule.minimum === null) return [];
      return [
        {
          key: `gate:${rule.id}`,
          domainKey:
            rule.track?.key ??
            (typeof metadata.domainKey === 'string' ? metadata.domainKey : 'general'),
          minimumScore: rule.minimum,
          cap: typeof metadata.cap === 'number' ? metadata.cap : 59,
        },
      ];
    });
    const readinessTarget: ReadinessTarget = {
      key,
      version: String(target?.version ?? 1),
      minimumCoverage: 0.6,
      requiredTopics: [...required.values()],
      gates,
    };
    const states = await this.database.client.topicState.findMany({
      where: { userId: DEFAULT_USER_ID },
      include: { topic: { select: { key: true } } },
    });
    const engineStates: ReadinessTopicState[] = states.map((state) => ({
      topicKey: state.topic.key,
      status: state.status,
      masteryEstimate: state.masteryEstimate,
    }));
    const result = calculateReadiness(readinessTarget, engineStates);
    return {
      dataSufficiency: sufficiency(
        result.assessedRequiredTopics,
        result.requiredTopics,
        readinessTarget.minimumCoverage,
      ),
      value: result.overallScore,
      targetTitle: target?.title ?? 'Yandex / Strong Company Track',
      targetVersion: result.targetVersion,
      covered: result.assessedRequiredTopics,
      required: result.requiredTopics,
      gates: result.blockingGates.map(
        (gate) =>
          `${gate.key}: ${gate.actualScore === null ? 'недостаточно данных' : String(gate.actualScore)} / ${String(gate.minimumScore)}`,
      ),
      result,
    };
  }

  public async calibration(): Promise<unknown> {
    const evaluations = await this.database.client.evaluation.findMany({
      where: {
        userId: DEFAULT_USER_ID,
        rawScore: { not: null },
        attempt: { confidence: { not: null } },
      },
      select: { rawScore: true, attempt: { select: { confidence: true } } },
    });
    const values = evaluations.flatMap((item) =>
      item.rawScore !== null && item.attempt.confidence !== null
        ? [{ confidence: item.attempt.confidence, evaluatedScore: item.rawScore }]
        : [],
    );
    const result = calculateCalibration(values);
    return {
      dataSufficiency: {
        sufficient: result.state === 'CALIBRATED',
        coverage: Math.min(1, result.evaluatedAttempts / result.minimumAttempts),
        reason: `${String(result.evaluatedAttempts)} из ${String(result.minimumAttempts)} evaluated attempts`,
      },
      absoluteGap: result.meanAbsoluteGap,
      attempts: result.evaluatedAttempts,
    };
  }

  public async misconceptions(): Promise<Array<{ key: string; title: string; count: number }>> {
    const findings = await this.database.client.evaluationMisconception.findMany({
      where: { evaluation: { userId: DEFAULT_USER_ID } },
      include: { misconception: true },
    });
    const grouped = new Map<string, { key: string; title: string; count: number }>();
    for (const finding of findings) {
      const current = grouped.get(finding.misconceptionId);
      grouped.set(finding.misconceptionId, {
        key: finding.misconception.key,
        title: finding.misconception.title,
        count: (current?.count ?? 0) + 1,
      });
    }
    return [...grouped.values()]
      .filter((item) => item.count >= 2)
      .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
  }
}
