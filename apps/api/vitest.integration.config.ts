import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      AI_MODE: 'manual',
      DATABASE_URL:
        process.env.DATABASE_URL ??
        'postgresql://skillforge:skillforge@127.0.0.1:5432/skillforge?schema=public',
      LOG_LEVEL: 'silent',
      NODE_ENV: 'test',
    },
    environment: 'node',
    include: ['test/**/*.integration.test.ts'],
    testTimeout: 30_000,
  },
});
