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
| system（系统） | `WMS` / `ERP` / `OMS` / `TMS` / `其他` |
| status（工单状态） | `新建` / `已处理` / `已关闭` |
| currentNode（需求节点） | `方案中` / `开发中` / `测试中` / `已合并` / `已发布` |
| 需求业务编号 | `requirementId`，唯一；建议格式 `R-{年}-{序号}`（如 `R-2026-001`） |

## 工单 WorkOrder

响应字段：`id`(内部cuid), `date`, `title`, `content`, `system`, `isConvertToRequirement`, `remark?`, `status`, `createdAt`, `updatedAt`

### 列表 · `GET /api/work-orders`
可选查询：`?system=WMS&keyword=出库`（keyword 匹配标题，忽略大小写）。按 `createdAt` 倒序。
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
  "remark": "可选"
}
```
`developmentDays`/时间戳由服务端生成，传入忽略。
响应：`201` → `WorkOrder`；`400` 校验失败（含 details）

### 更新 · `PUT /api/work-orders/{id}`
请求体：上述任意字段（局部更新）。`remark` 传空串将置空。
响应：`200` → `WorkOrder`；`400` 校验失败 / 无可更新字段；`404` 工单不存在

### 删除 · `DELETE /api/work-orders/{id}`
响应：`204` 成功；`404` 不存在；`409` 该工单已转需求（存在关联需求），需先删除关联需求

## 需求 Requirement

响应字段：`id`(cuid), `requirementId`, `date`, `title?`, `content?`, `system`, `developmentDays?`, `currentNode`, `isUrgent`, `isReleased`, `releaseDate?`, `remark?`, `workOrderId?`, `createdAt`, `updatedAt`

> **developmentDays 规则**（服务端权威计算，忽略提交值）：未发版 = `date → 今天`；已发版 = `date → releaseDate`；含当天，下限 0。

### 列表 · `GET /api/requirements`
可选查询：`?system=WMS&currentNode=测试中&keyword=xxx`（keyword 匹配需求ID或标题）。按 `createdAt` 倒序。
响应：`200` → `Requirement[]`

### 单查 · `GET /api/requirements/{id}`
响应：`200` → `Requirement`；`404`

### 新建 · `POST /api/requirements`
请求体：
```jsonc
{
  "date": "2026-09-05",        // * YYYY-MM-DD
  "requirementId": "R-2026-001", // * 业务编号，唯一；撞号 → 409
  "title": "……", "content": "……",   // 可选
  "system": "WMS",             // 默认 WMS
  "currentNode": "方案中",      // 默认「方案中」
  "isUrgent": false,           // 默认 false
  "isReleased": false,         // 默认 false；true 时 releaseDate 必填
  "releaseDate": "2026-09-08", // 仅 isReleased=true 时必填
  "remark": "可选",
  "workOrderId": null          // 可选：关联来源工单（一对一）。见下
}
```
`workOrderId` 语义：把该需求挂到某张工单下（工单转需求）。校验来源工单存在且尚未关联需求（冲突 → `409`）；成功时**事务内**一并把来源工单 `isConvertToRequirement` 置 `true`。
响应：`201` → `Requirement`；`400` 校验失败；`409` 编号撞号 / 来源工单已关联需求

### 更新 · `PUT /api/requirements/{id}`
请求体：上述任意字段（局部更新）。额外行为：
- `isReleased` 置 `true` 而未给 `releaseDate` → 自动按当天补齐；置 `false` → 清空 `releaseDate`；
- `developmentDays` 依据更新后有效值自动重算；
- `requirementId` 可改但须唯一（撞号 → 409）；
- `workOrderId` 不可经此接口修改来源工单（转需求走专用接口）。

响应：`200` → `Requirement`；`400`；`404`；`409`

### 删除 · `DELETE /api/requirements/{id}`
若该需求由工单转化而来，**事务内**一并把来源工单 `isConvertToRequirement` 复位为 `false`。
响应：`204`；`404`

## 工单转需求（一对一同步）· `POST /api/work-orders/{id}/convert`
请求体：可空（`{}` 或空）。逻辑：
1. 工单不存在 → `404`；
2. 已转需求（`isConvertToRequirement=true` 或已有关联需求）→ `409`；
3. **事务内**新建需求并置工单标记：自动拷贝 `date/title/content/system`，自动生成业务编号 `R-{年}-{序号}`（不重复），`currentNode=方案中`，`developmentDays` 按 `date→今天` 计算，`workOrderId` 指向该工单，`remark` 注明来源。

响应：`201` → `{ "requirement": Requirement, "workOrder": WorkOrder }`；`404`；`409`（已转/并发重复操作）

## 错误码汇总

| 状态码 | 含义 |
|--------|------|
| 400 | 参数校验失败 / 请求体非 JSON / 无可更新字段；附 details |
| 404 | 目标记录不存在 |
| 409 | 唯一冲突（编号撞号）或状态冲突（已转需求 / 来源工单已占用 / 删除有关联需求的工单） |
| 204 | 删除成功（无响应体） |

## 自动化测试
`node scripts/api-smoke.mjs` —— 需先启动 dev server；覆盖全部 CRUD、409/404/400、发版联动、开发时长重算、来源链接与删除一致性（45 项断言全绿）。
