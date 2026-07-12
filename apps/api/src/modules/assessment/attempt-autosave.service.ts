import { Injectable } from '@nestjs/common';
import { DEFAULT_USER_ID, Prisma } from '@skillforge/db';

import { conflict, notFound } from '../../common/api-error.js';
import { asJsonInput } from '../../common/json.js';
import { PrismaService } from '../../database/prisma.service.js';
import { serializeAttempt } from '../learning/task-view.js';
import type { AutosaveAttemptDto } from './assessment.dto.js';

@Injectable()
export class AttemptAutosaveService {
  public constructor(private readonly database: PrismaService) {}

  public async autosave(
    sessionId: string,
    itemId: string,
    input: AutosaveAttemptDto,
  ): Promise<unknown> {
    return this.database.client.$transaction(async (transaction) => {
      const item = await transaction.sessionItem.findFirst({
        where: { id: itemId, sessionId, session: { userId: DEFAULT_USER_ID } },
        include: { attempts: { orderBy: { sequence: 'desc' }, take: 1 } },
      });
      if (!item) throw notFound('SESSION_ITEM_NOT_FOUND', 'Элемент сессии не найден');
      const current = item.attempts[0];
      if (current && current.revision !== input.revision) {
        throw conflict('ATTEMPT_REVISION_CONFLICT', 'Ответ изменён в другой вкладке', {
          server: serializeAttempt(current),
        });
      }
      const data = {
        answerText: input.answerText ?? null,
        answerCode: input.answerCode ?? null,
        selectedOptions: asJsonInput(input.selectedOptions),
        selfRating: input.selfRating ?? null,
        confidence: input.confidence ?? null,
        helpLevel: input.helpLevel,
        hintsUsed: asJsonInput(input.hintsUsed),
      };
      if (!current) {
        if (input.revision !== 0) {
          throw conflict('ATTEMPT_REVISION_CONFLICT', 'Server copy ещё не создан', {
            server: null,
          });
        }
        const saved = await transaction.attempt.create({
          data: {
            userId: DEFAULT_USER_ID,
            sessionId,
            sessionItemId: itemId,
            taskVersionId: item.taskVersionId,
            sequence: 1,
            revision: 1,
            ...data,
          },
        });
        return serializeAttempt(saved);
      }
      if (current.submittedAt) {
        const saved = await transaction.attempt.create({
          data: {
            userId: DEFAULT_USER_ID,
            sessionId,
            sessionItemId: itemId,
            taskVersionId: item.taskVersionId,
            sequence: current.sequence + 1,
            revision: 1,
            ...data,
          },
        });
        return serializeAttempt(saved);
      }
      const updated = await transaction.attempt.updateMany({
        where: { id: current.id, revision: input.revision, submittedAt: null },
        data: {
          ...data,
          ...(current.answerCode !== data.answerCode ? { runnerOutput: Prisma.DbNull } : {}),
          revision: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        const server = await transaction.attempt.findUnique({ where: { id: current.id } });
        throw conflict('ATTEMPT_REVISION_CONFLICT', 'Ответ изменён в другой вкладке', {
          server: server ? serializeAttempt(server) : null,
        });
      }
      const saved = await transaction.attempt.findUniqueOrThrow({ where: { id: current.id } });
      return serializeAttempt(saved);
    });
  }
}
