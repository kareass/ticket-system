import type { WorkOrder, Requirement } from "@/types";

/**
 * Mock 数据 —— 【已停用】仅保留作历史参考。
 *
 * 环节5 起数据源为真实后端 API（`@/lib/api.ts` + Prisma/SQLite），
 * 页面不再引用本文件；等价演示数据已迁移到 `prisma/seed.ts`（npm run db:seed）。
 * 请勿在新代码中使用，以免与数据库数据口径漂移。
 */

export const mockWorkOrders: WorkOrder[] = [
  {
    id: "wo-001",
    date: "2026-09-01",
    title: "WMS 出库单打印优化",
    content: "出库单打印模板需要支持自定义纸张大小，并增加批次号字段展示。",
    system: "WMS",
    isConvertToRequirement: true,
    remark: "业务提出，已确认转为需求跟进。",
    status: "新建",
    createdAt: "2026-09-01T09:00:00.000Z",
    updatedAt: "2026-09-01T09:00:00.000Z",
  },
  {
    id: "wo-002",
    date: "2026-09-03",
    title: "OMS 订单同步异常排查",
    content: "部分订单在 OMS 与 ERP 之间同步状态不一致，需排查数据链路。",
    system: "OMS",
    isConvertToRequirement: false,
    remark: "",
    status: "新建",
    createdAt: "2026-09-03T10:30:00.000Z",
    updatedAt: "2026-09-03T10:30:00.000Z",
  },
  {
    id: "wo-003",
    date: "2026-09-05",
    title: "TMS 在途节点提醒功能咨询",
    content: "运单在途节点是否需要短信提醒，先与承运方确认需求范围。",
    system: "TMS",
    isConvertToRequirement: false,
    remark: "待确认，暂不处理。",
    status: "新建",
    createdAt: "2026-09-05T14:00:00.000Z",
    updatedAt: "2026-09-05T14:00:00.000Z",
  },
];

export const mockRequirements: Requirement[] = [
  {
    id: "req-001",
    requirementId: "R-2026-001",
    date: "2026-09-01",
    title: "WMS 出库单打印优化",
    content: "出库单打印模板支持自定义纸张大小，增加批次号展示。",
    system: "WMS",
    developmentDays: 3,
    currentNode: "测试中",
    isUrgent: true,
    isReleased: false,
    remark: "由工单 wo-001 转化。",
    workOrderId: "wo-001",
    createdAt: "2026-09-01T09:05:00.000Z",
    updatedAt: "2026-09-06T18:00:00.000Z",
  },
  {
    id: "req-002",
    requirementId: "R-2026-002",
    date: "2026-08-20",
    title: "ERP 库存月报导出增强",
    content: "库存月报支持按仓库维度多选导出 Excel。",
    system: "ERP",
    developmentDays: 8,
    currentNode: "已合并",
    isUrgent: false,
    isReleased: true,
    releaseDate: "2026-08-28",
    remark: "已随 8 月底发版。",
    createdAt: "2026-08-20T11:00:00.000Z",
    updatedAt: "2026-08-28T09:00:00.000Z",
  },
  {
    id: "req-003",
    requirementId: "R-2026-003",
    date: "2026-09-08",
    title: "WMS 盘点差异分析看板",
    content: "针对盘点差异数据提供可视化分析看板。",
    system: "WMS",
    developmentDays: 1,
    currentNode: "方案中",
    isUrgent: false,
    isReleased: false,
    remark: "",
    createdAt: "2026-09-08T09:00:00.000Z",
    updatedAt: "2026-09-08T09:00:00.000Z",
  },
];
