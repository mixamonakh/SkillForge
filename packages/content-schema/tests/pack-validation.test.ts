import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadContentPack, validateContentPack } from '../src/index.js';

const baselinePackPath = path.resolve(process.cwd(), '../../content/packs/js-baseline-v1');

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
    pack.manifest.requiresAppSchema = '>=2.0.0 <3.0.0';

    const report = await validateContentPack(pack);

    expect(report.valid).toBe(false);
    expect(report.errors).toContainEqual(
      expect.objectContaining({ code: 'INCOMPATIBLE_APP_SCHEMA' }),
    );
  });
});
