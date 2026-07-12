import { afterEach, describe, expect, it, vi } from 'vitest';
import { runCode } from '@/features/runner/run-code';

class SilentWorker {
  static instance: SilentWorker | null = null;
  readonly terminate = vi.fn();
  readonly postMessage = vi.fn();
  addEventListener = vi.fn();

  constructor() {
    SilentWorker.instance = this;
  }
}

describe('browser worker runner timeout', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    SilentWorker.instance = null;
  });

  it('terminates an infinite/silent worker after the configured deadline', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Worker', SilentWorker);
    const pending = runCode({
      requestId: 'timeout-test',
      language: 'javascript',
      source: 'while (true) {}',
      harness: '',
      timeoutMs: 2_000,
    });
    await vi.advanceTimersByTimeAsync(2_000);
    const result = await pending;
    expect(result.status).toBe('timeout');
    expect(SilentWorker.instance?.terminate).toHaveBeenCalledOnce();
  });
});
