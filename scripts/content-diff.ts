import { createPrismaClient, diffContentPack } from '@skillforge/db';
import { readOption, reportCliError, resolvePackPath, writeJson } from './content-cli.js';

async function main(): Promise<void> {
  const prisma = createPrismaClient();
  try {
    const packName = readOption('--pack') ?? process.env.SEED_CONTENT_PACK ?? 'js-baseline-v1';
    const diff = await diffContentPack(prisma, resolvePackPath(packName));
    writeJson(diff);
    if (diff.conflictDetails.length > 0) {
      process.exitCode = 2;
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch(reportCliError);
