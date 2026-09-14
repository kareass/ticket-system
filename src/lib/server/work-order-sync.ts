import type { Prisma, Requirement as DbRequirement, WorkOrder as DbWorkOrder } from "@prisma/client";
import { isPrismaUnique, recomputeDevDays } from "@/lib/server/helpers";

/**
 * 工单 → 需求的自动同步（一对一），对应设计方案「工单表」：
 *   是否转需求[若为是，自动同步到需求表，日期与标题取工单表标题（需求ID必填）]
 *
 * 规则：
 * - 需求ID 取工单上填写的 `requirementId`，必填；为空 → 400（不填不能完成转需求）。
 * - 新建需求：日期取工单日期、标题取工单标题、内容取工单「需求内容」、
 *   系统取工单系统、节点默认「方案中」、开发时长按 日期→今天 重算、workOrderId 回指工单。
 * - 需求内容**不做兜底**：工单上没填就落空（null），不再回退成工单标题。
 * - 已关联需求：仅当工单上的需求ID 被改动时同步改名（撞号 → 409），不重复创建。
 * - 需求ID 被其它需求占用 → 409（提示更换）。
 *
 * 本函数不做事务提交，必须在调用方的事务内执行（tx），失败即整体回滚。
 */
export type SyncResult =
  | { ok: true; requirement: DbRequirement }
  | { ok: false; status: number; error: string };

export async function syncRequirementForWorkOrder(
  wo: DbWorkOrder,
  tx: Prisma.TransactionClient,
): Promise<SyncResult> {
  const targetId = (wo.requirementId ?? "").trim();
  if (!targetId) {
    return {
      ok: false,
      status: 400,
      error: "「是否转需求」为是时，需求ID 必填（请先填写需求ID 再转需求）。",
    };
  }

  const linked = await tx.requirement.findUnique({
    where: { workOrderId: wo.id },
  });

  // 已关联：需求ID 未变则无需动作；变了则同步改名（保持工单与需求编号一致）
  if (linked) {
    if (linked.requirementId === targetId) {
      return { ok: true, requirement: linked };
    }
    try {
      const renamed = await tx.requirement.update({
        where: { id: linked.id },
        data: { requirementId: targetId },
      });
      return { ok: true, requirement: renamed };
    } catch (err) {
      if (isPrismaUnique(err)) {
        return {
          ok: false,
          status: 409,
          error: `需求ID「${targetId}」已被占用，请更换。`,
        };
      }
      throw err;
    }
  }

  const dateStr = wo.date.toISOString().slice(0, 10);
  // 需求内容：工单上填了什么就是什么，为空即落空（不做「取标题」兜底）
  const content = (wo.requirementContent ?? "").trim();
  try {
    const created = await tx.requirement.create({
      data: {
        requirementId: targetId,
        date: wo.date, // 日期取工单日期
        title: wo.title, // 标题取工单标题
        ...(content ? { content } : {}), // 需求内容；空 → 不写该列（落 null）
        system: wo.system,
        currentNode: "方案中",
        isUrgent: false,
        isReleased: false,
        developmentDays: recomputeDevDays(dateStr, false, undefined),
        workOrderId: wo.id,
        remark: `由工单「${wo.title || wo.id}」自动转化。`,
      },
    });
    return { ok: true, requirement: created };
  } catch (err) {
    if (isPrismaUnique(err)) {
      return {
        ok: false,
        status: 409,
        error: `需求ID「${targetId}」已被占用，请更换。`,
      };
    }
    throw err;
  }
}
