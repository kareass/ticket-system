#!/usr/bin/env bash
# =============================================================
# 数据库初始化脚本
# 用法：
#   bash scripts/db-init.sh                  仅建表（应用全部迁移）——生产首次部署用
#   bash scripts/db-init.sh --with-seed      建表并写入演示数据（危险：会清空现有数据）
#   bash scripts/db-init.sh --drop           重置数据库并重新应用迁移（危险：清空全部数据）
# =============================================================
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }

if [ ! -f .env ]; then
  step "未找到 .env，从 .env.example 生成"
  cp .env.example .env
  echo "请确认 .env 中的 DATABASE_URL 后重新执行。"
  exit 1
fi

case "${1:-}" in
  --drop)
    step "重置数据库（将清空全部数据）"
    read -r -p "确认继续？输入 yes 执行：" ans
    [ "$ans" = "yes" ] || { echo "已取消"; exit 0; }
    npx prisma migrate reset --force
    step "写入演示数据"
    npm run db:seed
    ;;
  --with-seed)
    step "应用迁移"
    npx prisma migrate deploy
    step "写入演示数据（会先清空现有数据）"
    npm run db:seed
    ;;
  *)
    step "应用迁移（prisma migrate deploy）"
    npx prisma migrate deploy
    ;;
esac

step "当前数据量"
node -e '
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const [wo, req] = await Promise.all([p.workOrder.count(), p.requirement.count()]);
  console.log(`工单 ${wo} 条 / 需求 ${req} 条`);
  await p.$disconnect();
})().catch(async (e) => { console.error(e.message); await p.$disconnect(); process.exit(1); });
'

echo
echo "数据库初始化完成。"
