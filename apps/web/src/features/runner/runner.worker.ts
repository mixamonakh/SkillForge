/// <reference lib="webworker" />

import ts from 'typescript';
import type { RunnerRequest, RunnerResponse } from '@skillforge/contracts';
import { appendConsoleLine, createRunnerAssert } from './runner-utils';

const workerScope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;
const MAX_SOURCE_BYTES = 50 * 1024;

workerScope.addEventListener('message', (event: MessageEvent<RunnerRequest>) => {
  const request = event.data;
  const startedAt = performance.now();
  const consoleLines: string[] = [];
  const tests: RunnerResponse['tests'] = [];

  const response = (partial: Omit<RunnerResponse, 'requestId' | 'console' | 'durationMs'>) => {
    workerScope.postMessage({
      requestId: request.requestId,
      console: consoleLines,
      durationMs: Math.round(performance.now() - startedAt),
      ...partial,
    } satisfies RunnerResponse);
  };

  if (new TextEncoder().encode(request.source).byteLength > MAX_SOURCE_BYTES) {
    response({
      status: 'runtime-error',
      tests,
      error: { name: 'SourceLimitError', message: 'Код превышает лимит 50 КБ.' },
    });
    return;
  }

  try {
    Object.defineProperties(workerScope, {
      fetch: { value: undefined, configurable: false },
      WebSocket: { value: undefined, configurable: false },
      EventSource: { value: undefined, configurable: false },
      importScripts: { value: undefined, configurable: false },
    });
  } catch {
    // Some browsers expose a non-configurable importScripts; the user function never receives it.
  }

  const captureConsole = Object.freeze({
    log: (...values: unknown[]) => {
      appendConsoleLine(consoleLines, values);
    },
    warn: (...values: unknown[]) => {
      appendConsoleLine(consoleLines, values, '[warn] ');
    },
    error: (...values: unknown[]) => {
      appendConsoleLine(consoleLines, values, '[error] ');
    },
  });

  const test = (name: string, execute: () => void) => {
    try {
      execute();
      tests.push({ name, passed: true });
    } catch (error: unknown) {
      tests.push({
        name,
        passed: false,
        message: error instanceof Error ? error.message : 'Неизвестная ошибка теста',
      });
    }
  };
  // Content harnesses intentionally use the familiar Node-style assert API.
  // Keep the callable form too, so authored packs can express boolean invariants.
  const assert = createRunnerAssert();
  const equal = (actual: unknown, expected: unknown) => assert.equal(actual, expected);
  const deepEqual = (actual: unknown, expected: unknown) => assert.deepEqual(actual, expected);

  try {
    const sourceWithoutExports = request.source.replace(
      /\bexport\s+(?=(?:async\s+)?(?:function|class|const|let|var)\b)/g,
      '',
    );
    let source = sourceWithoutExports;
    if (request.language === 'typescript') {
      const transpiled = ts.transpileModule(sourceWithoutExports, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
        reportDiagnostics: true,
      });
      const errors = (transpiled.diagnostics ?? []).filter(
        (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
      );
      if (errors.length > 0) {
        throw new SyntaxError(
          errors
            .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
            .join('\n'),
        );
      }
      source = transpiled.outputText;
    }
    const execute = new Function(
      'safeConsole',
      'test',
      'assert',
      'equal',
      'deepEqual',
      'fetch',
      'WebSocket',
      'EventSource',
      'importScripts',
      'globalThis',
      'self',
      'window',
      'document',
      `"use strict"; const console = safeConsole; ${source}\n${request.harness}`,
    );
    execute(
      captureConsole,
      test,
      assert,
      equal,
      deepEqual,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );
    response({ status: tests.every((item) => item.passed) ? 'passed' : 'failed', tests });
  } catch (error: unknown) {
    const normalized = error instanceof Error ? error : new Error(String(error));
    const errorDetails: NonNullable<RunnerResponse['error']> = {
      name: normalized.name,
      message: normalized.message,
      ...(normalized.stack === undefined ? {} : { stack: normalized.stack }),
    };
    response({
      status: 'runtime-error',
      tests,
      error: errorDetails,
    });
  }
});

export {};
