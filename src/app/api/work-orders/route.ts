import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/db";
import {
  ApiFailure,
  SYSTEMS,
  WORK_ORDER_STATUSES,
  apiError,
  asBool,
  asTrimmed,
  isValidCalendarDay,
  readJson,
  toDayUtc,
  toWorkOrderJson,
} from "@/lib/server/helpers";
import { syncRequirementForWorkOrder } from "@/lib/server/work-order-sync";

/** Prisma 客户端依赖 Node 运行时（勿被 Next 按 Edge 打包） */
export const runtime = "nodejs";

/**
 * GET /api/work-orders
 * 工单列表。可选过滤：?system=WMS&keyword=出库（keyword 匹配标题，忽略大小写）。
 * 按创建时间倒序返回（与前端「新建在顶」一致）。
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const system = url.searchParams.get("system");
  const keyword = url.searchParams.get("keyword")?.trim();

  const where: Prisma.WorkOrderWhereInput = {
    // 仅在系统枚举内的值才参与过滤；非法/空值视为不过滤
    ...(system && SYSTEMS.includes(system) ? { system } : {}),
    ...(keyword ? { title: { contains: keyword } } : {}),
  };

  const rows = await prisma.workOrder.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(rows.map(toWorkOrderJson));
}

/**
 * POST /api/work-orders
 * 新建工单。body（校验失败 → 400）：
 *   date* / title* / content* 必填；system（默认 WMS，须在系统枚举内）；
 *   status（默认「新建」，须在 新建/已处理/已关闭 内）；
 *   isConvertToRequirement（默认 false）；remark 可选；
 *   requirementId（需求ID）/ requirementContent（需求内容）可选，
 *   但 isConvertToRequirement=true 时 requirementId 必填，且保存即自动同步创建需求
 *   （需求ID 已被占用 → 409，整个创建回滚）。
 * 返回 201 + 创建结果（id / createdAt / updatedAt 由数据库生成）。
 */
export async function POST(req: Request) {
  const body = await readJson(req);
  if (!body) return apiError(400, "请求体必须是合法 JSON 对象。");

  const errors: string[] = [];

  const date = asTrimmed(body.date);
  if (!date || !isValidCalendarDay(date)) {
    errors.push("date 必填，格式 YYYY-MM-DD。");
  }
  const title = asTrimmed(body.title);
  if (!title) errors.push("title 必填。");
  const content = asTrimmed(body.content);
  if (!content) errors.push("content 必填。");

  const system = asTrimmed(body.system) || "WMS";
  if (!SYSTEMS.includes(system)) {
    errors.push(`system 须为以下之一：${SYSTEMS.join(" / ")}。`);
  }

  const status = asTrimmed(body.status) || "新建";
  if (!(WORK_ORDER_STATUSES as readonly string[]).includes(status)) {
    errors.push(`status 须为以下之一：${WORK_ORDER_STATUSES.join(" / ")}。`);
  }

  const isConvertToRequirement = asBool(body.isConvertToRequirement);
  if (body.isConvertToRequirement !== undefined && isConvertToRequirement === undefined) {
    errors.push("isConvertToRequirement 须为布尔值。");
  }
  const remark = asTrimmed(body.remark);
  const requirementId = asTrimmed(body.requirementId);
  const requirementContent = asTrimmed(body.requirementContent);

  // 「转需求」必须带需求ID（设计文档：需求ID必填）
  if (isConvertToRequirement === true && !requirementId) {
    errors.push("isConvertToRequirement=true 时 requirementId 必填。");
  }

  if (errors.length) return apiError(400, "参数校验失败。", errors);

  try {
    const wo = await prisma.$transaction(async (tx) => {
      const created = await tx.workOrder.create({
        data: {
          date: toDayUtc(date as string) as Date,
          title: title as string,
          content: content as string,
          system,
          status,
          isConvertToRequirement: isConvertToRequirement ?? false,
          // 空串（含前端「清空」语义）统一落 null，避免库中出现空字符串
          ...(requirementId ? { requirementId } : {}),
          ...(requirementContent ? { requirementContent } : {}),
          ...(remark ? { remark } : {}),
        },
      });
      // 转需求 → 同步创建需求；失败则整笔回滚（不留半成品工单）
      if (created.isConvertToRequirement) {
        const sync = await syncRequirementForWorkOrder(created, tx);
        if (!sync.ok) throw new ApiFailure(sync.status, sync.error);
      }
      return created;
    });
    return NextResponse.json(toWorkOrderJson(wo), { status: 201 });
  } catch (err) {
    if (err instanceof ApiFailure) return apiError(err.status, err.message, err.details);
    throw err;
  }
}
