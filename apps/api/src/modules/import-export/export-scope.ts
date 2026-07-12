import { HttpStatus } from '@nestjs/common';
import { z } from 'zod';

import { ApiError } from '../../common/api-error.js';

const TopicKeySchema = z
  .string()
  .trim()
  .min(3)
  .max(160)
  .regex(
    /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/u,
    'Topic key должен быть стабильным английским dot-separated key',
  );

const EmptyScopeSchema = z.object({}).strict();
const IdScopeSchema = z.object({ id: z.uuid() }).strict();
const TopicScopeSchema = z.object({ topicKey: TopicKeySchema }).strict();
const ProfileScopeSchema = z
  .object({
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
  })
  .strict()
  .superRefine((scope, context) => {
    if (scope.from && scope.to && Date.parse(scope.from) > Date.parse(scope.to)) {
      context.addIssue({
        code: 'custom',
        path: ['to'],
        message: 'Дата окончания должна быть не раньше даты начала',
      });
    }
  });

export const CreateExportRequestSchema = z.discriminatedUnion('bundleType', [
  z.object({ bundleType: z.literal('assessment-run'), scope: IdScopeSchema }).strict(),
  z.object({ bundleType: z.literal('session'), scope: IdScopeSchema }).strict(),
  z.object({ bundleType: z.literal('topic'), scope: TopicScopeSchema }).strict(),
  z.object({ bundleType: z.literal('profile'), scope: ProfileScopeSchema }).strict(),
  z.object({ bundleType: z.literal('pending-review'), scope: EmptyScopeSchema }).strict(),
]);

export type CreateExportRequest = z.infer<typeof CreateExportRequestSchema>;

export function parseCreateExportRequest(input: unknown): CreateExportRequest {
  const parsed = CreateExportRequestSchema.safeParse(input);
  if (parsed.success) return parsed.data;

  throw new ApiError(
    'EXPORT_SCOPE_INVALID',
    'Scope экспорта не соответствует выбранному типу bundle',
    HttpStatus.BAD_REQUEST,
    {
      issues: parsed.error.issues.map((issue) => ({
        code: issue.code,
        path: issue.path.join('.'),
        message: issue.message,
      })),
    },
  );
}
