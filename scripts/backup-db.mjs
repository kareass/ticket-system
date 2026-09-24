#!/usr/bin/env node
/**
 * 数据库备份（SQLite）+ 附件快照
 *
 *   npm run db:backup
 *
 * 用 SQLite 的 VACUUM INTO 生成一份**一致性快照**（服务运行中执行也安全），
 * 再连同 uploads/ 目录一起打包为 .tar.gz，落在 backups/ 目录，文件名带时间戳。
 *
 * 备份产物 = dev.db + uploads/（会议纪要附件），两者必须一起打包才能完整恢复。
 * 保留份数由 BACKUP_KEEP 控制（默认 30），超出后自动删除最旧的。
 *
 * ⚠️ Windows 上必须用「相对档名 + cwd」调用 tar：Node 会优先解析到 Git 自带的
 *    GNU tar，它把 `-f E:\...` 里的 `E:` 当成远程主机，绝对路径会直接失败。
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, unlinkSync } from "node:fs";
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

// 时间戳文件名
const now = new Date();
const pad = (n, w = 2) => String(n).padStart(w, "0");
const stamp =
  `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
  `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

// VACUUM INTO 要求目标文件不存在，所以先落在一个**暂存目录**，打包完再整体删掉。
// ⚠️ 暂存目录必须放在 backups/ 下（该目录已 gitignore），**绝不能落在项目根目录** ——
// 万一打包中途失败，整个数据库会以未跟踪文件的形式留在仓库里，可能被误提交。
const stageDir = resolve(backupDir, `.staging-${stamp}`);
mkdirSync(stageDir, { recursive: true });

process.env.DATABASE_URL = dbUrl;
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

try {
  // 记录备份前的数据量，便于恢复后核对
  const [wo, req] = await Promise.all([prisma.workOrder.count(), prisma.requirement.count()]);
  const [meetings, attachments] = await Promise.all([
    prisma.meeting.count(),
    prisma.meetingAttachment.count(),
  ]);

  // SQLite 路径在 SQL 里用正斜杠，避免反斜杠转义问题。
  // 档名固定为 dev.db —— 归档内保持这个稳定名字，恢复步骤才是确定的
  // （部署文档里写的就是「解包得到 dev.db」）。
  const vacuumTarget = resolve(stageDir, "dev.db");
  const sqlPath = vacuumTarget.replace(/\\/g, "/").replace(/'/g, "''");
  await prisma.$executeRawUnsafe(`VACUUM INTO '${sqlPath}'`);

  const dbSize = (statSync(vacuumTarget).size / 1024).toFixed(1);
  OK("VACUUM 快照", `${vacuumTarget}（${dbSize} KB）`);

  // 检查 uploads/ 是否存在（有附件才打进去）
  const uploadsDir = resolve(root, "uploads");
  const hasUploads = existsSync(uploadsDir) && readdirSync(uploadsDir).length > 0;

  // ⚠️ 归档档名必须是**相对名** + cwd 定位。
  // GNU tar 会把 `-f E:\...` 里的 `E:` 当成远程主机解析，绝对路径必然失败。
  // -C 用绝对路径没问题（tar 只是 chdir 过去）。
  const tarName = `${stamp}.tar.gz`;
  const tarArgs = ["-czf", tarName, "-C", stageDir, "dev.db"];
  if (hasUploads) tarArgs.push("-C", root, "uploads");
  execFileSync("tar", tarArgs, { cwd: backupDir, stdio: "pipe" });

  const tarPath = resolve(backupDir, tarName);
  const tarSize = (statSync(tarPath).size / 1024).toFixed(1);
  OK("打包完成", `${tarPath}（${tarSize} KB）`);
  OK("备份时数据量", `工单 ${wo} 条 / 需求 ${req} 条 / 会议 ${meetings} 条 / 附件 ${attachments} 条`);

  // 保留策略：按文件名时间戳排序，删除最旧的（同时认旧 .db 与新式 .tar.gz）
  const keep = Number(process.env.BACKUP_KEEP || 30);
  const all = readdirSync(backupDir)
    .filter((f) => /^\d{8}-\d{6}\.(db|tar\.gz)$/.test(f))
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
  // 无论成败都清掉暂存目录，绝不在仓库里留下半截快照
  rmSync(stageDir, { recursive: true, force: true });
}
