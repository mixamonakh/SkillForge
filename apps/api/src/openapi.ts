import 'reflect-metadata';

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { createSkillForgeApplication } from './bootstrap.js';

async function generateOpenApi(): Promise<void> {
  process.env.DATABASE_URL ??= 'postgresql://openapi:openapi@127.0.0.1:5432/openapi?schema=public';
  process.env.NODE_ENV ??= 'test';
  const { app, openapi } = await createSkillForgeApplication();
  const target = fileURLToPath(new URL('../openapi.json', import.meta.url));
  await writeFile(target, `${JSON.stringify(openapi, null, 2)}\n`, 'utf8');
  await app.close();
}

await generateOpenApi();
