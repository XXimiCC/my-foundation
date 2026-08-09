import { PrismaClient } from '@prisma/client';

/**
 * Синглтон на globalThis: в serverless каждый горячий инстанс переиспользует
 * клиента, а в dev пережившие hot reload модули не плодят новые пулы.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
