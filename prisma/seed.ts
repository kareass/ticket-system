import { PrismaClient } from "@prisma/client";

/**
 * 开发/演示种子数据（环节5 起 UI 走真实 API，需要初始数据可看）
 * 运行：npm run db:seed   （prisma migrate reset 也会自动调用）
 *
 * 注意：本脚本会**清空** WorkOrder / Requirement 后重新写入演示数据，
 * 仅供开发与演示环境使用，请勿在生产库执行。
 */
const prisma = new PrismaClient();

/** 日历日 → 该日 UTC 零点（与 API 入库口径一致，避免时区偏天） */
const day = (s: string) => new Date(`${s}T00:00:00.000Z`);

async function main() {
  // 先删需求再删工单（外键方向：Requirement.workOrderId → WorkOrder.id）
  await prisma.requirement.deleteMany({});
  await prisma.workOrder.deleteMany({});

  // ---- 工单 ----
  const wo1 = await prisma.workOrder.create({
    data: {
      date: day("2026-09-01"),
      title: "WMS 出库单打印优化",
      content: "出库单打印模板需要支持自定义纸张大小，并增加批次号字段展示。",
      system: "WMS",
      isConvertToRequirement: true,
      remark: "业务提出，已确认转为需求跟进。",
      status: "新建",
    },
  });
  const wo2 = await prisma.workOrder.create({
    data: {
      date: day("2026-09-03"),
      title: "OMS 订单同步异常排查",
      content: "部分订单在 OMS 与 ERP 之间同步状态不一致，需排查数据链路。",
      system: "OMS",
      isConvertToRequirement: false,
      remark: "",
      status: "新建",
    },
  });
  const wo3 = await prisma.workOrder.create({
    data: {
      date: day("2026-09-05"),
      title: "TMS 在途节点提醒功能咨询",
      content: "运单在途节点是否需要短信提醒，先与承运方确认需求范围。",
      system: "TMS",
      isConvertToRequirement: false,
      remark: "待确认，暂不处理。",
      status: "新建",
    },
  });

  // ---- 需求 ----
  await prisma.requirement.create({
    data: {
      requirementId: "R-2026-001",
      date: day("2026-09-01"),
      title: "WMS 出库单打印优化",
      content: "出库单打印模板支持自定义纸张大小，增加批次号展示。",
      system: "WMS",
      developmentDays: 3,
      currentNode: "测试中",
      isUrgent: true,
      isReleased: false,
      remark: "由工单转化。",
      workOrderId: wo1.id, // 一对一：来源工单
    },
  });
  await prisma.requirement.create({
    data: {
      requirementId: "R-2026-002",
      date: day("2026-08-20"),
      title: "ERP 库存月报导出增强",
      content: "库存月报支持按仓库维度多选导出 Excel。",
      system: "ERP",
      developmentDays: 8,
      currentNode: "已合并",
      isUrgent: false,
      isReleased: true,
      releaseDate: day("2026-08-28"),
      remark: "已随 8 月底发版。",
    },
  });
  await prisma.requirement.create({
    data: {
      requirementId: "R-2026-003",
      date: day("2026-09-08"),
      title: "WMS 盘点差异分析看板",
      content: "针对盘点差异数据提供可视化分析看板。",
      system: "WMS",
      developmentDays: 1,
      currentNode: "方案中",
      isUrgent: false,
      isReleased: false,
      remark: "",
    },
  });

  const [woCount, reqCount] = await Promise.all([
    prisma.workOrder.count(),
    prisma.requirement.count(),
  ]);
  console.log(
    `种子数据写入完成：工单 ${woCount} 条（含 1 条已转需求）、需求 ${reqCount} 条。`,
  );
  // 关联检查（wo1 应已标记转需求）
  console.log(`样例工单 ${wo2.id.slice(-8)} / ${wo3.id.slice(-8)} 未转需求。`);
}

main()
  .catch((e) => {
    console.error("种子数据写入失败：", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
