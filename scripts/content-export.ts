import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createPrismaClient, exportContentPackSnapshot } from '@skillforge/db';
import { projectRoot, readOption, reportCliError, writeJson } from './content-cli.js';

async function main(): Promise<void> {
  const prisma = createPrismaClient();
  try {
    const requestedOutput = readOption('--out') ?? './backup/content.json';
    const outputPath = path.resolve(projectRoot, requestedOutput);
    const temporaryPath = `${outputPath}.tmp-${String(process.pid)}`;
    const snapshot = await exportContentPackSnapshot(prisma);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    await rename(temporaryPath, outputPath);
    writeJson({ outputPath });
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch(reportCliError);
