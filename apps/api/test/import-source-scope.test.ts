import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { parseImportSourceScope } from '../src/modules/import-export/import-source-scope.js';

describe('import source scope', () => {
  it('derives immutable attempt-to-topic allowlist from a valid export', () => {
    const attemptId = randomUUID();
    const scope = parseImportSourceScope({
      schemaVersion: '1.0',
      bundleId: randomUUID(),
      generatedAt: new Date().toISOString(),
      appVersion: '1.0.0',
      bundleType: 'session',
      user: { displayName: 'Test', targetTrack: 'target', locale: 'ru' },
      scope: {},
      topics: [
        {
          key: 'js.topic',
          status: 'UNKNOWN',
          masteryEstimate: null,
          masteryConfidence: 0,
          evidenceCount: 0,
        },
      ],
      attempts: [
        {
          attemptId,
          taskKey: 'js.topic.task',
          taskVersion: 1,
          topicKey: 'js.topic',
          taskKind: 'EXPLAIN',
          prompt: 'Explain',
          answerText: 'Answer',
          answerCode: null,
          selfRating: 3,
          confidence: 50,
          helpLevel: 'NONE',
          deterministicEvaluation: null,
        },
      ],
      requestedAnalysis: {
        contract: 'skillforge-analysis-v1',
        language: 'ru',
        instructions: ['Evaluate'],
      },
    });

    expect(scope?.attemptTopicById.get(attemptId)).toBe('js.topic');
    expect(scope?.topicKeys.has('js.topic')).toBe(true);
  });

  it('rejects malformed or non-contract source payloads', () => {
    expect(parseImportSourceScope({ bundleId: randomUUID() })).toBeNull();
  });
});
