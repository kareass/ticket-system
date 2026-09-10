import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/db";
import {
  ApiFailure,
  apiError,
  readJson,
  toRequirementJson,
  toWorkOrderJson,
} from "@/lib/server/helpers";
import { syncRequirementForWorkOrder } from "@/lib/server/work-order-sync";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

/**
 * POST /api/work-orders/:id/convert
 * 工单转需求（一对一）。
 * - 工单不存在 → 404；已转需求（isConvertToRequirement 或已存在关联需求）→ 409；
 * - 工单未填写「需求ID」→ 400（需求ID 必填，不填不能完成转需求）；
 * - 需求ID 已被其它需求占用 → 409。
 * - 事务内：按工单的 requirementId 创建需求（日期取工单日期、标题取工单标题、
 *   内容取工单「需求内容」留空则取标题、系统取工单系统、节点默认「方案中」、
 *   开发时长按 日期→今天 重算、workOrderId 回指该工单），并置工单 isConvertToRequirement=true。
 * - 返回 201 { requirement, workOrder }。
 */
export async function POST(_req: Request, { params }: Ctx) {
  // body 允许为空对象（无需入参；保留 JSON 解析以兼容 {} / 空 body）
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
  if (!(wo.requirementId ?? "").trim()) {
    return apiError(
      400,
      "该工单尚未填写「需求ID」，请先编辑工单填写需求ID 后再转需求。",
    );
  }

  try {
    const [requirement, workOrder] = await prisma.$transaction(async (tx) => {
      const sync = await syncRequirementForWorkOrder(wo, tx);
      if (!sync.ok) throw new ApiFailure(sync.status, sync.error);
      const updated = await tx.workOrder.update({
        where: { id: wo.id },
        data: { isConvertToRequirement: true },
      });
      return [sync.requirement, updated] as const;
    });

    return NextResponse.json(
      {
        requirement: toRequirementJson(requirement),
        workOrder: toWorkOrderJson(workOrder),
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof ApiFailure) return apiError(err.status, err.message, err.details);
    throw err;
  }
}
