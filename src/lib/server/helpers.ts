import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import type { Requirement as DbRequirement, WorkOrder as DbWorkOrder } from "@prisma/client";
import { NODE_OPTIONS, SYSTEM_OPTIONS } from "@/types";
import { diffDays } from "@/lib/utils";

/**
 * 后端 API 共享工具（仅供服务端 route handler 使用）
 * - 枚举口径与前端一致：系统 SYSTEM_OPTIONS / 工单状态 / 需求节点 NODE_OPTIONS
 * - 日期统一按「日历日（YYYY-MM-DD）」理解：
 *     入库  → 该日 UTC 零点（避免 +8 等时区导致日期偏一天）；
 *     出参  → 还原为 YYYY-MM-DD。
 * - developmentDays 一律在服务端重算（不信任前端提交值），规则镜像前端表单：
 *     未发版 → date → 今天；已发版 → date → 发版时间；含当天，下限 0。
 */

export const SYSTEMS: readonly string[] = SYSTEM_OPTIONS;
export const WORK_ORDER_STATUSES = ["新建", "已处理", "已关闭"] as const;
export const NODES: readonly string[] = NODE_OPTIONS;

const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** 日历日字符串是否真实存在（如 2026-02-30 拒绝） */
export function isValidCalendarDay(s: string): boolean {
  if (!CALENDAR_DAY.test(s)) return false;
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** 日历日字符串 → 该日 UTC 零点 Date（入库口径）；非法返回 null */
export function toDayUtc(s: string): Date | null {
  if (!isValidCalendarDay(s)) return null;
  return new Date(`${s}T00:00:00.000Z`);
}

/** 存储的 UTC 零点日期 → 日历日 YYYY-MM-DD（出参口径）；非日期返回 undefined */
export function dayOnly(
  d: Date | string | null | undefined,
): string | undefined {
  if (!d) return undefined;
  const t = new Date(d).getTime();
  if (Number.isNaN(t)) return undefined;
  return new Date(d).toISOString().slice(0, 10);
}

/** null 归一化为 undefined（Prisma 可空字段 → 前端可选字段口径） */
export function clean<T>(v: T | null | undefined): T | undefined {
  return v === null ? undefined : v;
}

/** 服务端权威计算开发时长（天），与前端表单规则一致 */
export function recomputeDevDays(
  dateStr: string | undefined,
  isReleased: boolean,
  releaseDateStr: string | undefined,
): number {
  if (!dateStr || !isValidCalendarDay(dateStr)) return 0;
  if (isReleased && releaseDateStr && isValidCalendarDay(releaseDateStr)) {
    return Math.max(0, diffDays(dateStr, releaseDateStr));
  }
  return Math.max(0, diffDays(dateStr));
}

/** 读取请求 JSON body；非法 JSON 返回 null（由调用方回 400） */
export async function readJson(
  req: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * 业务失败异常：在事务内抛出以回滚整个事务，并由路由 catch 转为标准错误响应。
 * 用法：throw new ApiFailure(409, "需求ID 已被占用。")
 */
export class ApiFailure extends Error {
  status: number;
  details?: string[];

  constructor(status: number, message: string, details?: string[]) {
    super(message);
    this.name = "ApiFailure";
    this.status = status;
    this.details = details;
  }
}

/** 统一错误响应：{ error: message }，可选 details */
export function apiError(
  status: number,
  message: string,
  details?: unknown,
): NextResponse {
  return NextResponse.json(
    details === undefined ? { error: message } : { error: message, details },
    { status },
  );
}

/** 是否 Prisma 唯一约束冲突（P2002，用于 requirementId 撞号 → 409） */
export function isPrismaUnique(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

/** 校验布尔值类型（允许 undefined） */
export function asBool(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}

/** 字符串裁剪；非字符串返回 undefined */
export function asTrimmed(v: unknown): string | undefined {
  return typeof v === "string" ? v.trim() : undefined;
}

/* ---------------- 响应序列化：Db 行 → 前端契约 JSON ---------------- */

export interface WorkOrderJson {
  id: string;
  date: string;
  title: string;
  content: string;
  system: string;
  isConvertToRequirement: boolean;
  requirementId?: string;
  requirementContent?: string;
  remark?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface RequirementJson {
  id: string;
  requirementId: string;
  date: string;
  title?: string;
  content?: string;
  system: string;
  developmentDays?: number;
  currentNode: string;
  isUrgent: boolean;
  isReleased: boolean;
  releaseDate?: string;
  remark?: string;
  workOrderId?: string;
  createdAt: string;
  updatedAt: string;
}

export function toWorkOrderJson(wo: DbWorkOrder): WorkOrderJson {
  return {
    id: wo.id,
    date: dayOnly(wo.date) as string,
    title: wo.title,
    content: wo.content,
    system: wo.system,
    isConvertToRequirement: wo.isConvertToRequirement,
    requirementId: clean(wo.requirementId),
    requirementContent: clean(wo.requirementContent),
    remark: clean(wo.remark),
    status: wo.status,
    createdAt: wo.createdAt.toISOString(),
    updatedAt: wo.updatedAt.toISOString(),
  };
}

export function toRequirementJson(r: DbRequirement): RequirementJson {
  return {
    id: r.id,
    requirementId: r.requirementId,
    date: dayOnly(r.date) as string,
    title: clean(r.title),
    content: clean(r.content),
    system: r.system,
    developmentDays: clean(r.developmentDays),
    currentNode: r.currentNode,
    isUrgent: r.isUrgent,
    isReleased: r.isReleased,
    releaseDate: clean(r.releaseDate)
      ? dayOnly(r.releaseDate)
      : undefined,
    remark: clean(r.remark),
    workOrderId: clean(r.workOrderId),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}
