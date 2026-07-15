import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';

import { DatabaseModule } from './database/database.module.js';
import { AiModule } from './modules/ai/ai.module.js';
import { AssessmentModule } from './modules/assessment/assessment.module.js';
import { BattleEvidenceModule } from './modules/battle-evidence/battle-evidence.module.js';
import { CapabilityModule } from './modules/capability/capability.module.js';
import { CurriculumModule } from './modules/curriculum/curriculum.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { ImportExportModule } from './modules/import-export/import-export.module.js';
import { MasteryModule } from './modules/mastery/mastery.module.js';
import { MetricsModule } from './modules/metrics/metrics.module.js';
import { aiRuntimeConfigFromEnvironment } from './modules/ai/ai-runtime-config.js';
import { ProfileModule } from './modules/profile/profile.module.js';
import { SessionsModule } from './modules/sessions/sessions.module.js';

function logRecord(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate(config: Record<string, unknown>) {
        const environment = Object.fromEntries(
          Object.entries(config).flatMap(([key, value]) =>
            typeof value === 'string' ? [[key, value]] : [],
          ),
        );
        const ai = aiRuntimeConfigFromEnvironment(environment);
        return { ...config, AI_MODE: ai.mode, AI_PROVIDER: ai.provider };
      },
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        customProps: () => ({ service: 'skillforge-api' }),
        customAttributeKeys: { responseTime: 'durationMs' },
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'res.headers.set-cookie',
            'req.body',
            'body',
          ],
          censor: '[REDACTED]',
        },
        serializers: {
          req(request: unknown) {
            const record = logRecord(request);
            return {
              id: record.id,
              method: record.method,
              url: record.url,
              remoteAddress: record.remoteAddress,
            };
          },
          res(response: unknown) {
            return { statusCode: logRecord(response).statusCode };
          },
        },
      },
    }),
    DatabaseModule,
    AiModule,
    MasteryModule,
    ProfileModule,
    CurriculumModule,
    CapabilityModule,
    AssessmentModule,
    SessionsModule,
    MetricsModule,
    ImportExportModule,
    BattleEvidenceModule,
    HealthModule,
  ],
})
export class AppModule {}
