import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { sha256 } from './checksum.js';
import { ContentValidationError } from './errors.js';
import {
  AssessmentBlueprintSchema,
  ContentItemSchema,
  LearningSequenceBlueprintSchema,
  ManifestSchema,
  TaskSchema,
  TopicSchema,
  TrackSchema,
  type AssessmentBlueprint,
  type ContentManifest,
  type ContentItem,
  type LearningSequenceBlueprint,
  type ContentTask,
  type ContentTopic,
  type ContentTrack,
} from './schema.js';

export type VersionedContentTask = ContentTask & { checksum: string };
export type VersionedContentItem = ContentItem & { checksum: string };
export type VersionedAssessmentBlueprint = AssessmentBlueprint & { checksum: string };
export type VersionedLearningSequenceBlueprint = LearningSequenceBlueprint & { checksum: string };

export type LoadedContentPack = {
  rootPath: string;
  manifest: ContentManifest;
  tracks: ContentTrack[];
  topics: ContentTopic[];
  contentItems: VersionedContentItem[];
  tasks: VersionedContentTask[];
  assessments: VersionedAssessmentBlueprint[];
  sequences: VersionedLearningSequenceBlueprint[];
  checksum: string;
};

async function readJsonFile(filePath: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(filePath, 'utf8');
  } catch (error: unknown) {
    throw new ContentValidationError(`Не удалось прочитать ${filePath}`, [
      { code: 'FILE_READ_ERROR', message: error instanceof Error ? error.message : String(error) },
    ]);
  }

  try {
    return JSON.parse(text) as unknown;
  } catch (error: unknown) {
    throw new ContentValidationError(`Некорректный JSON в ${filePath}`, [
      { code: 'INVALID_JSON', message: error instanceof Error ? error.message : String(error) },
    ]);
  }
}

function parseFile<T>(schema: z.ZodType<T>, raw: unknown, filePath: string): T {
  const result = schema.safeParse(raw);
  if (result.success) {
    return result.data;
  }

  throw new ContentValidationError(
    `Schema validation failed: ${filePath}`,
    result.error.issues.map((issue) => ({
      code: 'SCHEMA_ERROR',
      message: issue.message,
      path: `${filePath}:${issue.path.join('.')}`,
    })),
  );
}

async function listJsonFiles(directoryPath: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directoryPath, { withFileTypes: true });
  } catch (error: unknown) {
    throw new ContentValidationError(`Не удалось прочитать каталог ${directoryPath}`, [
      {
        code: 'DIRECTORY_READ_ERROR',
        message: error instanceof Error ? error.message : String(error),
      },
    ]);
  }

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(directoryPath, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

async function loadArrayFile<T>(filePath: string, schema: z.ZodType<T>): Promise<T[]> {
  const raw = await readJsonFile(filePath);
  return parseFile(z.array(schema), raw, filePath);
}

async function loadDirectoryArrays<T>(directoryPath: string, schema: z.ZodType<T>): Promise<T[]> {
  const files = await listJsonFiles(directoryPath);
  const arrays = await Promise.all(files.map((filePath) => loadArrayFile(filePath, schema)));
  return arrays.flat();
}

function isMissingPathError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

async function loadOptionalDirectoryArrays<T>(
  directoryPath: string,
  schema: z.ZodType<T>,
): Promise<{ items: T[]; directoryPresent: boolean }> {
  let files: string[];
  try {
    files = (await readdir(directoryPath, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => path.join(directoryPath, entry.name))
      .sort((left, right) => left.localeCompare(right));
  } catch (error: unknown) {
    if (isMissingPathError(error)) {
      return { items: [], directoryPresent: false };
    }
    throw new ContentValidationError(`Не удалось прочитать каталог ${directoryPath}`, [
      {
        code: 'DIRECTORY_READ_ERROR',
        message: error instanceof Error ? error.message : String(error),
      },
    ]);
  }

  const arrays = await Promise.all(files.map((filePath) => loadArrayFile(filePath, schema)));
  return { items: arrays.flat(), directoryPresent: true };
}

export async function loadContentPack(rootPath: string): Promise<LoadedContentPack> {
  const absoluteRoot = path.resolve(rootPath);
  const [manifest, tracks, topics, contentItems, taskSources, assessmentSources, sequenceSources] =
    await Promise.all([
      readJsonFile(path.join(absoluteRoot, 'manifest.json')).then((raw) =>
        parseFile(ManifestSchema, raw, path.join(absoluteRoot, 'manifest.json')),
      ),
      loadArrayFile(path.join(absoluteRoot, 'tracks.json'), TrackSchema),
      loadArrayFile(path.join(absoluteRoot, 'topics.json'), TopicSchema),
      loadArrayFile(path.join(absoluteRoot, 'theory.json'), ContentItemSchema),
      loadDirectoryArrays(path.join(absoluteRoot, 'tasks'), TaskSchema),
      loadOptionalDirectoryArrays(
        path.join(absoluteRoot, 'assessments'),
        AssessmentBlueprintSchema,
      ),
      loadOptionalDirectoryArrays(
        path.join(absoluteRoot, 'sequences'),
        LearningSequenceBlueprintSchema,
      ),
    ]);

  const tasks = taskSources.map((task) => ({ ...task, checksum: sha256(task) }));
  const versionedContentItems = contentItems.map((item) => ({ ...item, checksum: sha256(item) }));
  const assessments = assessmentSources.items.map((assessment) => ({
    ...assessment,
    checksum: sha256(assessment),
  }));
  const sequences = sequenceSources.items.map((sequence) => ({
    ...sequence,
    checksum: sha256(sequence),
  }));
  const checksum = sha256({
    manifest,
    tracks,
    topics,
    contentItems: versionedContentItems,
    tasks,
    assessments,
    ...(sequenceSources.directoryPresent || manifest.counts.sequences !== undefined
      ? { sequences }
      : {}),
  });

  return {
    rootPath: absoluteRoot,
    manifest,
    tracks,
    topics,
    contentItems: versionedContentItems,
    tasks,
    assessments,
    sequences,
    checksum,
  };
}
