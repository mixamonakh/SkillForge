import { describe, expect, it } from 'vitest';

import { sufficiency, topicRelevance } from '../src/modules/metrics/metrics-utils.js';

describe('metrics honest-state helpers', () => {
  it('does not claim sufficiency for an empty topic set', () => {
    expect(sufficiency(0, 0)).toEqual({
      sufficient: false,
      coverage: 0,
      reason: 'Оценено 0 из 0 тем',
    });
  });

  it('keeps coverage separate from the configured sufficiency gate', () => {
    expect(sufficiency(6, 10)).toMatchObject({ sufficient: true, coverage: 0.6 });
    expect(sufficiency(5, 10)).toMatchObject({ sufficient: false, coverage: 0.5 });
  });

  it('reads only numeric curated relevance', () => {
    expect(topicRelevance({ yandexRelevance: 5 })).toBe(5);
    expect(topicRelevance({ yandexRelevance: '5' })).toBe(0);
    expect(topicRelevance(null)).toBe(0);
  });
});
