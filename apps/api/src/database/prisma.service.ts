import { Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { createPrismaClient, type SkillForgePrismaClient } from '@skillforge/db';

@Injectable()
export class PrismaService implements OnModuleInit, OnApplicationShutdown {
  public readonly client: SkillForgePrismaClient;

  public constructor() {
    this.client = createPrismaClient();
  }

  public async onModuleInit(): Promise<void> {
    await this.client.$connect();
  }

  public async onApplicationShutdown(): Promise<void> {
    await this.client.$disconnect();
  }
}
