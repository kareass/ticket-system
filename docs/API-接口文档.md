# 四川物流工单系统 - 后端 API 接口文档

> 环节4 交付物。实现于 Next.js App Router Route Handlers（`src/app/api/**/route.ts`，均 `runtime = "nodejs"`），数据层为 Prisma + SQLite（`dev.db`）。
> 版本约定与设计文档/前端类型（`src/types`）一致；日期一律按「日历日」`YYYY-MM-DD` 传输（服务端按该日 UTC 零点入库，规避时区偏天）。
> 后端二次校验失败统一返回 `400`，并附 `details`（字符串数组）说明每个字段问题。

- 基础地址：`http://localhost:3000`
- 通用错误响应体：`{ "error": "人话描述" }`，可选 `{ "error": "...", "details": [...] }`
- 列表返回**数组**；`createdAt / updatedAt` 为 ISO 时间字符串。

## 枚举口径（与前端一致）

| 项 | 取值 |
|----|------|
| system（系统） | `WMS` / `ERP` / `TMS` / `SCM` / `追溯中心` / `其他` |
| status（工单状态） | `新建` / `已处理` / `已关闭` / `处理中` / `待优化` |
| currentNode（需求节点） | `方案中` / `开发中` / `测试中` / `测试完毕` / `已合并` / `已发布` / `退回` |
| submittedBy（提交人） | `黄傲` / `陈婷婷` |
| remindee（提醒人） | `黄傲` / `陈婷婷` |
| 需求业务编号 | `requirementId`，唯一；建议格式 `R-{年}-{序号}`（如 `R-2026-001`） |

> **枚举的唯一来源是 `src/types/index.ts`**。后端不另写一份取值：`src/lib/server/helpers.ts` 把
> `SYSTEM_OPTIONS` / `WORK_ORDER_STATUS_OPTIONS` / `NODE_OPTIONS` 转发为 `SYSTEMS` /
> `WORK_ORDER_STATUSES` / `NODES`，`SUBMITTER_OPTIONS` 转发为 `SUBMITTERS`、
> `REMINDEE_OPTIONS` 转发为 `REMINDEES` 供各接口做 `includes` 校验，
> 因此**接口校验、表单下拉、列表内联下拉、筛选框四处永远同步**。
>
> 新增一个下拉选项只需改 `src/types/index.ts` 里的对应数组。**不需要数据库迁移** ——
> `schema.prisma` 中 `system` / `status` / `currentNode` 是普通 `String` 列而非数据库枚举。
>
> ⚠️ `NODE_OPTIONS` 的取值写死在设计文档中，增删节点属需求变更，应先改设计文档；
> `SYSTEM_OPTIONS` 未在设计文档中枚举，可直接增删。删除某选项后，库中已使用该值的存量记录
> 仍可正常编辑（接口对「提交值与库中现值相同」的情形跳过枚举校验），但无法再选回该值，
> 只能改成其它系统。`status` 同理。

## 工单 WorkOrder

响应字段：`id`(内部cuid), `date`, `title`, `content`, `system`, `isConvertToRequirement`, `requirementId?`, `requirementContent?`, `remark?`, `status`, `submittedBy?`, `createdAt`, `updatedAt`

> `submittedBy`（提交人）新记录必填（`黄傲` / `陈婷婷`），历史数据可空（接口层对空值跳过 enum 校验并落 null）。
> 列表内联编辑走三态语义：未传不动 / 空串清空 / 非空改名（与 `requirementId` 同款）。
>
> `requirementId`（需求ID）/ `requirementContent`（需求内容）对应设计方案「工单表」字段：
> `isConvertToRequirement=true` 时 `requirementId` **必填**，保存工单即在**同一事务内**据此自动同步创建需求；
> `=false` 时前端不开放这两个字段的录入（转需求时在列表弹框里填编号）。
> 接口层不禁止 `=false` 同时带 `requirementId` —— 删除关联需求后工单会保留原编号供重新转需求（见删除接口）。

### 列表 · `GET /api/work-orders`
可选查询：`?system=WMS&keyword=出库&submittedBy=黄傲`（keyword 匹配标题，submittedBy 匹配提交人）。
枚举外的值视作不过滤（不会 400）。按 `createdAt` 倒序。
响应：`200` → `WorkOrder[]`

### 单查 · `GET /api/work-orders/{id}`
响应：`200` → `WorkOrder`；`404` 工单不存在

### 新建 · `POST /api/work-orders`
请求体（`*`=必填）：
```jsonc
{
  "date": "2026-09-05",            // * YYYY-MM-DD
  "title": "WMS 出库单打印优化",    // *
  "content": "……",                // *
  "system": "WMS",                 // 默认 WMS，须在枚举内
  "status": "新建",                 // 默认「新建」，须在枚举内
  "isConvertToRequirement": false, // 默认 false
  "requirementId": "R-2026-006",   // 需求ID；isConvertToRequirement=true 时必填
  "requirementContent": "……",      // 需求内容；留空则建出的需求内容也为空（不做兜底）
  "submittedBy": "黄傲",           // * 新记录必填（黄傲 / 陈婷婷）；历史数据可空
  "remark": "可选"
}
```
`developmentDays`/时间戳由服务端生成，传入忽略。
`isConvertToRequirement=true` 时请求须带 `requirementId`，服务端在同一事务内创建需求（编号撞号 → `409`，整笔创建回滚）。
响应：`201` → `WorkOrder`；`400` 校验失败（含 details）；`409` 需求ID 已被占用

### 更新 · `PUT /api/work-orders/{id}`
请求体：上述任意字段（局部更新）。`remark`/`requirementId`/`requirementContent`/`submittedBy` 传空串将置空（与「未传」语义不同）；未传 `submittedBy` 不修改。额外行为：

- `isConvertToRequirement` 置 `true` → **事务内**按工单的 `requirementId` 自动同步需求：未关联则创建，已关联且编号变化则同步改名；`requirementId` 为空 → `400`，编号被占用 → `409`；
- 已关联需求的工单不允许把 `isConvertToRequirement` 置 `false` → `400`（如需取消请先删除关联需求）；
- 打开「转需求」时工单上的 `submittedBy` 会被一同同步给需求（事务内）。

响应：`200` → `WorkOrder`；`400` 校验失败 / 无可更新字段 / 缺需求ID / 已关联时关闭转需求；`404` 工单不存在；`409` 需求ID 已被占用

### 删除 · `DELETE /api/work-orders/{id}`
响应：`204` 成功；`404` 不存在；`409` 该工单已转需求（存在关联需求），需先删除关联需求

## 需求 Requirement

响应字段：`id`(cuid), `requirementId`, `date`, `title?`, `content?`, `system`, `developmentDays?`, `currentNode`, `isUrgent`, `isReleased`, `releaseDate?`, `remark?`, `workOrderId?`, `submittedBy?`, `createdAt`, `updatedAt`

> `submittedBy` 新记录必填（`黄傲` / `陈婷婷`），历史数据可空。三态语义同工单。
> **developmentDays 规则**（服务端权威计算，忽略提交值）：未发版 = `date → 今天`；已发版 = `date → releaseDate`；含当天，下限 0。

### 列表 · `GET /api/requirements`
可选查询：`?system=WMS&currentNode=测试中&keyword=xxx&submittedBy=黄傲`（keyword 匹配需求ID或标题）。枚举外的值视作不过滤。按 `createdAt` 倒序。
响应：`200` → `Requirement[]`

### 单查 · `GET /api/requirements/{id}`
响应：`200` → `Requirement`；`404`

### 新建 · `POST /api/requirements`
请求体：
```jsonc
{
  "date": "2026-09-05",        // * YYYY-MM-DD
  "requirementId": "R-2026-001", // 可选，业务编号，全局唯一；撞号 → 409。**带 workOrderId 时必填**（本质是转需求）。
  "title": "……", "content": "……",   // 可选
  "system": "WMS",             // 默认 WMS
  "currentNode": "方案中",      // 默认「方案中」
  "isUrgent": false,           // 默认 false
  "isReleased": false,         // 默认 false；true 时 releaseDate 必填
  "releaseDate": "2026-09-08", // 仅 isReleased=true 时必填
  "submittedBy": "黄傲",       // * 新记录必填（黄傲 / 陈婷婷）
  "remark": "可选",
  "workOrderId": null          // 可选：关联来源工单（一对一）。见下
}
```
`workOrderId` 语义：把该需求挂到某张工单下（工单转需求）。校验来源工单存在且尚未关联需求（冲突 → `409`）；成功时**事务内**一并把来源工单 `isConvertToRequirement` 置 `true`，并将本需求的 `requirementId` 回写到该工单（保持两侧编号一致）。
响应：`201` → `Requirement`；`400` 校验失败；`409` 编号撞号 / 来源工单已关联需求

### 更新 · `PUT /api/requirements/{id}`
请求体：上述任意字段（局部更新）。额外行为：
- `isReleased` 置 `true` 而未给 `releaseDate` → 自动按当天补齐；置 `false` → 清空 `releaseDate`；
- `developmentDays` 依据更新后有效值自动重算；
- `requirementId` 可改但须唯一（撞号 → 409）；若该需求来自工单，**事务内**一并把来源工单的 `requirementId` 同步为同一编号；
- `workOrderId` 不可经此接口修改来源工单（转需求走专用接口）。

响应：`200` → `Requirement`；`400`；`404`；`409`

### 删除 · `DELETE /api/requirements/{id}`
若该需求由工单转化而来，**事务内**一并把来源工单 `isConvertToRequirement` 复位为 `false`；工单上的 `requirementId`/`requirementContent` **保留**，便于按原编号再次转需求。
响应：`204`；`404`

## 工单转需求（一对一同步）· `POST /api/work-orders/{id}/convert`
请求体（可空）：
```jsonc
{
  "requirementId": "R-2026-006",   // 本次转出的需求ID；列表「转需求」弹框即传此项。
                                   // 不传 → 退回工单上已登记的 requirementId
  "requirementContent": "……"       // 本次转出的需求内容；不传 → 退回工单上已存的 requirementContent
                                   // 传空串 "" → 显式清空（需求内容落 null），与「不传」语义不同
  "submittedBy": "黄傲"            // 本次转出的需求提交人；不传 → 退回工单上已登记的 submittedBy
                                   // 入参必须在枚举内；工单未登记 submittedBy 且入参也不传 → 400
                                   // （历史工单无提交人时，弹框必须显式提供）
}
```
逻辑：
1. 工单不存在 → `404`；
2. 已转需求（`isConvertToRequirement=true` 或已有关联需求）→ `409`；
3. 最终需求ID（入参优先，其次工单已登记值）为空 → `400`（**需求ID 必填，不填不能完成转需求**）；最终需求提交人为空 → `400`；校验失败不产生任何写入；
4. **事务内**：入参的 `requirementId` / `requirementContent` 先写回工单（保证工单与需求两侧一致），再据此创建需求 —— 日期取工单日期、标题取工单标题、内容取工单 `requirementContent`（**为空即落空，不做任何兜底**）、系统取工单系统、`currentNode=方案中`、`developmentDays` 按 `date→今天` 计算、`workOrderId` 指向该工单、`submittedBy` 取最终提交人、`remark` 注明来源；最后置工单 `isConvertToRequirement=true`。

响应：`201` → `{ "requirement": Requirement, "workOrder": WorkOrder }`；`400` 未填需求ID / 未填提交人；`404`；`409`（已转 / 编号被占用）

## 会议纪要 Meeting / 附件 MeetingAttachment

附件存储在磁盘 `uploads/` 目录，数据库仅存元数据。附件有上传白名单（后缀校验）与大小上限（20 MB）。

### 列表 · `GET /api/meetings`
可选查询：`?keyword=xxx`（子串匹配 主题 / 记录人 / 会议内容 / 参会人）、`?attendee=xxx`（按参会人子串匹配）。
按 `createdAt` 倒序。响应：`200` → `Meeting[]`

### 单查 · `GET /api/meetings/{id}`
响应：`200` → `Meeting`；`404`

### 新建 · `POST /api/meetings`
请求体（**纯 JSON，不接收文件**；附件走下面的附件上传接口）：
```jsonc
{
  "date": "2026-09-20",     // 必填，YYYY-MM-DD，按日历日入库
  "title": "...",           // 必填
  "attendees": ["张三"],     // 可选，字符串数组；传非数组 → 400
  "recorder": "李四",        // 可选
  "content": "..."          // 可选
}
```
响应：`201` → `Meeting`；`400` 校验失败

### 更新 · `PUT /api/meetings/{id}`
请求体：上述字段的任意子集（局部更新）。
**三态语义**：未传该字段 = 不改；传空串 = 清空为 null；传非空 = 设为该值。
响应：`200` → `Meeting`；`400`；`404`

### 删除 · `DELETE /api/meetings/{id}`
附件一并删除（**数据库记录 + 磁盘文件**）。
响应：`204`；`404`

### 附件上传 · `POST /api/meetings/{id}/attachments`
请求：`multipart/form-data`，字段名 `file`。**纪要不存在时不会落盘**（先校验再写入）。
响应：`201` → `MeetingAttachment`；
`413` 请求体超限（按 `Content-Length` 预检，**在读取 body 之前**拒绝）；
`400` 白名单外后缀，或实际字节超限（`saveUpload` 兜底）；
`404` 会议纪要不存在

### 附件下载预览 · `GET /api/attachments/{id}`
响应：`200` + 原始字节。`Content-Disposition` **双写**：
`filename="<ASCII 回退名>"` 与 `filename*=UTF-8''<百分号编码>` —— 只给前者的话中文名会乱码或截断。
图片与 PDF 用 `inline`（浏览器内直接预览），其余用 `attachment`。
`404` 有三种情形：附件记录不存在 / 存储路径非法 / **记录在但磁盘文件已丢失**（都返回 404，**不返回 500**）

### 附件删除 · `DELETE /api/attachments/{id}`
先删数据库记录，再删磁盘文件（文件不存在视为成功）。
响应：`204`；`404`

## 工作提醒 Reminder

响应字段：`id`(内部cuid), `date`(YYYY-MM-DD), `remindee`, `content`, `isDone`, `createdAt`, `updatedAt`

> 本表**无外键、无唯一约束、无关联** —— 不关联工单 / 需求 / 会议，因此**不产生 409**。
> `remindee` / `content` 在库结构中即为**非空**（全新表，无历史数据）；`date` 按日历日入库。

### 列表 · `GET /api/reminders`
可选查询（可叠加）：`?isDone=true|false`、`?remindee=黄傲`、`?keyword=xxx`。
- `isDone` **三态**：只有字面量 `true` / `false` 参与过滤；不传或非法值（如 `abc`、空串）一律**不过滤**，不报错；
- `remindee` 精确匹配，**值不在枚举（`黄傲` / `陈婷婷`）内时视作不过滤**（与工单 / 需求的 `submittedBy` 同一口径，不会返回空数组）；
- `keyword` 子串匹配「提醒内容」。

⚠️ **排序破例**：按 `date` 升序、同日按 `createdAt` 升序 —— 这是全站**唯一**一个不按 `createdAt` 倒序的列表（提醒的价值在「接下来要做什么」，最早的日期排最前，逾期 / 今日到期的自然浮到顶部）。
响应：`200` → `Reminder[]`

### 单查 · `GET /api/reminders/{id}`
响应：`200` → `Reminder`；`404` 工作提醒不存在

### 新建 · `POST /api/reminders`
请求体（`*`=必填）：
```jsonc
{
  "date": "2026-10-01",   // * YYYY-MM-DD
  "remindee": "黄傲",      // * 须在枚举内（黄傲 / 陈婷婷）
  "content": "……"         // * 非空
}
```
响应：`201` → `Reminder`；`400` 校验失败（含 details）

### 更新 · `PUT /api/reminders/{id}`
请求体：上述字段的任意子集（局部更新）。
**必填字段不适用三态语义** —— 项目里「未传 = 不改 / 空串 = 清空 / 非空 = 设为该值」那套只对**可选**字段成立；`remindee` / `content` 是必填，传空串一律 `400`（不会置空）。`isDone` 传 `false` 是**有效值**（不是「不改」）。
响应：`200` → `Reminder`；`400` 校验失败 / 无可更新字段；`404`

### 删除 · `DELETE /api/reminders/{id}`
无关联对象，直接删除。
响应：`204`（无响应体）；`404` 工作提醒不存在

## 错误码汇总

| 状态码 | 含义 |
|--------|------|
| 400 | 参数校验失败 / 请求体非 JSON / 无可更新字段 / 转需求时缺需求ID / 已关联需求时关闭转需求 / 工作提醒必填字段传空串（remindee / content）；附 details |
| 404 | 目标记录不存在 |
| 409 | 唯一冲突（编号撞号）或状态冲突（已转需求 / 来源工单已占用 / 删除有关联需求的工单） |
| 413 | 附件大小超过 20 MB 限制 |
| 204 | 删除成功（无响应体） |

## 自动化测试
`node scripts/api-smoke.mjs` —— 需先启动服务（dev 或生产均可）；覆盖全部 CRUD、需求ID 同步（必填/改名/撞号/锁定）、convert 入参与退回两条路径、需求内容空值语义（不传/空串/无内容均不回退标题）、409/404/400/413、发版联动、开发时长重算、来源链接与删除一致性、提交人必填 + 三态 + convert 继承/覆写、提交人列表筛选、会议纪要 CRUD、附件上传/下载/删除/白名单/自清理、工作提醒 CRUD / 三态筛选 / 升序排序 / 必填不可清空（198 项断言全绿，运行后自动清理测试数据）。
