import {
  assertValidContentPack,
  loadContentPack,
  type LoadedContentPack,
} from '@skillforge/content-schema';

import type { Prisma } from '../../generated/client/client.js';
import { ContentStatus } from '../../generated/client/enums.js';

export const contentStatusBySource = {
  active: ContentStatus.ACTIVE,
  archived: ContentStatus.ARCHIVED,
  draft: ContentStatus.DRAFT,
} as const;

export function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function resolvePack(
  packOrPath: LoadedContentPack | string,
): Promise<LoadedContentPack> {
  const pack = typeof packOrPath === 'string' ? await loadContentPack(packOrPath) : packOrPath;
  await assertValidContentPack(pack);
  return pack;
}
