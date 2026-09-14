// 全局类型定义：与 prisma/schema.prisma 保持字段口径一致

// ============================================================================
// 下拉选项「单一来源」
// ----------------------------------------------------------------------------
// 本文件是全站唯一的选项定义处。以下三处都只从这里取，不再各自写一份：
//   ① 表单下拉（WorkOrderForm / RequirementForm / SystemSelect）
//   ② 列表内联下拉与筛选框（work-orders、requirements 两个列表页）
//   ③ 后端接口的枚举校验（src/lib/server/helpers.ts 转发为 SYSTEMS / NODES /
//      WORK_ORDER_STATUSES）
//
// 想新增一个下拉选项：**只改下面数组里的一行**。
//   - 数组声明为 as const，联合类型由数组自动推导（typeof ARR[number]），
//     不必再手改类型定义；
//   - 配色表是 Record<联合类型, string>，漏加配色会直接编译报错，不会静默失败；
//   - 无需数据库迁移：schema.prisma 中这些字段是普通 String 列，不是数据库枚举。
//
// ⚠️ 需求节点 NODE_OPTIONS 的五种取值写死在设计文档里，增删节点属于需求变更，
//    应先改设计文档再改这里；系统 SYSTEM_OPTIONS 在设计文档中未枚举，可直接增删。
// ============================================================================

/** 系统（工单表 / 需求表共用） */
export const SYSTEM_OPTIONS = ["WMS", "ERP", "OMS", "TMS", "其他"] as const;
export type SystemValue = (typeof SYSTEM_OPTIONS)[number];

/** 工单状态（预留扩展，以设计文档为准：新建/已处理/已关闭） */
export const WORK_ORDER_STATUS_OPTIONS = ["新建", "已处理", "已关闭"] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUS_OPTIONS)[number];

/** 需求当前节点 */
export const NODE_OPTIONS = [
  "方案中",
  "开发中",
  "测试中",
  "已合并",
  "已发布",
] as const;
export type RequirementNode = (typeof NODE_OPTIONS)[number];

/**
 * 是 / 否 布尔下拉选项（「是否加急」「是否发版」共用）
 * 注意：值是 boolean 而非字符串，别与上面的字符串枚举混用
 */
export const YES_NO_OPTIONS: { label: string; value: boolean }[] = [
  { label: "否", value: false },
  { label: "是", value: true },
];

/**
 * 字符串选项数组 → antd Select / EditableChip 需要的 { label, value } 结构
 * 收敛各处重复的 `.map((v) => ({ label: v, value: v }))`
 */
export function asSelectOptions<T extends string>(
  values: readonly T[],
): { label: T; value: T }[] {
  return values.map((value) => ({ label: value, value }));
}

// ---------- 标签配色（与上面的选项一一对应，新增选项时同步补一行） ----------

/** 系统标签配色（未覆盖的系统退回默认灰色） */
export const SYSTEM_COLORS: Record<string, string> = {
  WMS: "blue",
  ERP: "purple",
  OMS: "cyan",
  TMS: "orange",
  其他: "gold",
};

/** 工单状态标签配色 */
export const WORK_ORDER_STATUS_COLORS: Record<WorkOrderStatus, string> = {
  新建: "gold",
  已处理: "success",
  已关闭: "default",
};

/** 需求节点标签配色 */
export const NODE_COLORS: Record<RequirementNode, string> = {
  方案中: "default",
  开发中: "processing",
  测试中: "warning",
  已合并: "cyan",
  已发布: "success",
};

// ---------- 工单 WorkOrder ----------
export interface WorkOrder {
  id: string;
  /** 日期（必填，日期选择器默认当天） */
  date: string; // ISO 日期字符串
  /** 标题（必填） */
  title: string;
  /** 工单内容（必填） */
  content: string;
  /** 系统（必填，默认 WMS） */
  system: string;
  /** 是否转需求 */
  isConvertToRequirement: boolean;
  /** 需求 ID（业务编号；「是否转需求」为是时必填，据此同步创建需求） */
  requirementId?: string;
  /** 需求内容（转需求时同步到需求表；留空则转出的需求内容也为空） */
  requirementContent?: string;
  /** 备注 */
  remark?: string;
  /** 工单状态（预留） */
  status: WorkOrderStatus;
  createdAt: string;
  updatedAt: string;
}

// ---------- 需求 Requirement ----------
export interface Requirement {
  /** 内部主键（cuid） */
  id: string;
  /** 需求业务编号（必填、唯一，如 R-2026-001） */
  requirementId: string;
  /** 日期（必填，日期选择器默认当天） */
  date: string;
  /** 需求标题 */
  title?: string;
  /** 需求内容 */
  content?: string;
  /** 系统（必填，默认 WMS） */
  system: string;
  /** 开发时长（天，自动计算） */
  developmentDays?: number;
  /** 当前节点 */
  currentNode: RequirementNode;
  /** 是否加急 */
  isUrgent: boolean;
  /** 是否发版 */
  isReleased: boolean;
  /** 发版时间（仅 isReleased=true 时必填） */
  releaseDate?: string;
  /** 备注 */
  remark?: string;
  /** 来源工单内部主键（工单转需求时填充，一对一，设计文档=关联工单ID workOrderId） */
  workOrderId?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------- 开发时长计算说明 ----------
// developmentDays = date 到「当前系统时间」的天数；
// 若 isReleased=true，则为 date 到 releaseDate 的天数。
export function calcDevelopmentDays(
  startDate: string,
  endDate: string,
): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  return Math.max(
    0,
    Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)),
  );
}
