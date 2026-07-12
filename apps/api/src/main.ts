import 'reflect-metadata';

import { Logger } from 'nestjs-pino';

import { createSkillForgeApplication } from './bootstrap.js';

async function bootstrap(): Promise<void> {
  const { app } = await createSkillForgeApplication();
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
  app.get(Logger).log({ port, service: 'skillforge-api' }, 'SkillForge API started');
}

void bootstrap();
