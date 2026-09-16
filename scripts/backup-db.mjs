#!/usr/bin/env node
/**
 * 数据库备份（SQLite）
 *
 *   npm run db:backup
 *
 * 用 SQLite 的 VACUUM INTO 生成一份**一致性快照**：
 * 与「直接复制 dev.db」不同，它在服务运行中执行也安全（复制文件可能在写事务
 * 中途拿到半截数据），且产物更紧凑。备份落在 backups/ 目录，文件名带时间戳。
 *
 * 保留份数由 BACKUP_KEEP 控制（默认 30），超出后自动删除最旧的。
 * 安全约定：只输出数据库文件路径，绝不回显连接串中的账号密码。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
// 兼容 Node 18（import.meta.dirname 需 20.11+）
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const OK = (name, extra = "") => console.log(`  [OK]   ${name}${extra ? " — " + extra : ""}`);
const FAIL = (name, extra = "") => console.error(`  [FAIL] ${name}${extra ? " — " + extra : ""}`);

/** 从 .env 读取指定键（Prisma Client 在普通 node 脚本中不会自动加载 .env） */
function readEnv(key) {
  if (process.env[key]) return process.env[key];
  const envPath = resolve(root, ".env");
  if (!existsSync(envPath)) return "";
  const m = readFileSync(envPath, "utf8").match(new RegExp(`^\\s*${key}\\s*=\\s*(.+)$`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
}

const dbUrl = readEnv("DATABASE_URL") || "file:./prisma/dev.db";

console.log("=== 四川物流工单系统 数据库备份 ===\n");

// 非 SQLite（如已切到 PostgreSQL）不由本脚本处理
if (!dbUrl.startsWith("file:")) {
  FAIL("数据库类型", "当前 DATABASE_URL 不是 SQLite，请改用 pg_dump 等对应工具备份");
  process.exit(1);
}

// schema 中的相对路径以 prisma/ 目录为基准
const rel = dbUrl.slice("file:".length);
const dbPath = existsSync(resolve(root, "prisma", rel.replace(/^\.\//, "")))
  ? resolve(root, "prisma", rel.replace(/^\.\//, ""))
  : resolve(root, rel);

if (!existsSync(dbPath)) {
  FAIL("数据库文件存在", `${dbPath} 不存在，请先执行 npx prisma migrate deploy`);
  process.exit(1);
}

const backupDir = resolve(root, "backups");
if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });

// 时间戳文件名；VACUUM INTO 要求目标文件不存在
const now = new Date();
const pad = (n, w = 2) => String(n).padStart(w, "0");
const stamp =
  `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
  `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
const target = resolve(backupDir, `${stamp}.db`);

process.env.DATABASE_URL = dbUrl;
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

try {
  // 记录备份前的数据量，便于恢复后核对
  const [wo, req] = await Promise.all([prisma.workOrder.count(), prisma.requirement.count()]);

  // SQLite 路径在 SQL 里用正斜杠，避免反斜杠转义问题
  const sqlPath = target.replace(/\\/g, "/").replace(/'/g, "''");
  await prisma.$executeRawUnsafe(`VACUUM INTO '${sqlPath}'`);

  const size = (statSync(target).size / 1024).toFixed(1);
  OK("备份完成", `${target}（${size} KB）`);
  OK("备份时数据量", `工单 ${wo} 条 / 需求 ${req} 条`);

  // 保留策略：按文件名时间戳排序，删除最旧的
  const keep = Number(process.env.BACKUP_KEEP || 30);
  const all = readdirSync(backupDir)
    .filter((f) => /^\d{8}-\d{6}\.db$/.test(f))
    .sort();
  if (all.length > keep) {
    const drop = all.slice(0, all.length - keep);
    for (const f of drop) unlinkSync(resolve(backupDir, f));
    OK("清理旧备份", `删除 ${drop.length} 份，保留最近 ${keep} 份`);
  } else {
    OK("保留策略", `现有 ${all.length} 份，上限 ${keep} 份`);
  }

  console.log("\n备份目录：" + backupDir);
} catch (e) {
  FAIL("备份失败", e.message.split("\n")[0]);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
