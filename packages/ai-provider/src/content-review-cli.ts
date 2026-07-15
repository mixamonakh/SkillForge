import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { loadContentPack } from '@skillforge/content-schema';

import {
  collectContentReviewArtifacts,
  contentReviewReportMarkdown,
  fakeContentReviewProvider,
  reviewContentPack,
} from './content-review.js';
import { aiModelRouterConfigFromEnv } from './model-router.js';
import { OpenAiProvider } from './openai-provider.js';
import type { AiProvider } from './provider.js';

type CliOptions = {
  packKey: string;
  provider: 'fake' | 'openai';
  live: boolean;
  batchSize: number;
  maxItems: number;
  workspaceRoot: string;
  outputDirectory: string;
};

function optionValue(arguments_: readonly string[], name: string): string | undefined {
  const index = arguments_.indexOf(name);
  return index >= 0 ? arguments_[index + 1] : undefined;
}

function integerOption(arguments_: readonly string[], name: string, fallback: number): number {
  const raw = optionValue(arguments_, name);
  const parsed = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(parsed)) throw new RangeError(`${name} must be an integer`);
  return parsed;
}

export function contentReviewCliOptions(
  arguments_: readonly string[],
  currentDirectory = process.cwd(),
): CliOptions {
  const packKey = optionValue(arguments_, '--pack')?.trim();
  if (!packKey || !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(packKey)) {
    throw new RangeError('--pack must be a stable content pack key');
  }
  const provider = optionValue(arguments_, '--provider') ?? 'fake';
  if (provider !== 'fake' && provider !== 'openai') {
    throw new RangeError('--provider must be fake or openai');
  }
  const workspaceRoot = resolve(currentDirectory, '../..');
  return {
    packKey,
    provider,
    live: arguments_.includes('--live'),
    batchSize: integerOption(arguments_, '--batch-size', 5),
    maxItems: integerOption(arguments_, '--max-items', 50),
    workspaceRoot,
    outputDirectory: resolve(
      optionValue(arguments_, '--output-dir') ??
        resolve(workspaceRoot, 'reports/content-ai-review'),
    ),
  };
}

function openAiProvider(options: CliOptions): OpenAiProvider {
  if (!options.live) {
    throw new Error(
      'OpenAI content review requires explicit --live to prevent accidental paid calls',
    );
  }
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error('OPENAI_API_KEY is required for --provider openai --live');
  return new OpenAiProvider({
    apiKey,
    ...(process.env.OPENAI_PROJECT_ID ? { projectId: process.env.OPENAI_PROJECT_ID } : {}),
    ...(process.env.OPENAI_ORGANIZATION_ID
      ? { organizationId: process.env.OPENAI_ORGANIZATION_ID }
      : {}),
    models: aiModelRouterConfigFromEnv(process.env),
  });
}

export async function runContentReviewCli(arguments_: readonly string[]): Promise<void> {
  const options = contentReviewCliOptions(arguments_);
  const pack = await loadContentPack(
    resolve(options.workspaceRoot, 'content/packs', options.packKey),
  );
  let provider: AiProvider;
  if (options.provider === 'openai') {
    provider = openAiProvider(options);
  } else {
    provider = fakeContentReviewProvider(collectContentReviewArtifacts(pack));
  }
  const report = await reviewContentPack(provider, pack, {
    batchSize: options.batchSize,
    maxItems: options.maxItems,
  });
  await mkdir(options.outputDirectory, { recursive: true });
  const basename = `${options.packKey}-${options.provider}`;
  const jsonPath = resolve(options.outputDirectory, `${basename}.json`);
  const markdownPath = resolve(options.outputDirectory, `${basename}.md`);
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(markdownPath, contentReviewReportMarkdown(report), 'utf8');
  process.stdout.write(
    `Content review ${String(report.totals.items)} items: PASS ${String(report.totals.pass)}, HUMAN ${String(report.totals.needsHumanReview)}, BLOCK ${String(report.totals.blockImport)}\n`,
  );
}

await runContentReviewCli(process.argv.slice(2));
