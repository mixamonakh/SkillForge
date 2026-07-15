import { fileURLToPath } from 'node:url';

import { loadContentPack } from '@skillforge/content-schema';
import { describe, expect, it } from 'vitest';

import {
  collectContentReviewArtifacts,
  contentReviewReportMarkdown,
  fakeContentReviewProvider,
  reviewContentPack,
} from '../src/index.js';

const PACK_PATH = fileURLToPath(
  new URL('../../../content/packs/js-core-training-v1/', import.meta.url),
);

describe('bounded content AI review', () => {
  it('reviews every reviewable pack artifact through the fake provider without approval', async () => {
    const pack = await loadContentPack(PACK_PATH);
    const artifacts = collectContentReviewArtifacts(pack);
    const report = await reviewContentPack(fakeContentReviewProvider(artifacts), pack, {
      batchSize: 3,
      generatedAt: '2026-07-15T20:00:00.000Z',
    });

    expect(artifacts).toHaveLength(17);
    expect(report).toMatchObject({
      packKey: 'js-core-training-v1',
      provider: 'fake',
      model: 'fake-deterministic-v1',
      batchSize: 3,
      totals: {
        items: 17,
        pass: 0,
        needsHumanReview: 17,
        blockImport: 0,
      },
    });
    expect(report.items.every((item) => item.result.verdict === 'NEEDS_HUMAN_REVIEW')).toBe(true);
    expect(report.items.every((item) => item.result.findings.length === 1)).toBe(true);
    expect(contentReviewReportMarkdown(report)).toContain(
      'AI review is advisory and never changes source JSON.',
    );
  });

  it('rejects an oversized pack review before invoking the provider', async () => {
    const pack = await loadContentPack(PACK_PATH);
    const artifacts = collectContentReviewArtifacts(pack);
    await expect(
      reviewContentPack(fakeContentReviewProvider(artifacts), pack, { maxItems: 16 }),
    ).rejects.toThrow('Pack contains 17 review items');
  });

  it('enforces a small concurrency batch bound', async () => {
    const pack = await loadContentPack(PACK_PATH);
    const artifacts = collectContentReviewArtifacts(pack);
    await expect(
      reviewContentPack(fakeContentReviewProvider(artifacts), pack, { batchSize: 11 }),
    ).rejects.toThrow('batchSize must be an integer between 1 and 10');
  });
});
