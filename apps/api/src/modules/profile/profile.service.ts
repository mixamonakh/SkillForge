import { Injectable, HttpStatus } from '@nestjs/common';
import { DEFAULT_USER_ID, LoadMode } from '@skillforge/db';

import { ApiError, notFound } from '../../common/api-error.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { UpdateSettingsDto } from './profile.dto.js';

const RESET_CONFIRMATION = 'СБРОСИТЬ ДАННЫЕ';

@Injectable()
export class ProfileService {
  public constructor(private readonly database: PrismaService) {}

  public async getProfile(): Promise<unknown> {
    const user = await this.database.client.user.findUnique({
      where: { id: DEFAULT_USER_ID },
      include: { settings: true },
    });
    if (!user?.settings) throw notFound('PROFILE_NOT_FOUND', 'Локальный профиль не создан');
    const contentPack = await this.database.client.contentPack.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { importedAt: 'desc' },
      select: { key: true, version: true },
    });
    return {
      user: { displayName: user.displayName, locale: user.locale },
      settings: {
        targetTrackKey: user.settings.targetTrackKey,
        defaultLoadMode: user.settings.defaultLoadMode,
        codeLanguage: user.settings.codeLanguage,
        aiMode: user.settings.aiMode,
        apiMonthlyBudgetUsd: Number(user.settings.apiMonthlyBudgetUsd),
        resumeThresholdDays: user.settings.resumeThresholdDays,
        theme: user.settings.theme,
        reducedMotion: user.settings.reducedMotion,
      },
      app: {
        version: process.env.npm_package_version ?? '1.0.0',
        contentPack: contentPack ? `${contentPack.key}@${contentPack.version}` : 'не импортирован',
        environment: process.env.NODE_ENV ?? 'development',
      },
    };
  }

  public async updateSettings(input: UpdateSettingsDto): Promise<unknown> {
    await this.database.client.userSettings.upsert({
      where: { userId: DEFAULT_USER_ID },
      create: {
        userId: DEFAULT_USER_ID,
        ...(input.targetTrackKey === undefined ? {} : { targetTrackKey: input.targetTrackKey }),
        ...(input.defaultLoadMode === undefined
          ? {}
          : { defaultLoadMode: input.defaultLoadMode as LoadMode }),
        ...(input.codeLanguage === undefined ? {} : { codeLanguage: input.codeLanguage }),
        ...(input.aiMode === undefined ? {} : { aiMode: input.aiMode }),
        ...(input.apiMonthlyBudgetUsd === undefined
          ? {}
          : { apiMonthlyBudgetUsd: input.apiMonthlyBudgetUsd }),
        ...(input.resumeThresholdDays === undefined
          ? {}
          : { resumeThresholdDays: input.resumeThresholdDays }),
        ...(input.theme === undefined ? {} : { theme: input.theme }),
        ...(input.reducedMotion === undefined ? {} : { reducedMotion: input.reducedMotion }),
      },
      update: {
        ...(input.targetTrackKey === undefined ? {} : { targetTrackKey: input.targetTrackKey }),
        ...(input.defaultLoadMode === undefined
          ? {}
          : { defaultLoadMode: input.defaultLoadMode as LoadMode }),
        ...(input.codeLanguage === undefined ? {} : { codeLanguage: input.codeLanguage }),
        ...(input.aiMode === undefined ? {} : { aiMode: input.aiMode }),
        ...(input.apiMonthlyBudgetUsd === undefined
          ? {}
          : { apiMonthlyBudgetUsd: input.apiMonthlyBudgetUsd }),
        ...(input.resumeThresholdDays === undefined
          ? {}
          : { resumeThresholdDays: input.resumeThresholdDays }),
        ...(input.theme === undefined ? {} : { theme: input.theme }),
        ...(input.reducedMotion === undefined ? {} : { reducedMotion: input.reducedMotion }),
      },
    });
    return this.getProfile();
  }

  public async resetPreview(): Promise<unknown> {
    const [assessmentRuns, sessions, attempts, evidence, imports, exports, artifacts] =
      await Promise.all([
        this.database.client.assessmentRun.count({ where: { userId: DEFAULT_USER_ID } }),
        this.database.client.learningSession.count({ where: { userId: DEFAULT_USER_ID } }),
        this.database.client.attempt.count({ where: { userId: DEFAULT_USER_ID } }),
        this.database.client.evidence.count({ where: { userId: DEFAULT_USER_ID } }),
        this.database.client.importBatch.count({ where: { userId: DEFAULT_USER_ID } }),
        this.database.client.exportBundle.count({ where: { userId: DEFAULT_USER_ID } }),
        this.database.client.externalArtifact.count({ where: { userId: DEFAULT_USER_ID } }),
      ]);
    return {
      confirmationPhrase: RESET_CONFIRMATION,
      counts: { assessmentRuns, sessions, attempts, evidence, imports, exports, artifacts },
      warning:
        'Будут удалены ответы, evaluations, evidence и история пользователя. Content pack и migrations сохранятся. Перед reset сделай backup.',
    };
  }

  public async resetConfirm(confirmation: string): Promise<{ reset: true }> {
    if (confirmation !== RESET_CONFIRMATION) {
      throw new ApiError(
        'RESET_CONFIRMATION_MISMATCH',
        'Фраза подтверждения не совпадает',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.database.client.$transaction(async (transaction) => {
      await transaction.evidence.deleteMany({ where: { userId: DEFAULT_USER_ID } });
      await transaction.evaluationMisconception.deleteMany({
        where: { evaluation: { userId: DEFAULT_USER_ID } },
      });
      await transaction.evaluation.deleteMany({ where: { userId: DEFAULT_USER_ID } });
      await transaction.attempt.deleteMany({ where: { userId: DEFAULT_USER_ID } });
      await transaction.sessionItem.deleteMany({
        where: { session: { userId: DEFAULT_USER_ID } },
      });
      await transaction.learningSession.deleteMany({ where: { userId: DEFAULT_USER_ID } });
      await transaction.assessmentRun.deleteMany({ where: { userId: DEFAULT_USER_ID } });
      await transaction.reviewSchedule.deleteMany({ where: { userId: DEFAULT_USER_ID } });
      await transaction.topicState.deleteMany({ where: { userId: DEFAULT_USER_ID } });
      await transaction.externalArtifactTopic.deleteMany({
        where: { externalArtifact: { userId: DEFAULT_USER_ID } },
      });
      await transaction.externalArtifact.deleteMany({ where: { userId: DEFAULT_USER_ID } });
      await transaction.importBatch.deleteMany({ where: { userId: DEFAULT_USER_ID } });
      await transaction.exportBundle.deleteMany({ where: { userId: DEFAULT_USER_ID } });
      await transaction.metricSnapshot.deleteMany({ where: { userId: DEFAULT_USER_ID } });
    });
    return { reset: true };
  }
}
