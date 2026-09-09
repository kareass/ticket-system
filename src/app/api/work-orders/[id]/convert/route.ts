import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/db";
import {
  apiError,
  isPrismaUnique,
  readJson,
  recomputeDevDays,
  toRequirementJson,
  toWorkOrderJson,
} from "@/lib/server/helpers";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

/** 需求业务编号自增序列：R-{年}-{序号}（序号 3 位补零） */
async function nextRequirementId(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `R-${year}-`;
  const existing = await prisma.requirement.findMany({
    where: { requirementId: { startsWith: prefix } },
    select: { requirementId: true },
  });
  const used = new Set(existing.map((r) => r.requirementId));
  let seq = existing.length + 1;
  let code = "";
  for (let i = 0; i < 1000; i++) {
    code = `${prefix}${String(seq).padStart(3, "0")}`;
    if (!used.has(code)) break;
    seq += 1;
  }
  return code;
}

/**
 * POST /api/work-orders/:id/convert
 * 工单转需求（环节4.3 同步逻辑，一对一）。
 * - 工单不存在 → 404；已转需求（isConvertToRequirement 或已存在关联需求）→ 409。
 * - 事务内：创建 Requirement（自动拷贝 date / title / content / system，
 *   自动生成业务编号 R-{年}-{序号}，currentNode=「方案中」，
 *   developmentDays 按 date→今天 重算，workOrderId 指向该工单）
 *   并置该工单 isConvertToRequirement=true。
 * - 返回 201 { requirement, workOrder }。
 */
export async function POST(_req: Request, { params }: Ctx) {
  // body 允许为空对象（无需入参；保留 JSON 解析兼容：可传 {} 或空）
  await readJson(_req).catch(() => null);

  const wo = await prisma.workOrder.findUnique({
    where: { id: params.id },
    include: { requirement: true },
  });
  if (!wo) return apiError(404, "工单不存在。");
  if (wo.isConvertToRequirement || wo.requirement) {
    const linked = wo.requirement?.requirementId;
    return apiError(
      409,
      linked ? `该工单已转为需求 ${linked}。` : "该工单已标记为转需求。",
    );
  }

  const requirementId = await nextRequirementId();
  const dateStr = wo.date.toISOString().slice(0, 10);

  const createData: Prisma.RequirementUncheckedCreateInput = {
    requirementId,
    date: wo.date,
    title: wo.title,
    content: wo.content,
    system: wo.system,
    currentNode: "方案中",
    isUrgent: false,
    isReleased: false,
    developmentDays: recomputeDevDays(dateStr, false, undefined),
    workOrderId: wo.id,
    remark: `由工单 ${wo.title || wo.id} 自动转化。`,
  };

  try {
    const [requirement] = await prisma.$transaction([
      prisma.requirement.create({ data: createData }),
      prisma.workOrder.update({
        where: { id: wo.id },
        data: { isConvertToRequirement: true },
      }),
    ]);
    const workOrder = await prisma.workOrder.findUniqueOrThrow({
      where: { id: wo.id },
    });
    return NextResponse.json(
      {
        requirement: toRequirementJson(requirement),
        workOrder: toWorkOrderJson(workOrder),
      },
      { status: 201 },
    );
  } catch (err) {
    // workOrderId/requirementId 并发唯一冲突 → 已转换
    if (isPrismaUnique(err)) {
      return apiError(409, "该工单已转需求，请勿重复操作。");
    }
    throw err;
  }
}
