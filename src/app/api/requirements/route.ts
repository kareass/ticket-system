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

/**
 * GET /api/requirements
 * 需求列表。可选过滤：?system=WMS&currentNode=测试中&keyword=xxx
 * （keyword 匹配 需求ID 或 需求标题，忽略大小写）。按创建时间倒序。
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const system = url.searchParams.get("system");
  const currentNode = url.searchParams.get("currentNode");
  const keyword = url.searchParams.get("keyword")?.trim();

  const where: Prisma.RequirementWhereInput = {
    ...(system && SYSTEMS.includes(system) ? { system } : {}),
    ...(currentNode && NODES.includes(currentNode) ? { currentNode } : {}),
    ...(keyword
      ? { OR: [{ requirementId: { contains: keyword } }, { title: { contains: keyword } }] }
      : {}),
  };

  const rows = await prisma.requirement.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(rows.map(toRequirementJson));
}

/**
 * POST /api/requirements
 * 新建需求。body（校验失败 → 400）：
 *   date* / requirementId*（业务编号，唯一，撞号 → 409）必填；
 *   system（默认 WMS）/ currentNode（默认「方案中」）/ isUrgent（默认 false）
 *   / isReleased（默认 false）/ title / content / remark 可选；
 *   releaseDate 仅在 isReleased=true 时必填，否则落空；
 *   developmentDays 由服务端按规则重算，忽略提交值；
 *   workOrderId（可选）：关联来源工单（一对一），校验存在且未占用，
 *   事务内一并置父工单 isConvertToRequirement=true 并回写父工单 requirementId（保持两侧编号一致）。
 * 返回 201 + 创建结果。
 */
export async function POST(req: Request) {
  const body = await readJson(req);
  if (!body) return apiError(400, "请求体必须是合法 JSON 对象。");

  const errors: string[] = [];

  const date = asTrimmed(body.date);
  if (!date || !isValidCalendarDay(date)) {
    errors.push("date 必填，格式 YYYY-MM-DD。");
  }
  const requirementId = asTrimmed(body.requirementId);
  if (!requirementId) errors.push("requirementId 必填（业务编号，需唯一）。");

  const system = asTrimmed(body.system) || "WMS";
  if (!SYSTEMS.includes(system)) {
    errors.push(`system 须为以下之一：${SYSTEMS.join(" / ")}。`);
  }
  const currentNode = asTrimmed(body.currentNode) || "方案中";
  if (!NODES.includes(currentNode)) {
    errors.push(`currentNode 须为以下之一：${NODES.join(" / ")}。`);
  }

  const isUrgent = asBool(body.isUrgent);
  if (body.isUrgent !== undefined && isUrgent === undefined) {
    errors.push("isUrgent 须为布尔值。");
  }
  const isReleased = asBool(body.isReleased);
  if (body.isReleased !== undefined && isReleased === undefined) {
    errors.push("isReleased 须为布尔值。");
  }

  const releaseEnabled = isReleased ?? false;
  const releaseDate = asTrimmed(body.releaseDate);
  if (releaseEnabled) {
    if (!releaseDate || !isValidCalendarDay(releaseDate)) {
      errors.push("isReleased=true 时 releaseDate 必填，格式 YYYY-MM-DD。");
    }
  } else if (releaseDate !== undefined && releaseDate) {
    if (!isValidCalendarDay(releaseDate)) {
      errors.push("releaseDate 格式 YYYY-MM-DD。");
    }
  }

  const title = asTrimmed(body.title);
  const content = asTrimmed(body.content);
  const remark = asTrimmed(body.remark);
  const workOrderId = asTrimmed(body.workOrderId);

  if (errors.length) return apiError(400, "参数校验失败。", errors);

  // 可选来源工单：校验存在 & 尚未被占用（一对一）
  if (workOrderId) {
    const src = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
      include: { requirement: true },
    });
    if (!src) return apiError(400, "workOrderId 指向的工单不存在。");
    if (src.requirement) {
      return apiError(409, "该来源工单已关联需求（" + src.requirement.requirementId + "）。");
    }
  }

  const dateStr = date as string;
  const relEnabled = isReleased ?? false;
  const relDateStr = relEnabled ? (releaseDate as string) : undefined;
  const developmentDays = recomputeDevDays(dateStr, relEnabled, relDateStr);

  const data: Prisma.RequirementUncheckedCreateInput = {
    requirementId: requirementId as string,
    date: toDayUtc(dateStr) as Date,
    // 空串（含前端「清空」语义）统一落 null，避免库中出现空字符串
    ...(title ? { title } : {}),
    ...(content ? { content } : {}),
    system,
    currentNode,
    isUrgent: isUrgent ?? false,
    isReleased: relEnabled,
    ...(relEnabled ? { releaseDate: toDayUtc(relDateStr as string) as Date } : {}),
    developmentDays,
    ...(remark ? { remark } : {}),
    ...(workOrderId ? { workOrderId } : {}),
  };

  try {
    if (workOrderId) {
      // 事务：建需求 + 置父工单转需求标记并回写需求ID（两侧编号保持一致）
      const [req] = await prisma.$transaction([
        prisma.requirement.create({ data }),
        prisma.workOrder.update({
          where: { id: workOrderId },
          data: {
            isConvertToRequirement: true,
            requirementId: requirementId as string,
          },
        }),
      ]);
      return NextResponse.json(toRequirementJson(req), { status: 201 });
    }
    const req = await prisma.requirement.create({ data });
    return NextResponse.json(toRequirementJson(req), { status: 201 });
  } catch (err) {
    if (isPrismaUnique(err)) {
      return apiError(409, "需求ID 已被占用，请更换。");
    }
    throw err;
  }
}
