// 全局类型定义：与 prisma/schema.prisma 保持字段口径一致

// 工单状态（预留扩展，以设计文档为准：新建/已处理/已关闭）
export type WorkOrderStatus = "新建" | "已处理" | "已关闭";

// 系统枚举（下拉框选项）
export const SYSTEM_OPTIONS = ["WMS", "ERP", "OMS", "TMS", "其他"] as const;

// 需求当前节点（下拉框选项）
export type RequirementNode =
  | "方案中"
  | "开发中"
  | "测试中"
  | "已合并"
  | "已发布";

export const NODE_OPTIONS: RequirementNode[] = [
  "方案中",
  "开发中",
  "测试中",
  "已合并",
  "已发布",
];

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
