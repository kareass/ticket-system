# 四川物流工单系统

部门内部**工单统计与需求追踪**系统：登记日常工作工单，一键转为需求，跟进「方案中 → 开发中 → 测试中 → 已合并 → 已发布」全流程。

## 技术栈

| 层 | 选型 |
|----|------|
| 前端 | React 18 + Next.js 14（App Router）+ Ant Design 5 + Zustand |
| 后端 | Next.js API Routes（REST） |
| ORM / 数据库 | Prisma 5 + SQLite（开发/演示）/ PostgreSQL 14+（正式） |
| 部署 | 单 Node.js 进程 + pm2，Git 拉取更新 |

前后端同一代码库、同一部署单元，内网环境零外部依赖。

## 快速开始（本地）

```bash
npm ci                        # 安装依赖（postinstall 自动 prisma generate）
cp .env.example .env          # 默认 SQLite，可直接用
npx prisma migrate deploy     # 建表
npm run db:seed               # 可选：写入演示数据
npm run dev                   # 启动，访问 http://localhost:3000
```

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发模式 |
| `npm run build` / `npm run start` | 生产构建 / 生产启动 |
| `npm run check:env` | **环境检查清单**（部署前/排障，逐项 OK/WARN/FAIL） |
| `npm run db:init` | 数据库初始化（建表；`--with-seed` 加演示数据，`--drop` 重置） |
| `npm run db:migrate` | 应用迁移（`prisma migrate deploy`） |
| `npm run db:seed` | 写入演示数据（**会先清空现有数据**） |
| `npm run api:smoke` | 后端接口冒烟（53 项断言，需服务已在 3000 运行；运行后自动清理测试数据） |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run verify` | 类型检查 + 生产构建 |

## 部署

Linux 服务器上一键完成「拉代码 → 装依赖 → 迁移 → 构建 → 平滑重载」：

```bash
cp .env.example .env && vi .env    # 确认 DATABASE_URL
bash deploy.sh
```

详见 **[docs/部署指南.md](docs/部署指南.md)**（含环境要求、FAQ、部署检查清单）。

## 文档

| 文档 | 内容 |
|------|------|
| [四川物流工单系统-设计方案.md](docs/四川物流工单系统-设计方案.md) | **项目唯一权威设计文档**（数据模型、功能清单、实施环节） |
| [用户手册.md](docs/用户手册.md) | 面向使用者的操作指南与字段说明表 |
| [部署指南.md](docs/部署指南.md) | 环境要求、部署步骤、检查清单、FAQ |
| [API-接口文档.md](docs/API-接口文档.md) | 接口契约、枚举、错误码、开发时长规则 |
| [测试报告-环节6.md](docs/测试报告-环节6.md) | 功能测试、性能数据、Bug 修复记录 |

## 目录结构（核心）

```
├── deploy.sh                 # 部署脚本
├── prisma/
│   ├── schema.prisma         # 数据模型（WorkOrder / Requirement）
│   ├── migrations/           # 迁移记录
│   └── seed.ts               # 演示数据
├── scripts/
│   ├── check-env.mjs         # 环境检查
│   ├── db-init.sh            # 数据库初始化
│   └── api-smoke.mjs         # 接口冒烟
├── src/
│   ├── app/                  # 页面 + API 路由
│   │   ├── api/              # work-orders / requirements
│   │   ├── work-orders/      # 工单列表 / 新建 / 编辑
│   │   └── requirements/     # 需求列表 / 新建 / 编辑
│   ├── components/           # 表单、公共组件（ProTable / EditableChip）
│   ├── lib/                  # api / errors / utils / useRowDrafts / server
│   ├── store/                # Zustand 全局状态
│   └── types/                # 类型与枚举
└── docs/                     # 文档
```

## 两条关键业务规则

1. **修改需显式提交**：列表内联修改只暂存为草稿，必须点「提交」并在弹窗确认后才写入数据库；未提交切页即丢失，点「还原」可整体放弃。
2. **需求ID 由用户在工单上填写**（全局唯一，开启「是否转需求」时必填）；一条工单最多转出一条需求（一对一）：开启开关保存时按需求ID 自动同步创建需求（同步日期/标题/内容/系统，节点默认「方案中」），也可先登记需求ID 再从列表一键「转需求」。已转需求的工单不可重复转换、不可直接删除（需先删除关联需求）；删除需求会复位工单标记并保留其需求ID，便于按原编号重转。

开发时长 `developmentDays` 由服务端自动计算，客户端提交值会被忽略：未发版为「日期 → 今天」，已发版为「日期 → 发版时间」，含当天，下限 0。
