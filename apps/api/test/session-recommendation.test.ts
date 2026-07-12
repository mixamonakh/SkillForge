import { describe, expect, it } from 'vitest';
import { repeatedMistakeScores } from '../src/modules/sessions/session-recommendation.service.js';

describe('session recommendation misconception signal', () => {
  it('stays zero for a single finding and rises only for a repeated misconception', () => {
    const scores = repeatedMistakeScores([
      { misconceptionId: 'closures-scope', topicIds: ['topic-a'] },
      { misconceptionId: 'different-error', topicIds: ['topic-a'] },
      { misconceptionId: 'closures-scope', topicIds: ['topic-a', 'topic-a'] },
    ]);

    expect(scores.get('topic-a')).toBe(50);
  });

  it('caps the normalized factor and keeps topics independent', () => {
    const occurrences = Array.from({ length: 6 }, () => ({
      misconceptionId: 'same-error',
      topicIds: ['topic-a'],
    }));
    occurrences.push({ misconceptionId: 'single', topicIds: ['topic-b'] });

    const scores = repeatedMistakeScores(occurrences);
    expect(scores.get('topic-a')).toBe(100);
    expect(scores.get('topic-b')).toBe(0);
  });
});
