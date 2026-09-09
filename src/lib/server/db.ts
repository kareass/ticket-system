import { PrismaClient } from "@prisma/client";

/**
 * Prisma 客户端单例
 * - Next.js dev 热重载会反复执行模块，若不缓存单例会不断新建连接；
 *   这里挂到 globalThis 上，跨模块/跨热重载复用同一实例。
 * - 仅供服务端使用（route handler 均声明 runtime = "nodejs"）。
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
