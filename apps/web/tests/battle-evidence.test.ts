import { describe, expect, it } from 'vitest';
import { parseExternalAnalysis } from '@/features/battle/battle-evidence';

describe('Battle Evidence external analysis', () => {
  it('accepts an optional JSON object without treating it as evidence', () => {
    expect(parseExternalAnalysis('')).toBeUndefined();
    expect(parseExternalAnalysis('{"summary":"checked","confidence":0.65}')).toEqual({
      summary: 'checked',
      confidence: 0.65,
    });
  });

  it('rejects malformed and non-object JSON', () => {
    expect(() => parseExternalAnalysis('{broken')).toThrow(/валидным JSON object/);
    expect(() => parseExternalAnalysis('[1,2]')).toThrow(/JSON object/);
  });
});
