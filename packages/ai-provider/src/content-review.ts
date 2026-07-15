import type { LoadedContentPack } from '@skillforge/content-schema';

import {
  CONTENT_REVIEW_CONTRACT,
  ReviewContentInputSchema,
  type ContentReviewResult,
  type ReviewContentInput,
} from './contracts.js';
import { FakeAiProvider } from './fake-provider.js';
import { promptForFeature } from './prompt-registry.js';
import type { AiProvider, AiTokenUsage } from './provider.js';

export type ContentReviewArtifactType = 'CONTENT_ITEM' | 'TASK' | 'ASSESSMENT' | 'SEQUENCE';

export type ContentReviewArtifact = {
  stableKey: string;
  version: number;
  topicKey: string;
  artifactType: ContentReviewArtifactType;
  content: ReviewContentInput['content'];
};

export type ContentReviewReportItem = {
  artifactType: ContentReviewArtifactType;
  result: ContentReviewResult;
};

export type ContentReviewReport = {
  schemaVersion: '1.0';
  packKey: string;
  packVersion: string;
  packChecksum: string;
  provider: string;
  model: string;
  promptKey: string;
  promptVersion: number;
  generatedAt: string;
  batchSize: number;
  totals: {
    items: number;
    pass: number;
    needsHumanReview: number;
    blockImport: number;
    usage: AiTokenUsage;
  };
  items: ContentReviewReportItem[];
};

export type ReviewContentPackOptions = {
  batchSize?: number;
  maxItems?: number;
  generatedAt?: string;
};

function jsonValue(value: unknown): ReviewContentInput['content'] {
  return ReviewContentInputSchema.shape.content.parse(JSON.parse(JSON.stringify(value)) as unknown);
}

export function collectContentReviewArtifacts(pack: LoadedContentPack): ContentReviewArtifact[] {
  const taskTopics = new Map(
    pack.tasks.map((task) => [`${task.stableKey}@${String(task.version)}`, task.topicKey]),
  );
  const artifacts: ContentReviewArtifact[] = [
    ...pack.contentItems.map((item) => ({
      stableKey: item.stableKey,
      version: item.version,
      topicKey: item.topicKey,
      artifactType: 'CONTENT_ITEM' as const,
      content: jsonValue(item),
    })),
    ...pack.tasks.map((task) => ({
      stableKey: task.stableKey,
      version: task.version,
      topicKey: task.topicKey,
      artifactType: 'TASK' as const,
      content: jsonValue(task),
    })),
    ...pack.assessments.map((assessment) => ({
      stableKey: assessment.key,
      version: assessment.version,
      topicKey: [
        ...new Set(
          assessment.items.flatMap((item) => {
            const topic = taskTopics.get(`${item.taskKey}@${String(item.taskVersion)}`);
            return topic === undefined ? [] : [topic];
          }),
        ),
      ].join('.'),
      artifactType: 'ASSESSMENT' as const,
      content: jsonValue(assessment),
    })),
    ...pack.sequences.map((sequence) => ({
      stableKey: sequence.key,
      version: sequence.version,
      topicKey: sequence.topicKey,
      artifactType: 'SEQUENCE' as const,
      content: jsonValue(sequence),
    })),
  ];
  return artifacts.sort(
    (left, right) => left.stableKey.localeCompare(right.stableKey) || left.version - right.version,
  );
}

function siblingSummaries(
  artifacts: readonly ContentReviewArtifact[],
  current: ContentReviewArtifact,
): ReviewContentInput['siblingSummaries'] {
  return artifacts
    .filter(
      (artifact) =>
        artifact !== current &&
        (artifact.topicKey === current.topicKey || artifact.artifactType === current.artifactType),
    )
    .slice(0, 100)
    .map((artifact) => ({
      stableKey: artifact.stableKey,
      version: artifact.version,
      topicKey: artifact.topicKey,
      artifactType: artifact.artifactType,
    }));
}

function positiveBoundedInteger(
  value: number | undefined,
  fallback: number,
  maximum: number,
  name: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 1 || resolved > maximum) {
    throw new RangeError(`${name} must be an integer between 1 and ${String(maximum)}`);
  }
  return resolved;
}

function addUsage(left: AiTokenUsage, right: AiTokenUsage): AiTokenUsage {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    cachedInputTokens: left.cachedInputTokens + right.cachedInputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
  };
}

export async function reviewContentPack(
  provider: AiProvider,
  pack: LoadedContentPack,
  options: ReviewContentPackOptions = {},
): Promise<ContentReviewReport> {
  const batchSize = positiveBoundedInteger(options.batchSize, 5, 10, 'batchSize');
  const maxItems = positiveBoundedInteger(options.maxItems, 50, 100, 'maxItems');
  const artifacts = collectContentReviewArtifacts(pack);
  if (artifacts.length > maxItems) {
    throw new RangeError(
      `Pack contains ${String(artifacts.length)} review items; maxItems is ${String(maxItems)}`,
    );
  }

  const items: ContentReviewReportItem[] = [];
  let providerName = '';
  let model = '';
  let usage: AiTokenUsage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
  for (let offset = 0; offset < artifacts.length; offset += batchSize) {
    const batch = artifacts.slice(offset, offset + batchSize);
    const results = await Promise.all(
      batch.map(async (artifact) => {
        const input = ReviewContentInputSchema.parse({
          stableKey: artifact.stableKey,
          version: artifact.version,
          content: artifact.content,
          siblingSummaries: siblingSummaries(artifacts, artifact),
        });
        const result = await provider.reviewContent(input);
        return { artifact, result };
      }),
    );
    for (const entry of results) {
      providerName ||= entry.result.provider;
      model ||= entry.result.model;
      if (entry.result.provider !== providerName || entry.result.model !== model) {
        throw new Error('Content review provider/model changed inside one report');
      }
      usage = addUsage(usage, entry.result.usage);
      items.push({ artifactType: entry.artifact.artifactType, result: entry.result.candidate });
    }
  }

  const prompt = promptForFeature('CONTENT_REVIEW');
  return {
    schemaVersion: '1.0',
    packKey: pack.manifest.key,
    packVersion: pack.manifest.version,
    packChecksum: pack.checksum,
    provider: providerName || 'none',
    model: model || 'none',
    promptKey: prompt.key,
    promptVersion: prompt.version,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    batchSize,
    totals: {
      items: items.length,
      pass: items.filter((item) => item.result.verdict === 'PASS').length,
      needsHumanReview: items.filter((item) => item.result.verdict === 'NEEDS_HUMAN_REVIEW').length,
      blockImport: items.filter((item) => item.result.verdict === 'BLOCK_IMPORT').length,
      usage,
    },
    items,
  };
}

function fakeResult(artifact: ContentReviewArtifact): ContentReviewResult {
  return {
    contract: CONTENT_REVIEW_CONTRACT,
    stableKey: artifact.stableKey,
    version: artifact.version,
    verdict: 'NEEDS_HUMAN_REVIEW',
    findings: [
      {
        code: 'FAKE_PROVIDER_HUMAN_REVIEW_REQUIRED',
        severity: 'WARNING',
        fieldPath: null,
        message: 'Fake provider validates the flow but cannot approve content quality.',
        suggestedAction: 'Run human review or explicit live provider review before activation.',
      },
    ],
    checks: {
      correctness: 'Not decided by the fake provider; human review is required.',
      ambiguity: 'Not decided by the fake provider; human review is required.',
      rubricAlignment: 'Not decided by the fake provider; human review is required.',
      stageFit: 'Not decided by the fake provider; human review is required.',
      sourceQuality: 'Not decided by the fake provider; human review is required.',
      duplicateRisk: 'Sibling context was supplied; human review is required.',
      triviaRisk: 'Not decided by the fake provider; human review is required.',
      solutionLeakage: 'Not decided by the fake provider; human review is required.',
    },
  };
}

export function fakeContentReviewProvider(
  artifacts: readonly ContentReviewArtifact[],
): FakeAiProvider {
  return new FakeAiProvider({
    fixtures: {
      contentReviews: Object.fromEntries(
        artifacts.map((artifact) => [
          `${artifact.stableKey}@${String(artifact.version)}`,
          fakeResult(artifact),
        ]),
      ),
    },
  });
}

export function contentReviewReportMarkdown(report: ContentReviewReport): string {
  const itemLines = report.items
    .map((item) => {
      const findings = item.result.findings
        .map((finding) => `  - ${finding.severity} \`${finding.code}\`: ${finding.message}`)
        .join('\n');
      return `- **${item.result.verdict}** \`${item.result.stableKey}@${String(item.result.version)}\` (${item.artifactType})${findings ? `\n${findings}` : ''}`;
    })
    .join('\n');
  return `# SkillForge content AI review\n\n- Pack: \`${report.packKey}@${report.packVersion}\`\n- Checksum: \`${report.packChecksum}\`\n- Provider/model: \`${report.provider}/${report.model}\`\n- Prompt: \`${report.promptKey}@${String(report.promptVersion)}\`\n- Generated: ${report.generatedAt}\n- Bounded batch size: ${String(report.batchSize)}\n- PASS: ${String(report.totals.pass)}\n- NEEDS_HUMAN_REVIEW: ${String(report.totals.needsHumanReview)}\n- BLOCK_IMPORT: ${String(report.totals.blockImport)}\n\nAI review is advisory and never changes source JSON. Human approval is still required by the content quality gate.\n\n## Items\n\n${itemLines}\n`;
}
