import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { EvidenceKind } from '@skillforge/contracts';

import { AI_ATTEMPT_EVALUATION_CONTRACT, type EvaluateAttemptInput } from './contracts.js';
import {
  EvaluatorGoldManifestSchema,
  GoldEvaluationCaseSchema,
  buildCalibrationReport,
  type EvaluatorCalibrationReport,
  type GoldEvaluationCase,
} from './calibration.js';
import { FakeAiProvider } from './fake-provider.js';
import { aiModelRouterConfigFromEnv } from './model-router.js';
import { OpenAiProvider } from './openai-provider.js';
import { promptForFeature } from './prompt-registry.js';
import type { AiProvider } from './provider.js';

type CliOptions = {
  provider: 'fake' | 'openai';
  live: boolean;
  datasetDirectory: string;
  outputJson: string;
  outputMarkdown: string;
};

function optionValue(arguments_: readonly string[], name: string): string | undefined {
  const index = arguments_.indexOf(name);
  return index >= 0 ? arguments_[index + 1] : undefined;
}

function cliOptions(arguments_: readonly string[]): CliOptions {
  const provider = optionValue(arguments_, '--provider') ?? 'fake';
  if (provider !== 'fake' && provider !== 'openai') {
    throw new RangeError('--provider must be fake or openai');
  }
  const workspaceRoot = resolve(process.cwd(), '../..');
  const datasetDirectory = resolve(
    optionValue(arguments_, '--dataset') ?? resolve(workspaceRoot, 'content/evaluator-gold'),
  );
  const outputDirectory = resolve(
    optionValue(arguments_, '--output-dir') ?? resolve(workspaceRoot, 'reports/ai-calibration'),
  );
  return {
    provider,
    live: arguments_.includes('--live'),
    datasetDirectory,
    outputJson: resolve(outputDirectory, `evaluator-gold-v1-${provider}.json`),
    outputMarkdown: resolve(outputDirectory, `evaluator-gold-v1-${provider}.md`),
  };
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

function deterministicAttemptId(caseId: string): string {
  const hex = createHash('sha256').update(caseId).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function taskChecksum(item: GoldEvaluationCase): string {
  return createHash('sha256').update(JSON.stringify(item.task)).digest('hex');
}

const DIMENSION_TO_EVIDENCE: Readonly<Record<string, EvidenceKind>> = Object.freeze({
  TERM: 'RECALL',
  MECHANISM: 'EXPLANATION',
  EXPLANATION: 'EXPLANATION',
  TRACE: 'PREDICT_OUTPUT',
  PREDICT_OUTPUT: 'PREDICT_OUTPUT',
  DEBUG: 'DEBUGGING',
  DEBUGGING: 'DEBUGGING',
  CODE_PRODUCTION: 'CODE_CORRECTNESS',
  CODE_CORRECTNESS: 'CODE_CORRECTNESS',
  EDGE_CASES: 'EDGE_CASES',
  TRANSFER: 'TRANSFER',
});

function evaluationInput(item: GoldEvaluationCase): EvaluateAttemptInput {
  const dimensions = Object.keys(item.humanGold.dimensionRanges);
  const evidenceKinds = [
    ...new Set(dimensions.map((dimension) => DIMENSION_TO_EVIDENCE[dimension] ?? 'EXPLANATION')),
  ];
  return {
    attemptId: deterministicAttemptId(item.caseId),
    task: {
      stableKey: item.task.stableKey,
      version: item.task.version,
      checksum: taskChecksum(item),
      topicKey: item.task.topicKey,
      promptMarkdown: item.task.promptMarkdown,
      rubric: item.task.rubric,
      expectedAnswer: item.task.expectedAnswer ?? null,
      acceptanceCriteria: [],
      allowedDimensions: dimensions,
      allowedMisconceptionKeys: [
        ...new Set([
          ...item.humanGold.requiredMisconceptionKeys,
          ...item.humanGold.forbiddenMisconceptionKeys,
        ]),
      ],
      allowedEvidenceKinds: evidenceKinds,
    },
    answer: {
      text: item.answer.text ?? null,
      code: item.answer.code ?? null,
      selectedOptionIds: [],
      helpLevel: item.answer.helpLevel,
    },
  };
}

async function loadDataset(directory: string): Promise<{
  manifest: ReturnType<typeof EvaluatorGoldManifestSchema.parse>;
  cases: GoldEvaluationCase[];
  fakeCandidates: Readonly<Record<string, unknown>>;
}> {
  const manifest = EvaluatorGoldManifestSchema.parse(
    await readJson(resolve(directory, 'manifest.json')),
  );
  const caseGroups = await Promise.all(
    manifest.caseFiles.map(async (file) => {
      const raw = await readJson(resolve(directory, file));
      if (!Array.isArray(raw)) throw new TypeError(`${file} must contain a JSON array`);
      return raw.map((item) => GoldEvaluationCaseSchema.parse(item));
    }),
  );
  const fakeRaw = await readJson(resolve(directory, 'fake-candidates.json'));
  if (fakeRaw === null || typeof fakeRaw !== 'object' || Array.isArray(fakeRaw)) {
    throw new TypeError('fake-candidates.json must contain a JSON object');
  }
  return {
    manifest,
    cases: caseGroups.flat(),
    fakeCandidates: fakeRaw as Readonly<Record<string, unknown>>,
  };
}

function fakeProvider(
  cases: readonly GoldEvaluationCase[],
  candidates: Readonly<Record<string, unknown>>,
): FakeAiProvider {
  const attemptEvaluations = Object.fromEntries(
    cases.map((item) => {
      const candidate = candidates[item.caseId];
      if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
        throw new TypeError(`Fake candidate is missing for ${item.caseId}`);
      }
      return [
        deterministicAttemptId(item.caseId),
        { ...candidate, attemptId: deterministicAttemptId(item.caseId) },
      ];
    }),
  );
  return new FakeAiProvider({ fixtures: { attemptEvaluations } });
}

function openAiProvider(options: CliOptions): OpenAiProvider {
  if (!options.live) {
    throw new Error('OpenAI calibration requires explicit --live to prevent accidental paid calls');
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

async function evaluateCases(
  provider: AiProvider,
  cases: readonly GoldEvaluationCase[],
): Promise<{ candidates: Record<string, unknown>; model: string }> {
  const candidates: Record<string, unknown> = {};
  let model = '';
  for (const item of cases) {
    const result = await provider.evaluateAttempt(evaluationInput(item));
    candidates[item.caseId] = result.candidate;
    model ||= result.model;
  }
  return { candidates, model };
}

function markdownReport(report: EvaluatorCalibrationReport): string {
  const gates = Object.entries(report.hardGates)
    .map(([key, passed]) => `- ${passed ? 'PASS' : 'FAIL'} — \`${key}\``)
    .join('\n');
  return `# SkillForge evaluator calibration\n\n- Dataset: \`${report.datasetKey}@${String(report.datasetVersion)}\`\n- Status: \`${report.datasetStatus}\`\n- Prompt: \`${report.promptKey}@${String(report.promptVersion)}\`\n- Model: \`${report.model}\`\n- Contract: \`${report.contract}\`\n- Cases: ${String(report.totals.cases)}\n- Full agreement: ${String(report.totals.fullAgreement)}/${String(report.totals.cases)}\n- Eligible for default enablement: **${report.eligibleForDefaultEnablement ? 'YES' : 'NO'}**\n\n## Hard gates\n\n${gates}\n`;
}

async function main(): Promise<void> {
  const options = cliOptions(process.argv.slice(2));
  const dataset = await loadDataset(options.datasetDirectory);
  const provider =
    options.provider === 'fake'
      ? fakeProvider(dataset.cases, dataset.fakeCandidates)
      : openAiProvider(options);
  const evaluation = await evaluateCases(provider, dataset.cases);
  const prompt = promptForFeature('ATTEMPT_EVALUATION');
  const report = buildCalibrationReport({
    manifest: dataset.manifest,
    cases: dataset.cases,
    candidates: evaluation.candidates,
    promptKey: prompt.key,
    promptVersion: prompt.version,
    model: evaluation.model,
    contract: AI_ATTEMPT_EVALUATION_CONTRACT,
    generatedAt: new Date().toISOString(),
  });
  await mkdir(resolve(options.outputJson, '..'), { recursive: true });
  await writeFile(options.outputJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(options.outputMarkdown, markdownReport(report), 'utf8');
  process.stdout.write(
    `Calibration ${String(report.totals.fullAgreement)}/${String(report.totals.cases)}; default enablement: ${report.eligibleForDefaultEnablement ? 'eligible' : 'blocked'}\n`,
  );
}

await main();
