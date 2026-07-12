import { createPrismaClient } from '../src/client.js';
import { ensureDefaultUser } from '../src/default-user.js';

const prisma = createPrismaClient();

try {
  const result = await ensureDefaultUser(prisma);
  process.stdout.write(
    `${result.created ? 'Создан' : 'Найден'} локальный пользователь ${result.id}\n`,
  );
} finally {
  await prisma.$disconnect();
}
