#!/usr/bin/env bash
# =============================================================
# 四川物流工单系统 - 生产部署脚本
# 适用：Linux 服务器（Ubuntu 20.04+/CentOS 7+），已安装 Node.js 18+ 与 git
# 用法：在服务器项目目录执行  bash deploy.sh
# 可用环境变量覆盖：DEPLOY_BRANCH（默认 main）  APP_NAME（默认 scwos）
# =============================================================
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

BRANCH="${DEPLOY_BRANCH:-main}"
APP_NAME="${APP_NAME:-scwos}"
PORT="${PORT:-3000}"

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }
fail() { printf '\n\033[1;31m[失败] %s\033[0m\n' "$1" >&2; exit 1; }

step "环境检查"
command -v node >/dev/null || fail "未找到 node，请先安装 Node.js 18+"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 18 ] || fail "Node.js 版本过低（当前 v$(node -p 'process.versions.node')），需要 18 及以上"
command -v git >/dev/null || fail "未找到 git"
echo "Node.js v$(node -p 'process.versions.node') / npm v$(npm -v) / 分支 $BRANCH / 端口 $PORT"

step "1/6 拉取代码"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

step "2/6 校验配置文件"
if [ ! -f .env ]; then
  echo "未找到 .env，正在从 .env.example 生成…"
  cp .env.example .env
  fail "已生成 .env，请填写 DATABASE_URL 后重新执行本脚本"
fi
grep -q '^DATABASE_URL=' .env || fail ".env 中缺少 DATABASE_URL"
echo ".env 校验通过"

step "3/6 安装依赖"
npm ci

step "4/6 同步数据库结构"
npx prisma generate
npx prisma migrate deploy

step "5/6 构建生产包"
npm run build

step "6/6 启动 / 重载服务"
if command -v pm2 >/dev/null; then
  if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
    pm2 reload "$APP_NAME" --update-env
  else
    PORT="$PORT" pm2 start npm --name "$APP_NAME" -- start
  fi
  pm2 save
  echo "已通过 pm2 管理进程：pm2 status / pm2 logs $APP_NAME"
else
  echo "未检测到 pm2（进程守护工具）。"
  echo "推荐安装： npm i -g pm2 && pm2 startup"
  echo "临时前台启动： PORT=$PORT npm run start"
fi

printf '\n\033[1;32m部署完成\033[0m 访问 http://<服务器地址>:%s\n' "$PORT"
echo "回滚： git log --oneline -5  →  git checkout <上一个提交>  →  重新执行 bash deploy.sh"
