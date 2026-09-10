import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/db";
import {
  ApiFailure,
  apiError,
  asTrimmed,
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
 * body（可空）：
 *   { "requirementId": "R-2026-006" }  指定本次转出的需求ID（列表「转需求」弹框即走此入参）；
 *   不传或传空串时退回工单上已登记的需求ID（兼容先登记编号再转的用法）。
 * - 工单不存在 → 404；已转需求（isConvertToRequirement 或已存在关联需求）→ 409；
 * - 最终需求ID 为空 → 400（需求ID 必填，不填不能完成转需求）；
 * - 需求ID 已被其它需求占用 → 409。
 * - 事务内：显式传入的 requirementId 先落回工单（保持工单与需求两侧编号一致），
 *   再据此创建需求（日期取工单日期、标题取工单标题、内容取工单「需求内容」留空则取标题、
 *   系统取工单系统、节点默认「方案中」、开发时长按 日期→今天 重算、workOrderId 回指该工单），
 *   最后置工单 isConvertToRequirement=true。
 * - 返回 201 { requirement, workOrder }。
 */
export async function POST(req: Request, { params }: Ctx) {
  // body 允许为空（{} 或空 body）；非 JSON 时按「未传」处理
  const body = (await readJson(req).catch(() => null)) ?? {};
  const bodyId = asTrimmed(body.requirementId);

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

  // 弹框传入的编号优先；未传时用工单上已登记的编号
  const targetId = bodyId ?? (wo.requirementId ?? "").trim();
  if (!targetId) {
    return apiError(400, "请填写「需求ID」后再转需求（需求ID 必填）。");
  }

  try {
    const [requirement, workOrder] = await prisma.$transaction(async (tx) => {
      // 显式传入的编号先写回工单，再走统一同步逻辑（两条路径共用同一段规则）
      if (bodyId && bodyId !== wo.requirementId) {
        await tx.workOrder.update({
          where: { id: wo.id },
          data: { requirementId: bodyId },
        });
      }
      const sync = await syncRequirementForWorkOrder(
        { ...wo, requirementId: targetId },
        tx,
      );
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
