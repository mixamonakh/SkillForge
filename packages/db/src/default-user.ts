import type { PrismaClient } from '../generated/client/client.js';

export const DEFAULT_USER_ID = '00000000-0000-4000-8000-000000000001';

export type DefaultUserOptions = {
  displayName?: string;
  locale?: string;
  userId?: string;
};

export async function ensureDefaultUser(
  prisma: PrismaClient,
  options: DefaultUserOptions = {},
): Promise<{ id: string; created: boolean }> {
  const userId = options.userId ?? DEFAULT_USER_ID;
  const displayName = options.displayName ?? process.env.DEFAULT_USER_NAME ?? 'Михаил';
  const locale = options.locale ?? process.env.DEFAULT_LOCALE ?? 'ru';
  const existing = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });

  if (existing !== null) {
    await prisma.userSettings.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
    return { id: existing.id, created: false };
  }

  await prisma.user.create({
    data: {
      id: userId,
      displayName,
      locale,
      settings: { create: {} },
    },
  });

  return { id: userId, created: true };
}
