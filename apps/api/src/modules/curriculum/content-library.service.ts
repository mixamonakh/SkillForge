import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import type { ContentQueryDto } from './curriculum.dto.js';

type LibraryItem = {
  id: string;
  stableKey: string;
  version: number;
  kind: string;
  title: string;
  topicKey: string;
  topicTitle: string;
  sourcePack: string;
  sourceVersion: string;
  checksum: string;
  status: string;
  bodyPreview: string | null;
};

function librarySortKey(item: LibraryItem): string {
  return `${item.kind}\u0000${item.stableKey}\u0000${String(item.version).padStart(8, '0')}`;
}

function decodeCursor(cursor: string | undefined): string | null {
  if (!cursor) return null;
  try {
    return Buffer.from(cursor, 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

@Injectable()
export class ContentLibraryService {
  public constructor(private readonly database: PrismaService) {}

  public async content(query: ContentQueryDto): Promise<unknown> {
    const [contentItems, tasks, blueprints, counts, sourcePacks] = await Promise.all([
      query.kind === 'TASK' || query.kind === 'ASSESSMENT'
        ? Promise.resolve([])
        : this.database.client.contentItem.findMany({
            where: {
              status: 'ACTIVE',
              ...(query.topicKey ? { topic: { key: query.topicKey } } : {}),
              ...(query.kind ? { kind: query.kind } : {}),
            },
            include: { topic: { select: { key: true, title: true } } },
          }),
      query.kind && query.kind !== 'TASK'
        ? Promise.resolve([])
        : this.database.client.taskVersion.findMany({
            where: {
              task: {
                status: 'ACTIVE',
                ...(query.topicKey ? { topic: { key: query.topicKey } } : {}),
              },
            },
            include: { task: { include: { topic: { select: { key: true, title: true } } } } },
          }),
      query.kind && query.kind !== 'ASSESSMENT'
        ? Promise.resolve([])
        : this.database.client.assessmentBlueprint.findMany({ where: { status: 'ACTIVE' } }),
      Promise.all([
        this.database.client.topic.count({ where: { status: 'ACTIVE' } }),
        this.database.client.task.count({ where: { status: 'ACTIVE' } }),
        this.database.client.taskVersion.count({ where: { task: { status: 'ACTIVE' } } }),
        this.database.client.contentItem.count({
          where: { status: 'ACTIVE', kind: { in: ['THEORY', 'LINK', 'CHECKLIST'] } },
        }),
        this.database.client.assessmentBlueprint.count({ where: { status: 'ACTIVE' } }),
      ]),
      this.database.client.contentPack.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { importedAt: 'desc' },
      }),
    ]);
    const items: LibraryItem[] = [
      ...contentItems.map((item) => ({
        id: item.id,
        stableKey: item.stableKey,
        version: item.version,
        kind: item.kind,
        title: item.title,
        topicKey: item.topic.key,
        topicTitle: item.topic.title,
        sourcePack: item.sourcePack,
        sourceVersion: item.sourceVersion,
        checksum: item.checksum,
        status: item.status,
        bodyPreview: item.bodyMarkdown?.slice(0, 240) ?? null,
      })),
      ...tasks.map((version) => ({
        id: version.id,
        stableKey: version.task.stableKey,
        version: version.version,
        kind: 'TASK',
        title: version.task.stableKey,
        topicKey: version.task.topic.key,
        topicTitle: version.task.topic.title,
        sourcePack: version.sourcePack,
        sourceVersion: version.sourceVersion,
        checksum: version.checksum,
        status: version.task.status,
        bodyPreview: version.promptMarkdown.slice(0, 240),
      })),
      ...blueprints.map((blueprint) => ({
        id: blueprint.id,
        stableKey: blueprint.key,
        version: blueprint.version,
        kind: 'ASSESSMENT',
        title: blueprint.title,
        topicKey: 'assessment',
        topicTitle: 'Диагностика',
        sourcePack: blueprint.sourcePack,
        sourceVersion: blueprint.sourceVersion,
        checksum: blueprint.checksum,
        status: blueprint.status,
        bodyPreview: blueprint.description.slice(0, 240),
      })),
    ].sort((left, right) => librarySortKey(left).localeCompare(librarySortKey(right)));
    const after = decodeCursor(query.cursor);
    const filtered = after ? items.filter((item) => librarySortKey(item) > after) : items;
    const limit = query.limit ?? 60;
    const page = filtered.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page,
      counts: {
        topics: counts[0],
        tasks: counts[1],
        taskVersions: counts[2],
        theory: counts[3],
        blueprints: counts[4],
      },
      sourcePacks: sourcePacks.map((pack) => ({
        key: pack.key,
        version: pack.version,
        validationStatus: pack.status === 'ACTIVE' ? 'VALID' : pack.status,
      })),
      nextCursor:
        filtered.length > page.length && last
          ? Buffer.from(librarySortKey(last), 'utf8').toString('base64url')
          : null,
    };
  }
}
