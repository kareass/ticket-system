#!/usr/bin/env node
/**
 * 环境检查清单（部署前 / 排障时执行）
 *
 *   npm run check:env
 *
 * 逐项检查并输出 [OK] / [WARN] / [FAIL]，任意 FAIL 则以非 0 退出。
 * 安全约定：只输出 DATABASE_URL 的“主机与库名”，绝不回显账号密码。
 */
import { existsSync, readFileSync, accessSync, constants } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
// 兼容 Node 18（import.meta.dirname 需 20.11+）
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

let fails = 0;
let warns = 0;

const OK = (name, extra = "") => console.log(`  [OK]   ${name}${extra ? " — " + extra : ""}`);
const WARN = (name, extra = "") => {
  warns += 1;
  console.log(`  [WARN] ${name}${extra ? " — " + extra : ""}`);
};
const FAIL = (name, extra = "") => {
  fails += 1;
  console.error(`  [FAIL] ${name}${extra ? " — " + extra : ""}`);
};

/** 隐去连接串中的账号密码 */
function safeDbUrl(url) {
  if (!url) return "(空)";
  if (url.startsWith("file:")) return url;
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return "(格式无法解析)";
  }
}

console.log("=== 四川物流工单系统 环境检查 ===\n");
console.log("-- 运行环境 --");

// 1. Node 版本
const major = Number(process.versions.node.split(".")[0]);
if (major >= 18) OK("Node.js 版本", `v${process.versions.node}`);
else FAIL("Node.js 版本", `v${process.versions.node} 过低，需 18 及以上`);

// 2. 项目目录可写（Next 构建与 Prisma 生成都需要）
try {
  accessSync(root, constants.W_OK);
  OK("项目目录可写", root);
} catch {
  FAIL("项目目录可写", `${root} 不可写`);
}

// 3. 依赖已安装
if (existsSync(resolve(root, "node_modules"))) OK("依赖已安装", "node_modules");
else FAIL("依赖已安装", "未找到 node_modules，请执行 npm ci");

console.log("\n-- 配置文件 --");

// 4. .env
const envPath = resolve(root, ".env");
let envText = "";
if (existsSync(envPath)) {
  envText = readFileSync(envPath, "utf8");
  OK(".env 存在");
} else {
  WARN(".env 不存在", "可执行 cp .env.example .env 生成（生产环境必填）");
}

// 5. DATABASE_URL：优先取真实环境变量，其次 .env
const fromEnv = process.env.DATABASE_URL;
const fromFile = (envText.match(/^\s*DATABASE_URL\s*=\s*(.+)$/m) || [])[1];
const dbUrlRaw = fromEnv || (fromFile ? fromFile.trim().replace(/^["']|["']$/g, "") : "");
const dbUrl = dbUrlRaw || "file:./prisma/dev.db"; // 与 prisma/schema.prisma 的默认值保持一致
if (dbUrlRaw) OK("DATABASE_URL 已配置", safeDbUrl(dbUrlRaw));
else WARN("DATABASE_URL 未配置", `将使用 schema 默认值 ${dbUrl}`);

if (dbUrl.startsWith("file:")) {
  const rel = dbUrl.slice("file:".length).replace(/^\.\//, "");
  // schema 中的相对路径以 prisma/ 目录为基准
  const candidates = [resolve(root, "prisma", rel), resolve(root, rel)];
  const found = candidates.find((p) => existsSync(p));
  if (found) OK("SQLite 数据库文件存在", found);
  else WARN("SQLite 数据库文件不存在", `预期位置 ${candidates[0]}，执行 npx prisma migrate deploy 创建`);
}

console.log("\n-- Prisma --");

// 6. Prisma Client 是否已生成
let prisma = null;
try {
  const { PrismaClient } = require("@prisma/client");
  prisma = new PrismaClient();
  OK("Prisma Client 已生成");
} catch (e) {
  FAIL("Prisma Client 已生成", `请执行 npx prisma generate（${e.message.split("\n")[0]}）`);
}

// 7. 数据库连通性 + 表可用性
if (prisma) {
  try {
    const [wo, req] = await Promise.all([prisma.workOrder.count(), prisma.requirement.count()]);
    OK("数据库可连接且表结构就绪", `工单 ${wo} 条 / 需求 ${req} 条`);
  } catch (e) {
    FAIL("数据库可连接", `${e.message.split("\n")[0]}，请执行 npx prisma migrate deploy`);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

console.log("\n-- 端口 --");
const port = Number(process.env.PORT || 3000);
const inUse = await new Promise((done) => {
  const srv = createServer();
  srv.once("error", () => done(true));
  srv.once("listening", () => srv.close(() => done(false)));
  srv.listen(port, "127.0.0.1");
});
if (inUse) WARN(`端口 ${port} 已被占用`, "若服务已在运行则属正常；否则请改 PORT 或停止占用进程");
else OK(`端口 ${port} 可用`);

console.log(
  `\n=== 检查结束：${fails} 项失败，${warns} 项警告 ===` +
    (fails === 0 ? " 可以部署 ✅" : " 请先处理失败项 ❌"),
);
process.exit(fails === 0 ? 0 : 1);
