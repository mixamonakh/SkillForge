import { describe, expect, it } from 'vitest';

import { calculateReadiness, isReadinessSufficient, type ReadinessTarget } from '../src/index.js';

const target: ReadinessTarget = {
  key: 'frontend-target',
  version: '1',
  requiredTopics: [
    { topicKey: 'js.1', domainKey: 'js', weight: 1 },
    { topicKey: 'js.2', domainKey: 'js', weight: 1 },
    { topicKey: 'algo.1', domainKey: 'algorithms', weight: 1 },
    { topicKey: 'web.1', domainKey: 'web', weight: 1 },
    { topicKey: 'web.2', domainKey: 'web', weight: 1 },
  ],
  gates: [{ key: 'js-core', domainKey: 'js', minimumScore: 60, cap: 59 }],
};

describe('readiness sufficiency', () => {
  it('shows partial calibration and no fabricated score below 60% coverage', () => {
    const result = calculateReadiness(target, [
      { topicKey: 'js.1', status: 'SOLID', masteryEstimate: 80 },
      { topicKey: 'web.1', status: 'SOLID', masteryEstimate: 80 },
    ]);
    expect(result).toMatchObject({
      state: 'PARTIALLY_CALIBRATED',
      assessedRequiredTopics: 2,
      requiredTopics: 5,
      coverage: 0.4,
      overallScore: null,
    });
    expect(result.disclaimer).toContain('не вероятность оффера');
  });

  it('calculates only after the exact minimum coverage and applies gates', () => {
    expect(isReadinessSufficient(3, 5)).toBe(true);
    const result = calculateReadiness(target, [
      { topicKey: 'js.1', status: 'WEAK', masteryEstimate: 50 },
      { topicKey: 'js.2', status: 'WEAK', masteryEstimate: 50 },
      { topicKey: 'web.1', status: 'SOLID', masteryEstimate: 90 },
      { topicKey: 'algo.1', status: 'UNKNOWN', masteryEstimate: null },
    ]);
    expect(result.state).toBe('CALIBRATED');
    expect(result.overallScore).toBeLessThanOrEqual(59);
    expect(result.blockingGates).toContainEqual(
      expect.objectContaining({ key: 'js-core', reason: 'below-threshold' }),
    );
  });

  it('does not publish readiness when a configured gate domain has no data', () => {
    const result = calculateReadiness(target, [
      { topicKey: 'algo.1', status: 'SOLID', masteryEstimate: 80 },
      { topicKey: 'web.1', status: 'SOLID', masteryEstimate: 80 },
      { topicKey: 'web.2', status: 'SOLID', masteryEstimate: 80 },
    ]);
    expect(result.state).toBe('CALIBRATED');
    expect(result.overallScore).toBeNull();
    expect(result.blockingGates).toContainEqual(
      expect.objectContaining({ key: 'js-core', reason: 'insufficient-domain-data' }),
    );
  });

  it.each([
    () => isReadinessSufficient(-1, 5),
    () => isReadinessSufficient(1.5, 5),
    () => isReadinessSufficient(1, -1),
    () => isReadinessSufficient(1, 2.5),
    () => isReadinessSufficient(1, 2, 1.1),
  ])('rejects invalid sufficiency inputs', (operation) => {
    expect(operation).toThrow(RangeError);
  });

  it('returns false for empty or impossible coverage and for a below-threshold ratio', () => {
    expect(isReadinessSufficient(0, 0)).toBe(false);
    expect(isReadinessSufficient(6, 5)).toBe(false);
    expect(isReadinessSufficient(2, 5)).toBe(false);
  });

  it('rejects duplicate and malformed target/state data', () => {
    const firstRequiredTopic = target.requiredTopics[0];
    if (firstRequiredTopic === undefined) throw new Error('Expected target fixture topics');
    expect(() =>
      calculateReadiness(target, [
        { topicKey: 'js.1', status: 'SOLID', masteryEstimate: 80 },
        { topicKey: 'js.1', status: 'SOLID', masteryEstimate: 90 },
      ]),
    ).toThrow('Duplicate topic state');
    expect(() =>
      calculateReadiness(target, [{ topicKey: 'js.1', status: 'SOLID', masteryEstimate: 101 }]),
    ).toThrow(RangeError);
    expect(() =>
      calculateReadiness(
        { ...target, requiredTopics: [firstRequiredTopic, firstRequiredTopic] },
        [],
      ),
    ).toThrow('Duplicate required topic');
    expect(() =>
      calculateReadiness(
        { ...target, requiredTopics: [{ topicKey: 'bad', domainKey: 'js', weight: 0 }] },
        [],
      ),
    ).toThrow(RangeError);
    expect(() => calculateReadiness({ ...target, minimumCoverage: -1 }, [])).toThrow(RangeError);
    expect(() =>
      calculateReadiness(
        { ...target, gates: [{ key: 'bad', domainKey: 'js', minimumScore: 101, cap: 50 }] },
        [],
      ),
    ).toThrow(RangeError);
    expect(() =>
      calculateReadiness(
        { ...target, gates: [{ key: 'bad', domainKey: 'js', minimumScore: 50, cap: -1 }] },
        [],
      ),
    ).toThrow(RangeError);
  });

  it('handles an empty target and a calibrated target without blocking gates', () => {
    const empty = calculateReadiness({ key: 'empty', version: '1', requiredTopics: [] }, []);
    expect(empty).toMatchObject({ state: 'NOT_CALIBRATED', coverage: 0, overallScore: null });

    const openTarget: ReadinessTarget = {
      key: 'open',
      version: '1',
      minimumCoverage: 1,
      requiredTopics: [
        { topicKey: 'a', domainKey: 'a-domain', weight: 2 },
        { topicKey: 'b', domainKey: 'b-domain', weight: 1 },
      ],
      gates: [],
    };
    const result = calculateReadiness(openTarget, [
      { topicKey: 'a', status: 'SOLID', masteryEstimate: 90 },
      { topicKey: 'b', status: 'SOLID', masteryEstimate: 60 },
    ]);
    expect(result).toMatchObject({ state: 'CALIBRATED', overallScore: 80 });
    expect(result.strongestDomains).toEqual(['a-domain', 'b-domain']);
  });
});
