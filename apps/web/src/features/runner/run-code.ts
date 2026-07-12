import type { RunnerRequest, RunnerResponse } from '@skillforge/contracts';

const DEFAULT_TIMEOUT_MS = 2_000;

export function runCode(request: RunnerRequest): Promise<RunnerResponse> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./runner.worker.ts', import.meta.url), { type: 'module' });
    const timeoutMs = Math.min(Math.max(request.timeoutMs, 100), 5_000) || DEFAULT_TIMEOUT_MS;
    const startedAt = performance.now();
    const timeout = window.setTimeout(() => {
      worker.terminate();
      resolve({
        requestId: request.requestId,
        status: 'timeout',
        tests: [],
        console: [],
        durationMs: Math.round(performance.now() - startedAt),
        error: { name: 'TimeoutError', message: `Выполнение остановлено через ${timeoutMs} мс.` },
      });
    }, timeoutMs);

    worker.addEventListener(
      'message',
      (event: MessageEvent<RunnerResponse>) => {
        window.clearTimeout(timeout);
        worker.terminate();
        resolve(event.data);
      },
      { once: true },
    );
    worker.addEventListener(
      'error',
      (event) => {
        window.clearTimeout(timeout);
        worker.terminate();
        reject(new Error(event.message || 'Worker завершился с ошибкой.'));
      },
      { once: true },
    );
    worker.postMessage(request);
  });
}
