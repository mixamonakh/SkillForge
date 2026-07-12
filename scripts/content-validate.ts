import path from 'node:path';

import { loadContentPack, validateContentPack } from '@skillforge/content-schema';
import { listPackPaths, readOption, reportCliError, writeJson } from './content-cli.js';

async function main(): Promise<void> {
  const packPaths = await listPackPaths(readOption('--pack'));
  if (packPaths.length === 0) {
    throw new Error('В content/packs не найдено ни одного pack');
  }

  const results = [];
  let valid = true;
  for (const packPath of packPaths) {
    const pack = await loadContentPack(packPath);
    const report = await validateContentPack(pack);
    results.push({
      pack: path.basename(packPath),
      version: pack.manifest.version,
      checksum: pack.checksum,
      ...report,
    });
    valid &&= report.valid;
  }

  writeJson({ valid, packs: results });
  if (!valid) {
    process.exitCode = 1;
  }
}

void main().catch(reportCliError);
