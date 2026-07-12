import { randomUUID } from 'node:crypto';

import helmet from '@fastify/helmet';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.js';
import { ApiExceptionFilter } from './common/exception.filter.js';

export type SkillForgeApplication = {
  app: NestFastifyApplication;
  openapi: OpenAPIObject;
};

export async function createSkillForgeApplication(): Promise<SkillForgeApplication> {
  const adapter = new FastifyAdapter({
    bodyLimit: Number(process.env.IMPORT_MAX_BYTES ?? 5_242_880) + 65_536,
    genReqId: () => `req_${randomUUID()}`,
    logger: false,
  });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    bufferLogs: true,
  });
  const logger = app.get(Logger);
  app.useLogger(logger);
  app.enableShutdownHooks();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter(logger));
  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });

  const openapi = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('SkillForge API')
      .setDescription('Локальный evidence-based learning API. AI mode по умолчанию manual.')
      .setVersion('1.0.0')
      .build(),
    { operationIdFactory: (controllerKey, methodKey) => `${controllerKey}_${methodKey}` },
  );
  SwaggerModule.setup('api/docs', app, openapi, {
    jsonDocumentUrl: 'api/openapi.json',
    customSiteTitle: 'SkillForge API',
  });

  return { app, openapi };
}
