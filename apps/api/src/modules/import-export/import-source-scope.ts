import { ExportBundleV1 } from '@skillforge/contracts';

export type ImportSourceScope = {
  attemptTopicById: ReadonlyMap<string, string>;
  topicKeys: ReadonlySet<string>;
};

export function parseImportSourceScope(payload: unknown): ImportSourceScope | null {
  const parsed = ExportBundleV1.safeParse(payload);
  if (!parsed.success) return null;
  return {
    attemptTopicById: new Map(
      parsed.data.attempts.map((attempt) => [attempt.attemptId, attempt.topicKey]),
    ),
    topicKeys: new Set(parsed.data.topics.map((topic) => topic.key)),
  };
}
