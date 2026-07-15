import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { loadContentPack, validateContentPack } from '../src/index.js';

const baselinePackPath = path.resolve(process.cwd(), '../../content/packs/js-baseline-v1');
const temporaryRoots: string[] = [];

const validSequence = {
  schemaVersion: '1.0',
  key: 'cs.values-and-references.acquisition-v1',
  version: 1,
  topicKey: 'cs.values-and-references',
  phase: 'ACQUISITION',
  estimatedMinutes: 20,
  steps: [
    {
      kind: 'CONTENT',
      contentItemKey: 'cs.values-and-references.note-001',
      version: 1,
    },
    {
      kind: 'TASK',
      taskKey: 'cs.values-and-references.predict-001',
      version: 1,
      purpose: 'PREDICT',
    },
  ],
  completionRule: {
    requiredSteps: 2,
    minimumNoHelpSuccesses: 1,
  },
} as const;

async function copyPackWithSequence(): Promise<string> {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'skillforge-content-'));
  temporaryRoots.push(temporaryRoot);
  const packPath = path.join(temporaryRoot, 'js-baseline-v1');
  await cp(baselinePackPath, packPath, { recursive: true });

  const manifestPath = path.join(packPath, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    counts: { topics: number; tasks: number; assessments: number; sequences?: number };
  };
  manifest.counts.sequences = 1;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await mkdir(path.join(packPath, 'sequences'));
  await writeFile(
    path.join(packPath, 'sequences', '01-acquisition.json'),
    `${JSON.stringify([validSequence], null, 2)}\n`,
    'utf8',
  );

  return packPath;
}

async function copyPackWithoutAssessments(): Promise<string> {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'skillforge-content-training-'));
  temporaryRoots.push(temporaryRoot);
  const packPath = path.join(temporaryRoot, 'js-training-v1');
  await cp(baselinePackPath, packPath, { recursive: true });

  const manifestPath = path.join(packPath, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    key: string;
    counts: { assessments: number };
    requirements: { baselineItems: number; blocks: number; itemsPerBlock: number };
  };
  manifest.key = 'js-training-v1';
  manifest.counts.assessments = 0;
  manifest.requirements.baselineItems = 0;
  manifest.requirements.blocks = 0;
  manifest.requirements.itemsPerBlock = 0;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await rm(path.join(packPath, 'assessments'), { recursive: true });

  return packPath;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })));
});

describe('js-baseline-v1 content pack', () => {
  it('выполняет обязательные количественные и ссылочные контракты', async () => {
    const pack = await loadContentPack(baselinePackPath);
    const report = await validateContentPack(pack);

    expect(report.errors).toEqual([]);
    expect(report.valid).toBe(true);
    expect(report.summary).toMatchObject({
      topics: 18,
      tasks: 72,
      assessments: 1,
      assessmentItems: 36,
      taskKinds: 8,
    });
    expect(pack.assessments[0]?.items).toHaveLength(36);
    expect(pack.checksum).toBe('a04237a841140b2a443693799eae4977740cd53299bb2a6bca739eb87934c1d2');
    expect(pack.sequences).toEqual([]);
    expect(pack.manifest.counts).toEqual({ topics: 18, tasks: 72, assessments: 1 });
    expect(report.summary.sequences).toBe(0);
    expect(pack.tasks.every((task) => !('schemaVersion' in task.metadata))).toBe(true);
  });

  it('читает optional versioned sequences и учитывает объявленный count', async () => {
    const pack = await loadContentPack(await copyPackWithSequence());
    const report = await validateContentPack(pack);

    expect(report.errors).toEqual([]);
    expect(pack.manifest.counts.sequences).toBe(1);
    expect(pack.sequences).toHaveLength(1);
    expect(pack.sequences[0]).toMatchObject(validSequence);
    expect(pack.sequences[0]?.checksum).toMatch(/^[a-f0-9]{64}$/u);
    expect(pack.checksum).not.toBe(
      'a04237a841140b2a443693799eae4977740cd53299bb2a6bca739eb87934c1d2',
    );
  });

  it('поддерживает training pack без декоративного assessment', async () => {
    const pack = await loadContentPack(await copyPackWithoutAssessments());
    const report = await validateContentPack(pack);

    expect(report.errors).toEqual([]);
    expect(pack.manifest.counts.assessments).toBe(0);
    expect(pack.assessments).toEqual([]);
    expect(report.summary).toMatchObject({ assessments: 0, assessmentItems: 0 });
  });

  it('не допускает baseline thresholds у pack без assessment', async () => {
    const pack = await loadContentPack(await copyPackWithoutAssessments());
    pack.manifest.requirements.blocks = 1;

    const report = await validateContentPack(pack);

    expect(report.errors).toContainEqual(
      expect.objectContaining({ code: 'ASSESSMENT_REQUIREMENTS_WITHOUT_ASSESSMENT' }),
    );
  });

  it('отклоняет duplicate sequence version и неверные exact refs', async () => {
    const pack = structuredClone(await loadContentPack(await copyPackWithSequence()));
    const sequence = pack.sequences[0];
    expect(sequence).toBeDefined();
    if (sequence === undefined) {
      return;
    }
    const taskStep = sequence.steps.find((step) => step.kind === 'TASK');
    expect(taskStep).toBeDefined();
    if (taskStep?.kind !== 'TASK') {
      return;
    }
    taskStep.version = 999;
    pack.sequences.push(structuredClone(sequence));

    const report = await validateContentPack(pack);

    expect(report.valid).toBe(false);
    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'DUPLICATE_SEQUENCE_VERSION' }),
        expect.objectContaining({ code: 'MISSING_SEQUENCE_TASK_VERSION' }),
        expect.objectContaining({ code: 'SEQUENCE_COUNT_MISMATCH' }),
      ]),
    );
  });

  it('отклоняет sequence step из другой topic и no-help bound', async () => {
    const pack = structuredClone(await loadContentPack(await copyPackWithSequence()));
    const sequence = pack.sequences[0];
    expect(sequence).toBeDefined();
    if (sequence === undefined) {
      return;
    }
    const taskStep = sequence.steps.find((step) => step.kind === 'TASK');
    expect(taskStep).toBeDefined();
    if (taskStep?.kind !== 'TASK') {
      return;
    }
    taskStep.taskKey = 'cs.mutability.predict-001';
    sequence.completionRule.minimumNoHelpSuccesses = 2;

    const report = await validateContentPack(pack);

    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'SEQUENCE_TASK_TOPIC_MISMATCH' }),
        expect.objectContaining({ code: 'SEQUENCE_NO_HELP_SUCCESSES_OUT_OF_RANGE' }),
      ]),
    );
  });

  it('содержит ровно два baseline item на каждую тему', async () => {
    const pack = await loadContentPack(baselinePackPath);
    const taskByKey = new Map(pack.tasks.map((task) => [task.stableKey, task]));
    const counts = new Map<string, number>();
    for (const item of pack.assessments[0]?.items ?? []) {
      const task = taskByKey.get(item.taskKey);
      expect(task).toBeDefined();
      if (task !== undefined) {
        counts.set(task.topicKey, (counts.get(task.topicKey) ?? 0) + 1);
      }
    }

    expect([...counts.values()]).toHaveLength(18);
    expect([...counts.values()].every((count) => count === 2)).toBe(true);
  });

  it('отклоняет item за пределами assessment blocks', async () => {
    const pack = structuredClone(await loadContentPack(baselinePackPath));
    const assessment = pack.assessments[0];
    const item = assessment?.items[0];
    expect(assessment).toBeDefined();
    expect(item).toBeDefined();
    if (assessment === undefined || item === undefined) {
      return;
    }
    item.blockIndex = assessment.totalBlocks;

    const report = await validateContentPack(pack);

    expect(report.valid).toBe(false);
    expect(report.errors).toContainEqual(
      expect.objectContaining({ code: 'ASSESSMENT_BLOCK_OUT_OF_RANGE' }),
    );
  });

  it('сверяет assessment grid с manifest requirements', async () => {
    const pack = structuredClone(await loadContentPack(baselinePackPath));
    pack.manifest.requirements.blocks += 1;

    const report = await validateContentPack(pack);

    expect(report.valid).toBe(false);
    expect(report.errors).toContainEqual(
      expect.objectContaining({ code: 'ASSESSMENT_BLOCK_COUNT_MISMATCH' }),
    );
  });

  it('проверяет синтаксис и assert contract runner tests', async () => {
    const pack = structuredClone(await loadContentPack(baselinePackPath));
    const codeTask = pack.tasks.find((task) => task.kind === 'CODE');
    const testCase = codeTask?.testCases[0];
    expect(testCase).toBeDefined();
    if (testCase === undefined) {
      return;
    }
    testCase.testCode = 'assert.throws(() => {';

    const report = await validateContentPack(pack);

    expect(report.valid).toBe(false);
    expect(report.errors).toContainEqual(expect.objectContaining({ code: 'INVALID_TEST_CODE' }));
    expect(report.errors).toContainEqual(
      expect.objectContaining({ code: 'UNSUPPORTED_RUNNER_ASSERT' }),
    );
  });

  it('отклоняет pack для несовместимой app schema', async () => {
    const pack = structuredClone(await loadContentPack(baselinePackPath));
    pack.manifest.requiresAppSchema = '>=3.0.0 <4.0.0';

    const report = await validateContentPack(pack);

    expect(report.valid).toBe(false);
    expect(report.errors).toContainEqual(
      expect.objectContaining({ code: 'INCOMPATIBLE_APP_SCHEMA' }),
    );
  });
});
