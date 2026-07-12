import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/client/client.js';

export type SkillForgePrismaClient = PrismaClient;

export function createPrismaClient(databaseUrl = process.env.DATABASE_URL): PrismaClient {
  if (databaseUrl === undefined || databaseUrl.length === 0) {
    throw new Error('DATABASE_URL обязателен для подключения к PostgreSQL');
  }

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({ adapter });
}
