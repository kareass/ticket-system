import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/db";
import {
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

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

/** GET /api/work-orders/:id —— 单条工单；不存在 → 404 */
export async function GET(_req: Request, { params }: Ctx) {
  const wo = await prisma.workOrder.findUnique({ where: { id: params.id } });
  if (!wo) return apiError(404, "工单不存在。");
  return NextResponse.json(toWorkOrderJson(wo));
}

/**
 * PUT /api/work-orders/:id
 * 更新工单。允许字段：date / title / content / system / isConvertToRequirement / status / remark。
 * 校验规则同新建；仅校验传入的字段。不存在 → 404。
 */
export async function PUT(req: Request, { params }: Ctx) {
  const existing = await prisma.workOrder.findUnique({
    where: { id: params.id },
  });
  if (!existing) return apiError(404, "工单不存在。");

  const body = await readJson(req);
  if (!body) return apiError(400, "请求体必须是合法 JSON 对象。");

  const errors: string[] = [];
  const data: Record<string, unknown> = {};

  if (body.date !== undefined) {
    const date = asTrimmed(body.date);
    if (!date || !isValidCalendarDay(date)) {
      errors.push("date 格式 YYYY-MM-DD。");
    } else {
      data.date = toDayUtc(date) as Date;
    }
  }
  if (body.title !== undefined) {
    const title = asTrimmed(body.title);
    if (!title) errors.push("title 不能为空。");
    else data.title = title;
  }
  if (body.content !== undefined) {
    const content = asTrimmed(body.content);
    if (!content) errors.push("content 不能为空。");
    else data.content = content;
  }
  if (body.system !== undefined) {
    const system = asTrimmed(body.system);
    if (!system || !SYSTEMS.includes(system)) {
      errors.push(`system 须为以下之一：${SYSTEMS.join(" / ")}。`);
    } else data.system = system;
  }
  if (body.isConvertToRequirement !== undefined) {
    const flag = asBool(body.isConvertToRequirement);
    if (flag === undefined) errors.push("isConvertToRequirement 须为布尔值。");
    else data.isConvertToRequirement = flag;
  }
  if (body.status !== undefined) {
    const status = asTrimmed(body.status);
    if (!status || !(WORK_ORDER_STATUSES as readonly string[]).includes(status)) {
      errors.push(`status 须为以下之一：${WORK_ORDER_STATUSES.join(" / ")}。`);
    } else data.status = status;
  }
  if (body.remark !== undefined) {
    data.remark = asTrimmed(body.remark) || null;
  }

  if (errors.length) return apiError(400, "参数校验失败。", errors);
  if (!Object.keys(data).length) return apiError(400, "未提供任何可更新字段。");

  const wo = await prisma.workOrder.update({
    where: { id: params.id },
    data,
  });
  return NextResponse.json(toWorkOrderJson(wo));
}

/**
 * DELETE /api/work-orders/:id
 * 删除工单。若该工单已关联需求（一对一已转），返回 409 —— 需先处理关联需求，
 * 避免误删导致需求失去来源。删除成功返回 204。
 */
export async function DELETE(_req: Request, { params }: Ctx) {
  const wo = await prisma.workOrder.findUnique({
    where: { id: params.id },
    include: { requirement: true },
  });
  if (!wo) return apiError(404, "工单不存在。");
  if (wo.requirement) {
    return apiError(
      409,
      "该工单已转为需求（" +
        wo.requirement.requirementId +
        "），请先删除关联需求再删除工单。",
    );
  }

  await prisma.workOrder.delete({ where: { id: params.id } });
  return new NextResponse(null, { status: 204 });
}
