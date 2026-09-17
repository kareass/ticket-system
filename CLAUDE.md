# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 权威来源

`docs/四川物流工单系统-设计方案.md` 是**唯一权威设计文档**。代码与文档不一致时，**改代码去对齐文档，绝不反向修改文档**。
文档中明确写了「预留扩展」的字段（如工单状态）可以增量扩展；明确列举了取值的（如需求节点五种）属于需求变更，应先改文档。

## 常用命令

```bash
npm run dev            # 开发模式（首次进入每个路由现场编译，1.5~6.6s）
npm run build          # 生产构建
npm run start          # 生产启动（日常使用请用生产模式，页面 6~300ms）
npm run typecheck      # tsc --noEmit（提交前必跑）
npm run api:smoke      # 后端接口冒烟，107 项断言（需服务已在 :3000 运行）
npm run check:env      # 环境检查清单（纯本地，不联网）
npm run db:migrate     # prisma migrate deploy（建表）
npm run db:seed        # 写入演示数据（会先清空现有数据）
npm run verify         # typecheck + build
```

**没有单元测试框架**（无 jest/vitest），也没有「只跑某个用例」的开关 —— `api:smoke` 是唯一的自动化测试，
每次全量跑 107 项。要加断言就直接往 `scripts/api-smoke.mjs` 里加，它自清理、可重复运行。

## 架构

单个 Node.js 进程承载前后端：Next.js 14 App Router（`src/app`）+ Route Handlers（`src/app/api/**`）+ React 18 + antd 5 + Zustand，
数据层 Prisma + SQLite。**无账号/权限体系**，所有日期字段默认今天。

### 数据层（Prisma / SQLite）

- 模型：`WorkOrder` 与 `Requirement` 一对一。关系在 **`Requirement.workOrderId String? @unique`** 上持有外键，
  保证一个工单至多转出一条需求。
- 工单上另有 `requirementId` / `requirementContent` 两个字段存**用户填写的值**（转需求的依据）。
  注意 `WorkOrder.requirementId` **不唯一** —— 唯一性属于 `Requirement.requirementId`。
- **`system` / `status` / `currentNode` 在 schema 里是普通 `String` 列，不是数据库枚举** —— 增删下拉选项
  不需要迁移。仅 `Requirement.workOrderId` 这类真外键才涉及迁移。
- 日期一律按**日历日**：入库 `new Date('YYYY-MM-DD' + 'T00:00:00.000Z')`，出参 `toISOString().slice(0,10)`。
  不要用 `new Date(dateStr)`（时区会让日期偏一天）。
- `developmentDays` **服务端权威**：客户端提交值一律忽略。未发版 = date→今天，已发版 = date→releaseDate，含当天、下限 0。

### API 层

- 每个 route handler 必须 `export const runtime = "nodejs"`（Prisma 需要）。Next 14 的 `params` 是**同步对象**：
  `{ params }: { params: { id: string } }`，不要 `await`。
- `src/lib/server/helpers.ts` 是服务端共享工具的唯一入口：`readJson`、`apiError`、`asBool`、`asTrimmed`、
  `toDayUtc`、`recomputeDevDays`、`isPrismaUnique`、`ApiFailure`、`toWorkOrderJson` / `toRequirementJson`，
  以及由 `src/types` 转发的枚举数组 `SYSTEMS` / `WORK_ORDER_STATUSES` / `NODES`（用于接口层 `includes` 校验）。
- **`asTrimmed` 的空值语义是关键**：非字符串 → `undefined`，字符串 → trim 后的值（**可能是 `""`**）。
  这正是「未传参」（`undefined`）与「显式清空」（`""`）能区分开的原因，改它前先看 `convert` 路由怎么用。
- 事务内失败抛 `ApiFailure`，由路由的 catch 统一转成带 `details` 的标准错误响应。
- P2002 唯一约束冲突用 `isPrismaUnique(err)` 判定 → `409`。

### 工单 → 需求同步（本项目的核心业务逻辑）

`src/lib/server/work-order-sync.ts` 的 `syncRequirementForWorkOrder` 是这条规则的**唯一实现处**，
被三条写入路径共用：`POST /api/work-orders`、`PUT /api/work-orders/{id}`（`isConvertToRequirement` 置 true）、
`POST /api/work-orders/{id}/convert`。**改同步规则只改这里**，否则三条路径会分叉。

- 它**不自己提交事务**，必须在调用方的 `$transaction` 内执行，失败即整体回滚。
- `requirementId` 仅在「工单转需求」路径必填（work-order-sync.ts 是唯一权威守卫）；
  手工新建/编辑需求时可选填。PUT 的三态语义：未传=不改、空串=清空、非空=改名。
- 已关联需求时只在工单编号变化时同步改名（撞号 → 409），不重复创建。
- **`需求内容` 不做兜底**：工单上填什么就是什么，留空即落 null —— 不要「为空则取工单标题」。

`POST /work-orders/{id}/convert` 的入参语义（列表「转需求」弹框走这条）：
`requirementId` 不传 → 退回工单已登记值；`requirementContent` 不传 → 退回工单已存值，
**传 `""` → 显式清空**。事务内先回写工单再建需求，保证两侧编号一致。

### 前端数据流

- `src/store/store.ts`（Zustand）持有 `workOrders` / `requirements` 与 `*Loaded` 缓存标记：
  页面挂载时若已加载则**不重复请求**，工具栏「刷新」传 `force=true` 才重新拉取。
- **列表内联修改必须显式「提交」才落库**：`src/lib/useRowDrafts.ts` 的 `useRowDrafts<Row>()` 提供
  `stage(id, patch)` / `isFieldDirty(id, field)` / `count` / `commitAsync(...)`。未提交切页即丢失。
  新增可内联编辑的列时，必须接进这套草稿门，不要直接调 store 的 update。
- `ProTable` 的列顺序/列宽存在浏览器 `localStorage`（每张表一个 key），**不属于业务数据**。
- antd 陷阱：`Form.useWatch` 首次渲染可能返回 `undefined`，需回退到 `formInitialValues`，否则开关门控会闪一帧。
  `Form.Item` 的 rules 可用函数形式 `({ getFieldValue }) => ({ validator })` 做跨字段校验。

## 项目硬规则

1. **下拉选项只有一个来源：`src/types/index.ts`**。数组 `as const`，联合类型由 `typeof ARR[number]` 推导，
   配色表是 `Record<联合类型, string>`（漏加配色会编译报错）。表单、列表内联、筛选框、后端校验全部取自这里 ——
   新增选项**只改这个文件**，不要在任何组件里就地写选项数组。
2. **修改需显式提交**，不做自动保存。
3. **UI 改动必须由用户在浏览器中实际验证后才算完成**（本环境无浏览器自动化）。
4. **API 密钥等敏感信息绝不打印/记录**；`.env` 不入库，仓库只保留 `.env.example`；`_dispatch/` 已在 `.gitignore`。

## Windows 上的坑

- **dev server 运行时会锁住 `.next`**，此时 `npm run build` 报 EPERM，`prisma generate` 同为 EPERM → 先停服。
- 需要在 dev 运行期间做隔离构建时用 `NEXT_DIST_DIR=.next-build npm run build`。注意 Next 会把
  `.next-build/types/**/*.ts` **追加进 `tsconfig.json` 的 include**，构建完必须 `git checkout -- tsconfig.json` 还原。
- dev 的编译队列是串行的：一次编译被中断（请求超时断开、编辑器连续保存）会让**后续所有请求一起卡住** ——
  表现为端口还在 LISTENING 但任何页面都不返回。处理：`netstat -ano | findstr :3000` 拿 PID → `taskkill /F /PID <PID>`。
- 用户日常使用请跑**生产模式**；dev 首次进入每个路由要现场编译 3000+ 模块，体感明显发卡。
- **命令行里的中文会被控制台按 GBK 处理，到达 curl / sqlite3 时已经损坏** —— 用它做含中文的接口
  验证会得到**假故障**。实测：`curl -d '{"status":"已废弃"}'` 发出去的其实是乱码（入库字节里出现
  `EFBFBD`，即 U+FFFD 替换字符），服务端因此判定「值不合法」。可靠做法：① 能用 ASCII 就用 ASCII
  （如系统字段的 `OMS`）；② 必须中文时，写库用 `sqlite3` 的 `X'...'` 十六进制字面量，发请求用
  Python（源码里写 `\uXXXX` 转义，纯 ASCII）生成 UTF-8 的 body 文件再 `curl -d @file`。
  排查时**看 `hex()` 输出而不是看终端回显** —— 终端显示的中文同样不可信。
  另：`/tmp` 对 bash 可见但对 Python 不可见，跨工具传文件请落在项目目录内。

## 仓库与部署

- 代码托管在**私有**仓库 `https://github.com/kareass/ticket-system.git`（内含内部需求设计表与 `agents/` 文档，
  不要转为公开）。
- **数据不在版本库内**：`.gitignore` 排除 `prisma/*.db`。`prisma/dev.db` 一个文件即全部业务数据 ——
  换机器/部署不会带过去，需要单独决定是空库起还是迁移。
- 部署文档按环境分流：常规在线部署见 `docs/部署指南.md`（含 Windows 第四节），
  无外网环境见 `docs/内网部署方案.md`（离线整包投递；重点注意 `npm ci` 的 postinstall 会去
  `binaries.prisma.sh` 下载 Prisma 查询引擎，内网私服通常不代理该二进制源）。

## 文档地图

| 文档 | 用途 |
|------|------|
| `docs/四川物流工单系统-设计方案.md` | **唯一权威设计文档** |
| `docs/API-接口文档.md` | 接口契约、枚举口径、错误码 |
| `docs/用户手册.md` | 面向使用者的操作说明（含 7.1 新增下拉选项的步骤） |
| `docs/部署指南.md` / `docs/内网部署方案.md` | 部署 |
| `docs/测试报告-环节6.md` | 测试记录、性能数据、各轮验收反馈（F1–F7）与 Bug 记录 |

改了接口/枚举/字段口径时，同步更新上面对应的文档 —— 各文档里都写明了断言数（119）等具体数字，容易漏。

`agents/*.md` 是构建期的角色定义（子会话提示词），不是本仓库的开发规范。
