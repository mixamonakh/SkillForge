import { z } from 'zod';

import { parsePrebaselineSnapshot } from '../assessment/prebaseline-snapshot.js';

export const PREBASELINE_EVIDENCE_SUPPRESSION_REASON = 'PREBASELINE_ROUTING_ONLY' as const;

export const SuppressedExternalEvaluationEffectSchema = z
  .object({
    attemptId: z.uuid(),
    reason: z.literal(PREBASELINE_EVIDENCE_SUPPRESSION_REASON),
    evaluationAction: z.literal('CREATE_AUDIT_RECORD'),
    evidenceAction: z.literal('SUPPRESSED'),
    topicStateAction: z.literal('NO_MUTATION'),
    masteryAction: z.literal('NO_MUTATION'),
    requestedEvidenceItems: z.number().int().nonnegative(),
  })
  .strict();

export type SuppressedExternalEvaluationEffect = z.infer<
  typeof SuppressedExternalEvaluationEffectSchema
>;

/**
 * This intentionally fails closed for a snapshot carrying the v2 pre-baseline marker.
 * A partially damaged immutable snapshot must not regain permission to mutate mastery.
 */
export function isPrebaselineV2ImportSnapshot(value: unknown): boolean {
  if (parsePrebaselineSnapshot(value) !== null) return true;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const marker = value as Record<string, unknown>;
  return marker.schemaVersion === '2.0' && marker.kind === 'ADAPTIVE_PREBASELINE';
}

export function suppressedExternalEvaluationEffect(input: {
  attemptId: string;
  assessmentSnapshot: unknown;
  requestedEvidenceItems: number;
}): SuppressedExternalEvaluationEffect | null {
  if (!isPrebaselineV2ImportSnapshot(input.assessmentSnapshot)) return null;
  return SuppressedExternalEvaluationEffectSchema.parse({
    attemptId: input.attemptId,
    reason: PREBASELINE_EVIDENCE_SUPPRESSION_REASON,
    evaluationAction: 'CREATE_AUDIT_RECORD',
    evidenceAction: 'SUPPRESSED',
    topicStateAction: 'NO_MUTATION',
    masteryAction: 'NO_MUTATION',
    requestedEvidenceItems: input.requestedEvidenceItems,
  });
}

export function storedSuppressedExternalEvaluationEffects(
  preview: unknown,
): SuppressedExternalEvaluationEffect[] {
  if (typeof preview !== 'object' || preview === null || Array.isArray(preview)) return [];
  const effects = (preview as Record<string, unknown>).suppressedEvaluationEffects;
  const parsed = z.array(SuppressedExternalEvaluationEffectSchema).safeParse(effects);
  return parsed.success ? parsed.data : [];
}
