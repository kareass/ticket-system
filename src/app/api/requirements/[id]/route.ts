import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/db";
import {
  NODES,
  SYSTEMS,
  apiError,
  asBool,
  asTrimmed,
  isPrismaUnique,
  isValidCalendarDay,
  readJson,
  recomputeDevDays,
  toDayUtc,
  toRequirementJson,
} from "@/lib/server/helpers";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

/** GET /api/requirements/:id —— 单条需求；不存在 → 404 */
export async function GET(_req: Request, { params }: Ctx) {
  const req = await prisma.requirement.findUnique({
    where: { id: params.id },
  });
  if (!req) return apiError(404, "需求不存在。");
  return NextResponse.json(toRequirementJson(req));
}

/**
 * PUT /api/requirements/:id
 * 更新需求。允许字段：date / requirementId / title / content / system / currentNode
 * / isUrgent / isReleased / releaseDate / remark。
 * - isReleased 置 true 而未给 releaseDate → 自动按今天补齐（与列表内联开启一致）；
 *   isReleased 置 false → 清空 releaseDate。
 * - developmentDays 按更新后的有效值由服务端重算。
 * - requirementId 可改但须唯一（撞号 → 409）；workOrderId 不可经此修改（转需求走专用接口）。
 */
export async function PUT(req: Request, { params }: Ctx) {
  const existing = await prisma.requirement.findUnique({
    where: { id: params.id },
  });
  if (!existing) return apiError(404, "需求不存在。");

  const body = await readJson(req);
  if (!body) return apiError(400, "请求体必须是合法 JSON 对象。");

  const errors: string[] = [];
  const data: Prisma.RequirementUncheckedUpdateInput = {};

  let dateStr = existing.date.toISOString().slice(0, 10);
  let isReleased = existing.isReleased;
  let releaseDateStr = existing.releaseDate
    ? existing.releaseDate.toISOString().slice(0, 10)
    : undefined;

  if (body.date !== undefined) {
    const date = asTrimmed(body.date);
    if (!date || !isValidCalendarDay(date)) {
      errors.push("date 格式 YYYY-MM-DD。");
    } else {
      data.date = toDayUtc(date) as Date;
      dateStr = date;
    }
  }
  if (body.requirementId !== undefined) {
    const requirementId = asTrimmed(body.requirementId);
    if (!requirementId) errors.push("requirementId 不能为空。");
    else data.requirementId = requirementId;
  }
  if (body.title !== undefined) {
    data.title = asTrimmed(body.title) || null;
  }
  if (body.content !== undefined) {
    data.content = asTrimmed(body.content) || null;
  }
  if (body.system !== undefined) {
    const system = asTrimmed(body.system);
    if (!system || !SYSTEMS.includes(system)) {
      errors.push(`system 须为以下之一：${SYSTEMS.join(" / ")}。`);
    } else data.system = system;
  }
  if (body.currentNode !== undefined) {
    const currentNode = asTrimmed(body.currentNode);
    if (!currentNode || !NODES.includes(currentNode)) {
      errors.push(`currentNode 须为以下之一：${NODES.join(" / ")}。`);
    } else data.currentNode = currentNode;
  }
  if (body.isUrgent !== undefined) {
    const flag = asBool(body.isUrgent);
    if (flag === undefined) errors.push("isUrgent 须为布尔值。");
    else data.isUrgent = flag;
  }
  if (body.isReleased !== undefined) {
    const flag = asBool(body.isReleased);
    if (flag === undefined) {
      errors.push("isReleased 须为布尔值。");
    } else {
      data.isReleased = flag;
      isReleased = flag;
      if (!flag) data.releaseDate = null; // 关闭发版 → 清空发版时间
    }
  }
  if (body.releaseDate !== undefined) {
    const releaseDate = asTrimmed(body.releaseDate);
    if (isReleased) {
      if (!releaseDate || !isValidCalendarDay(releaseDate)) {
        errors.push("releaseDate 格式 YYYY-MM-DD（isReleased=true 时必填）。");
      } else {
        data.releaseDate = toDayUtc(releaseDate) as Date;
        releaseDateStr = releaseDate;
      }
    } else {
      data.releaseDate = null; // 未发版时的发版时间一律清空
    }
  }
  if (body.remark !== undefined) {
    data.remark = asTrimmed(body.remark) || null;
  }
  if (body.workOrderId !== undefined && asTrimmed(body.workOrderId) !== existing.workOrderId) {
    return apiError(400, "workOrderId 不可经更新接口修改来源工单（请通过转需求专用接口）。");
  }

  if (errors.length) return apiError(400, "参数校验失败。", errors);
  if (!Object.keys(data).length) return apiError(400, "未提供任何可更新字段。");

  // 发版开启但未给 releaseDate → 自动按今天补齐（与前端内联开启行为一致）
  if (isReleased && data.isReleased && !existing.isReleased && !releaseDateStr) {
    const today = new Date().toISOString().slice(0, 10);
    data.releaseDate = toDayUtc(today) as Date;
    releaseDateStr = today;
  }

  // 开发时长按更新后有效值重算
  data.developmentDays = recomputeDevDays(
    dateStr,
    isReleased,
    releaseDateStr,
  );

  try {
    const updated = await prisma.requirement.update({
      where: { id: params.id },
      data,
    });
    return NextResponse.json(toRequirementJson(updated));
  } catch (err) {
    if (isPrismaUnique(err)) {
      return apiError(409, "需求ID 已被占用，请更换。");
    }
    throw err;
  }
}

/**
 * DELETE /api/requirements/:id
 * 删除需求。若该需求由工单转化（存在 workOrderId），事务内一并把来源工单的
 * isConvertToRequirement 复位为 false，保持一对一状态一致。删除成功返回 204。
 */
export async function DELETE(_req: Request, { params }: Ctx) {
  const existing = await prisma.requirement.findUnique({
    where: { id: params.id },
  });
  if (!existing) return apiError(404, "需求不存在。");

  await prisma.$transaction([
    prisma.requirement.delete({ where: { id: params.id } }),
    ...(existing.workOrderId
      ? [
          prisma.workOrder.update({
            where: { id: existing.workOrderId },
            data: { isConvertToRequirement: false },
          }),
        ]
      : []),
  ]);

  return new NextResponse(null, { status: 204 });
}
