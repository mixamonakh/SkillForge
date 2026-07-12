import { describe, expect, it } from 'vitest';

import { DisabledAiProvider } from '../src/modules/ai/disabled-ai.provider.js';

describe('DisabledAiProvider', () => {
  it('is the manual no-network provider and fails with stable AI_DISABLED', async () => {
    const provider = new DisabledAiProvider();
    expect(provider.mode).toBe('manual');
    await expect(provider.analyzeAttempt({ answer: 'private' })).rejects.toMatchObject({
      code: 'AI_DISABLED',
    });
  });
});
