import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/client/client.js';

export type SkillForgePrismaClient = PrismaClient;

export function createPrismaClient(databaseUrl = process.env.DATABASE_URL): PrismaClient {
  if (databaseUrl === undefined || databaseUrl.length === 0) {
    throw new Error('DATABASE_URL обязателен для подключения к PostgreSQL');
  }

  const connectionUrl = new URL(databaseUrl);
  const schema = connectionUrl.searchParams.get('schema')?.trim();
  connectionUrl.searchParams.delete('schema');
  const adapter = new PrismaPg(
    { connectionString: connectionUrl.toString() },
    schema ? { schema } : undefined,
  );
  return new PrismaClient({ adapter });
}
