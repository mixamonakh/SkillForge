import { describe, expect, it } from 'vitest';

import { calculateCalibration } from '../src/index.js';

describe('confidence calibration', () => {
  it('withholds the aggregate until five evaluated attempts', () => {
    expect(
      calculateCalibration([
        { confidence: 90, evaluatedScore: 70 },
        { confidence: 80, evaluatedScore: 70 },
        { confidence: 70, evaluatedScore: 70 },
        { confidence: 60, evaluatedScore: 70 },
      ]),
    ).toEqual({
      state: 'INSUFFICIENT_DATA',
      evaluatedAttempts: 4,
      minimumAttempts: 5,
      meanAbsoluteGap: null,
    });
  });

  it('publishes mean absolute gap at the documented threshold', () => {
    expect(
      calculateCalibration([
        { confidence: 90, evaluatedScore: 70 },
        { confidence: 80, evaluatedScore: 70 },
        { confidence: 70, evaluatedScore: 70 },
        { confidence: 60, evaluatedScore: 70 },
        { confidence: 50, evaluatedScore: 70 },
      ]),
    ).toMatchObject({ state: 'CALIBRATED', evaluatedAttempts: 5, meanAbsoluteGap: 12 });
  });
});
