import { createPrismaClient, ensureDefaultUser, importContentPack } from '@skillforge/db';
import { readOption, reportCliError, resolvePackPath, writeJson } from './content-cli.js';

async function main(): Promise<void> {
  const prisma = createPrismaClient();
  try {
    const packName = readOption('--pack') ?? process.env.SEED_CONTENT_PACK ?? 'js-baseline-v1';
    await ensureDefaultUser(prisma);
    const result = await importContentPack(prisma, resolvePackPath(packName));
    writeJson(result);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch(reportCliError);
