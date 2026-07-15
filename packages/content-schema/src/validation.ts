import { access } from 'node:fs/promises';
import path from 'node:path';

import { APP_CONTENT_SCHEMA_VERSION, supportsAppSchema } from './app-schema-version.js';
import type { ContentValidationIssue } from './errors.js';
import { ContentValidationError } from './errors.js';
import type { LoadedContentPack } from './loader.js';
import { validateRunnerTests } from './runner-validation.js';

export type ContentValidationSummary = {
  tracks: number;
  topics: number;
  tasks: number;
  assessments: number;
  sequences: number;
  assessmentItems: number;
  taskKinds: number;
  deterministicTasks: number;
};

export type ContentValidationReport = {
  valid: boolean;
  errors: ContentValidationIssue[];
  warnings: ContentValidationIssue[];
  summary: ContentValidationSummary;
};

const unsafeHtmlPattern = /<\s*(script|iframe|object|embed)\b|\bon[a-z]+\s*=|javascript\s*:/iu;
const localMarkdownLinkPattern = /\[[^\]]*\]\((\.{1,2}\/[^)\s]+)\)/gu;

function addDuplicateErrors(
  values: readonly string[],
  code: string,
  label: string,
  errors: ContentValidationIssue[],
): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      errors.push({ code, message: `Дублируется ${label}: ${value}` });
    }
    seen.add(value);
  }
}

function findDependencyCycle(pack: LoadedContentPack): string[] | null {
  const adjacency = new Map(pack.topics.map((topic) => [topic.key, topic.prerequisites]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  function visit(topicKey: string): string[] | null {
    if (visiting.has(topicKey)) {
      const cycleStart = stack.indexOf(topicKey);
      return [...stack.slice(cycleStart), topicKey];
    }
    if (visited.has(topicKey)) {
      return null;
    }

    visiting.add(topicKey);
    stack.push(topicKey);
    for (const prerequisite of adjacency.get(topicKey) ?? []) {
      const cycle = visit(prerequisite);
      if (cycle !== null) {
        return cycle;
      }
    }
    stack.pop();
    visiting.delete(topicKey);
    visited.add(topicKey);
    return null;
  }

  for (const topicKey of adjacency.keys()) {
    const cycle = visit(topicKey);
    if (cycle !== null) {
      return cycle;
    }
  }
  return null;
}

async function validateLocalLinks(
  pack: LoadedContentPack,
  errors: ContentValidationIssue[],
): Promise<void> {
  const markdownSources = [
    ...pack.tasks.map((task) => ({ key: task.stableKey, markdown: task.promptMarkdown })),
    ...pack.contentItems
      .filter((item) => item.bodyMarkdown !== undefined)
      .map((item) => ({ key: item.stableKey, markdown: item.bodyMarkdown ?? '' })),
  ];

  for (const source of markdownSources) {
    for (const match of source.markdown.matchAll(localMarkdownLinkPattern)) {
      const relativeTarget = match[1];
      if (relativeTarget === undefined) {
        continue;
      }
      const target = path.resolve(pack.rootPath, relativeTarget);
      if (!target.startsWith(`${pack.rootPath}${path.sep}`)) {
        errors.push({
          code: 'UNSAFE_LOCAL_REFERENCE',
          message: `${source.key}: ссылка выходит за пределы pack`,
        });
        continue;
      }
      try {
        await access(target);
      } catch {
        errors.push({
          code: 'BROKEN_LOCAL_REFERENCE',
          message: `${source.key}: не найден ${relativeTarget}`,
        });
      }
    }
  }
}

function validateTaskContracts(pack: LoadedContentPack, errors: ContentValidationIssue[]): void {
  for (const task of pack.tasks) {
    if (unsafeHtmlPattern.test(task.promptMarkdown)) {
      errors.push({
        code: 'UNSAFE_HTML',
        message: `${task.stableKey}: prompt содержит запрещённый HTML/URL`,
      });
    }

    validateRunnerTests(task, errors);

    if (task.kind === 'CODE') {
      if (
        task.starterCode === undefined ||
        task.language === undefined ||
        task.testCases.length === 0
      ) {
        errors.push({
          code: 'CODE_TASK_WITHOUT_TESTS',
          message: `${task.stableKey}: CODE требует starterCode, language и testCases`,
        });
      }
      if (!task.testCases.some((testCase) => testCase.hidden)) {
        errors.push({
          code: 'CODE_TASK_WITHOUT_HIDDEN_TEST',
          message: `${task.stableKey}: нужен хотя бы один hidden test`,
        });
      }
      if (!task.testCases.some((testCase) => !testCase.hidden)) {
        errors.push({
          code: 'CODE_TASK_WITHOUT_VISIBLE_TEST',
          message: `${task.stableKey}: нужен хотя бы один visible test`,
        });
      }
    }

    if (task.kind === 'PREDICT_OUTPUT') {
      const output = task.expectedAnswer?.output;
      if (!Array.isArray(output) || !output.every((line) => typeof line === 'string')) {
        errors.push({
          code: 'PREDICT_WITHOUT_OUTPUT',
          message: `${task.stableKey}: expectedAnswer.output должен быть string[]`,
        });
      }
    }

    if (task.kind === 'SINGLE_CHOICE' || task.kind === 'MULTIPLE_CHOICE') {
      const selectedOptionIds = task.expectedAnswer?.selectedOptionIds;
      const optionIds = new Set(task.options?.map((option) => option.id) ?? []);
      if (
        task.options === undefined ||
        !Array.isArray(selectedOptionIds) ||
        !selectedOptionIds.every(
          (optionId) => typeof optionId === 'string' && optionIds.has(optionId),
        )
      ) {
        errors.push({
          code: 'CHOICE_CONTRACT_INVALID',
          message: `${task.stableKey}: options/selectedOptionIds не согласованы`,
        });
      }
      if (
        task.kind === 'SINGLE_CHOICE' &&
        (!Array.isArray(selectedOptionIds) || selectedOptionIds.length !== 1)
      ) {
        errors.push({
          code: 'SINGLE_CHOICE_CARDINALITY',
          message: `${task.stableKey}: SINGLE_CHOICE требует ровно один ответ`,
        });
      }
    }
  }
}

function validateBlueprints(pack: LoadedContentPack, errors: ContentValidationIssue[]): void {
  const taskByVersion = new Map(
    pack.tasks.map((task) => [`${task.stableKey}@${String(task.version)}`, task]),
  );

  for (const assessment of pack.assessments) {
    const positions = new Set<string>();
    const topicCounts = new Map<string, number>();

    for (const item of assessment.items) {
      if (item.blockIndex >= assessment.totalBlocks) {
        errors.push({
          code: 'ASSESSMENT_BLOCK_OUT_OF_RANGE',
          message: `${assessment.key}: blockIndex ${String(item.blockIndex)} вне диапазона 0..${String(assessment.totalBlocks - 1)}`,
        });
      }

      const positionKey = `${String(item.blockIndex)}:${String(item.position)}`;
      if (positions.has(positionKey)) {
        errors.push({
          code: 'DUPLICATE_ASSESSMENT_POSITION',
          message: `${assessment.key}@${String(assessment.version)}: ${positionKey}`,
        });
      }
      positions.add(positionKey);

      const task = taskByVersion.get(`${item.taskKey}@${String(item.taskVersion)}`);
      if (task === undefined) {
        errors.push({
          code: 'MISSING_ASSESSMENT_TASK',
          message: `${assessment.key}: не найдена ${item.taskKey}@${String(item.taskVersion)}`,
        });
      } else {
        topicCounts.set(task.topicKey, (topicCounts.get(task.topicKey) ?? 0) + 1);
      }
    }

    for (let blockIndex = 0; blockIndex < assessment.totalBlocks; blockIndex += 1) {
      const blockPositions = assessment.items
        .filter((item) => item.blockIndex === blockIndex)
        .map((item) => item.position)
        .sort((left, right) => left - right);
      const expected = Array.from(
        { length: assessment.selectionRules.itemsPerBlock },
        (_, index) => index,
      );
      if (JSON.stringify(blockPositions) !== JSON.stringify(expected)) {
        errors.push({
          code: 'INVALID_ASSESSMENT_POSITIONS',
          message: `${assessment.key}: блок ${String(blockIndex)} должен иметь позиции 0..${String(assessment.selectionRules.itemsPerBlock - 1)}`,
        });
      }
    }

    for (const topic of pack.topics) {
      if ((topicCounts.get(topic.key) ?? 0) < assessment.selectionRules.minimumItemsPerTopic) {
        errors.push({
          code: 'INSUFFICIENT_TOPIC_COVERAGE',
          message: `${assessment.key}: для ${topic.key} меньше ${String(assessment.selectionRules.minimumItemsPerTopic)} независимых items`,
        });
      }
    }
  }
}

function validateLearningSequences(
  pack: LoadedContentPack,
  errors: ContentValidationIssue[],
): void {
  const topicKeys = new Set(pack.topics.map((topic) => topic.key));
  const contentByVersion = new Map(
    pack.contentItems.map((item) => [`${item.stableKey}@${String(item.version)}`, item]),
  );
  const taskByVersion = new Map(
    pack.tasks.map((task) => [`${task.stableKey}@${String(task.version)}`, task]),
  );

  for (const sequence of pack.sequences) {
    if (!topicKeys.has(sequence.topicKey)) {
      errors.push({
        code: 'MISSING_SEQUENCE_TOPIC',
        message: `${sequence.key}@${String(sequence.version)}: не найдена topic ${sequence.topicKey}`,
      });
    }

    if (sequence.completionRule.requiredSteps > sequence.steps.length) {
      errors.push({
        code: 'SEQUENCE_REQUIRED_STEPS_OUT_OF_RANGE',
        message: `${sequence.key}@${String(sequence.version)}: requiredSteps превышает количество steps`,
      });
    }

    const taskStepCount = sequence.steps.filter((step) => step.kind === 'TASK').length;
    if (
      sequence.completionRule.minimumNoHelpSuccesses > taskStepCount ||
      sequence.completionRule.minimumNoHelpSuccesses > sequence.completionRule.requiredSteps
    ) {
      errors.push({
        code: 'SEQUENCE_NO_HELP_SUCCESSES_OUT_OF_RANGE',
        message: `${sequence.key}@${String(sequence.version)}: minimumNoHelpSuccesses вне допустимого диапазона`,
      });
    }

    for (const step of sequence.steps) {
      if (step.kind === 'CONTENT') {
        const item = contentByVersion.get(`${step.contentItemKey}@${String(step.version)}`);
        if (item === undefined) {
          errors.push({
            code: 'MISSING_SEQUENCE_CONTENT_VERSION',
            message: `${sequence.key}: не найден content item ${step.contentItemKey}@${String(step.version)}`,
          });
        } else if (item.topicKey !== sequence.topicKey) {
          errors.push({
            code: 'SEQUENCE_CONTENT_TOPIC_MISMATCH',
            message: `${sequence.key}: content item ${step.contentItemKey}@${String(step.version)} относится к ${item.topicKey}`,
          });
        }
        continue;
      }

      const task = taskByVersion.get(`${step.taskKey}@${String(step.version)}`);
      if (task === undefined) {
        errors.push({
          code: 'MISSING_SEQUENCE_TASK_VERSION',
          message: `${sequence.key}: не найдена task ${step.taskKey}@${String(step.version)}`,
        });
      } else if (task.topicKey !== sequence.topicKey) {
        errors.push({
          code: 'SEQUENCE_TASK_TOPIC_MISMATCH',
          message: `${sequence.key}: task ${step.taskKey}@${String(step.version)} относится к ${task.topicKey}`,
        });
      }
    }
  }
}

export async function validateContentPack(
  pack: LoadedContentPack,
): Promise<ContentValidationReport> {
  const errors: ContentValidationIssue[] = [];
  const warnings: ContentValidationIssue[] = [];
  const trackKeys = new Set(pack.tracks.map((track) => track.key));
  const topicKeys = new Set(pack.topics.map((topic) => topic.key));
  const manifestTrackKeys = new Set(pack.manifest.tracks);

  if (path.basename(pack.rootPath) !== pack.manifest.key) {
    errors.push({
      code: 'PACK_DIRECTORY_MISMATCH',
      message: `Каталог ${path.basename(pack.rootPath)} не совпадает с manifest.key ${pack.manifest.key}`,
    });
  }

  addDuplicateErrors(
    pack.tracks.map((track) => track.key),
    'DUPLICATE_TRACK_KEY',
    'track key',
    errors,
  );
  addDuplicateErrors(pack.manifest.tracks, 'DUPLICATE_MANIFEST_TRACK', 'manifest track', errors);
  addDuplicateErrors(
    pack.topics.map((topic) => topic.key),
    'DUPLICATE_TOPIC_KEY',
    'topic key',
    errors,
  );
  addDuplicateErrors(
    pack.tasks.map((task) => `${task.stableKey}@${String(task.version)}`),
    'DUPLICATE_TASK_VERSION',
    'task version',
    errors,
  );
  addDuplicateErrors(
    pack.contentItems.map((item) => `${item.stableKey}@${String(item.version)}`),
    'DUPLICATE_CONTENT_VERSION',
    'content item version',
    errors,
  );
  addDuplicateErrors(
    pack.assessments.map((assessment) => `${assessment.key}@${String(assessment.version)}`),
    'DUPLICATE_ASSESSMENT_VERSION',
    'assessment version',
    errors,
  );
  addDuplicateErrors(
    pack.sequences.map((sequence) => `${sequence.key}@${String(sequence.version)}`),
    'DUPLICATE_SEQUENCE_VERSION',
    'learning sequence version',
    errors,
  );

  for (const manifestTrack of pack.manifest.tracks) {
    if (!trackKeys.has(manifestTrack)) {
      errors.push({ code: 'MISSING_MANIFEST_TRACK', message: `Не найден track ${manifestTrack}` });
    }
  }
  for (const track of pack.tracks) {
    if (!manifestTrackKeys.has(track.key)) {
      errors.push({
        code: 'UNDECLARED_TRACK',
        message: `Track ${track.key} отсутствует в manifest`,
      });
    }
  }
  if (!supportsAppSchema(pack.manifest.requiresAppSchema)) {
    errors.push({
      code: 'INCOMPATIBLE_APP_SCHEMA',
      message: `Pack требует ${pack.manifest.requiresAppSchema}, приложение использует ${APP_CONTENT_SCHEMA_VERSION}`,
    });
  }
  for (const topic of pack.topics) {
    if (!trackKeys.has(topic.trackKey)) {
      errors.push({ code: 'MISSING_TOPIC_TRACK', message: `${topic.key}: ${topic.trackKey}` });
    }
    for (const prerequisite of topic.prerequisites) {
      if (!topicKeys.has(prerequisite)) {
        errors.push({
          code: 'MISSING_PREREQUISITE',
          message: `${topic.key}: не найдена prerequisite ${prerequisite}`,
        });
      }
      if (prerequisite === topic.key) {
        errors.push({ code: 'SELF_PREREQUISITE', message: `${topic.key}: self dependency` });
      }
    }
  }
  for (const task of pack.tasks) {
    if (!topicKeys.has(task.topicKey)) {
      errors.push({ code: 'MISSING_TASK_TOPIC', message: `${task.stableKey}: ${task.topicKey}` });
    }
  }
  for (const item of pack.contentItems) {
    if (!topicKeys.has(item.topicKey)) {
      errors.push({
        code: 'MISSING_CONTENT_TOPIC',
        message: `${item.stableKey}: ${item.topicKey}`,
      });
    }
    if (item.bodyMarkdown !== undefined && unsafeHtmlPattern.test(item.bodyMarkdown)) {
      errors.push({ code: 'UNSAFE_HTML', message: `${item.stableKey}: запрещённый HTML/URL` });
    }
  }

  const cycle = findDependencyCycle(pack);
  if (cycle !== null) {
    errors.push({ code: 'PREREQUISITE_CYCLE', message: cycle.join(' -> ') });
  }

  validateTaskContracts(pack, errors);
  validateBlueprints(pack, errors);
  validateLearningSequences(pack, errors);
  await validateLocalLinks(pack, errors);

  const assessmentItems = pack.assessments.reduce(
    (total, assessment) => total + assessment.items.length,
    0,
  );
  const taskKinds = new Set(pack.tasks.map((task) => task.kind)).size;
  const deterministicTasks = pack.tasks.filter((task) =>
    ['CODE', 'PREDICT_OUTPUT', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE'].includes(task.kind),
  ).length;
  const requirements = pack.manifest.requirements;
  if (
    pack.assessments.length === 0 &&
    (requirements.baselineItems !== 0 ||
      requirements.blocks !== 0 ||
      requirements.itemsPerBlock !== 0)
  ) {
    errors.push({
      code: 'ASSESSMENT_REQUIREMENTS_WITHOUT_ASSESSMENT',
      message:
        'Pack без assessments должен объявлять baselineItems, blocks и itemsPerBlock равными 0',
    });
  }
  for (const assessment of pack.assessments) {
    if (assessment.totalBlocks !== requirements.blocks) {
      errors.push({
        code: 'ASSESSMENT_BLOCK_COUNT_MISMATCH',
        message: `${assessment.key}: totalBlocks должен быть ${String(requirements.blocks)}`,
      });
    }
    if (assessment.selectionRules.itemsPerBlock !== requirements.itemsPerBlock) {
      errors.push({
        code: 'ASSESSMENT_ITEMS_PER_BLOCK_MISMATCH',
        message: `${assessment.key}: itemsPerBlock должен быть ${String(requirements.itemsPerBlock)}`,
      });
    }
    const expectedItemCount = assessment.totalBlocks * assessment.selectionRules.itemsPerBlock;
    if (assessment.items.length !== expectedItemCount) {
      errors.push({
        code: 'ASSESSMENT_GRID_SIZE_MISMATCH',
        message: `${assessment.key}: ожидается ${String(expectedItemCount)} items, получено ${String(assessment.items.length)}`,
      });
    }
  }
  const thresholdChecks: Array<[boolean, string, string]> = [
    [pack.topics.length === pack.manifest.counts.topics, 'TOPIC_COUNT_MISMATCH', 'topics'],
    [pack.tasks.length === pack.manifest.counts.tasks, 'TASK_COUNT_MISMATCH', 'tasks'],
    [
      pack.manifest.counts.sequences === undefined ||
        pack.sequences.length === pack.manifest.counts.sequences,
      'SEQUENCE_COUNT_MISMATCH',
      'sequences',
    ],
    [
      pack.assessments.length === pack.manifest.counts.assessments,
      'ASSESSMENT_COUNT_MISMATCH',
      'assessments',
    ],
    [assessmentItems >= requirements.baselineItems, 'BASELINE_ITEM_COUNT', 'baseline items'],
    [taskKinds >= requirements.minimumTaskKinds, 'TASK_KIND_COUNT', 'task kinds'],
    [
      deterministicTasks >= requirements.minimumDeterministicTasks,
      'DETERMINISTIC_TASK_COUNT',
      'deterministic tasks',
    ],
    [
      pack.tasks.filter((task) => task.kind === 'EXPLAIN').length >=
        requirements.minimumExplanationTasks,
      'EXPLANATION_TASK_COUNT',
      'explanation tasks',
    ],
    [
      pack.tasks.filter((task) => task.kind === 'FIND_BUG').length >=
        requirements.minimumDebuggingTasks,
      'DEBUGGING_TASK_COUNT',
      'debugging tasks',
    ],
    [
      pack.tasks.filter((task) => task.kind === 'AI_REVIEW' || task.kind === 'COMPARE_SOLUTIONS')
        .length >= requirements.minimumAiReviewOrCompareTasks,
      'AI_REVIEW_COMPARE_TASK_COUNT',
      'AI review / compare tasks',
    ],
    [
      pack.tasks.filter((task) => task.metadata.mixedEvidence).length >=
        requirements.minimumMixedTasks,
      'MIXED_TASK_COUNT',
      'mixed tasks',
    ],
  ];
  for (const [passed, code, label] of thresholdChecks) {
    if (!passed) {
      errors.push({ code, message: `Не выполнен контракт pack: ${label}` });
    }
  }

  for (const topic of pack.topics) {
    const taskCount = pack.tasks.filter((task) => task.topicKey === topic.key).length;
    if (taskCount < 2) {
      errors.push({
        code: 'INSUFFICIENT_INDEPENDENT_TASKS',
        message: `${topic.key}: требуется минимум две задачи`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary: {
      tracks: pack.tracks.length,
      topics: pack.topics.length,
      tasks: pack.tasks.length,
      assessments: pack.assessments.length,
      sequences: pack.sequences.length,
      assessmentItems,
      taskKinds,
      deterministicTasks,
    },
  };
}

export async function assertValidContentPack(pack: LoadedContentPack): Promise<void> {
  const report = await validateContentPack(pack);
  if (!report.valid) {
    throw new ContentValidationError('Content pack не прошёл semantic validation', report.errors);
  }
}
