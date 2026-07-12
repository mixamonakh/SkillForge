import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    exclude: ['test/**/*.integration.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: [
        'src/common/bound-runner-result.ts',
        'src/modules/assessment/deterministic-evaluation.ts',
        'src/modules/import-export/export-scope.ts',
        'src/modules/import-export/import-source-scope.ts',
        'src/modules/metrics/metrics-utils.ts',
        'src/modules/sessions/session-planner.ts',
      ],
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
});
