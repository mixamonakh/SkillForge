import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { CapabilityController } from '../src/modules/capability/capability.controller.js';
import { CapabilityProjectionService } from '../src/modules/capability/capability-projection.service.js';

describe('CapabilityController HTTP routes', () => {
  let app: NestFastifyApplication;
  let server: FastifyInstance;
  const topicProfile = vi.fn().mockResolvedValue({
    topicKey: 'js.references',
    algorithmVersion: 'capability-profile-v1.0',
    capabilities: {},
  });
  const userSummary = vi.fn().mockResolvedValue({
    algorithmVersion: 'capability-profile-v1.0',
    topics: [],
    coverage: {
      topicCount: 0,
      capabilityStates: { NOT_TESTED: 0, INSUFFICIENT: 0, SUFFICIENT: 0 },
    },
  });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CapabilityController],
      providers: [
        {
          provide: CapabilityProjectionService,
          useValue: { topicProfile, userSummary },
        },
      ],
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix('api/v1');
    await app.init();
    server = app.getHttpAdapter().getInstance();
    await server.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('publishes the exact topic capability-profile route', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/v1/topics/js.references/capability-profile',
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      topicKey: 'js.references',
      algorithmVersion: 'capability-profile-v1.0',
    });
    expect(topicProfile).toHaveBeenCalledWith('js.references');
  });

  it('publishes the exact local-user capability-summary route', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/v1/users/me/capability-summary',
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      algorithmVersion: 'capability-profile-v1.0',
      coverage: { topicCount: 0 },
    });
    expect(userSummary).toHaveBeenCalledOnce();
  });
});
