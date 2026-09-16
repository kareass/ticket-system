/**
 * 排序比较器断言脚本（本项目无单元测试框架，用这个替代）
 *
 *   npm run check:sort
 *
 * 纯函数断言：不连数据库、不发网络请求、不需要服务在运行。
 * 判定失败以非 0 退出。
 */
import { createComparator, type SortOrder } from "@/lib/sortRows";
import type { Requirement, WorkOrder } from "@/types";

let pass = 0;
let fail = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass += 1;
    console.log(`  [PASS] ${name}`);
  } else {
    fail += 1;
    console.error(`  [FAIL] ${name}\n         实际 ${a}\n         期望 ${e}`);
  }
}

/** 造一条需求，只覆盖排序用到的字段 */
function req(over: Partial<Requirement> & { id: string }): Requirement {
  return {
    requirementId: over.id,
    date: "2026-01-01",
    system: "WMS",
    currentNode: "方案中",
    isUrgent: false,
    isReleased: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  } as Requirement;
}

function wo(id: string, status: string): WorkOrder {
  return {
    id,
    status,
    date: "2026-01-01",
    title: id,
    content: "",
    system: "WMS",
    isConvertToRequirement: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as WorkOrder;
}

function ids<T extends { id: string }>(
  rows: T[],
  field: keyof T,
  order: SortOrder,
): string[] {
  return [...rows].sort(createComparator<T>(field, order)).map((r) => r.id);
}

console.log("=== 日期（YYYY-MM-DD 字典序即时间序）===");
const byDate = [
  req({ id: "b", date: "2026-03-05" }),
  req({ id: "a", date: "2026-01-20" }),
  req({ id: "c", date: "2026-12-01" }),
];
check("升序", ids(byDate, "date", "ascend"), ["a", "b", "c"]);
check("降序", ids(byDate, "date", "descend"), ["c", "b", "a"]);

console.log("=== 开发时长（空值恒排末尾）===");
const byDays = [
  req({ id: "n1", developmentDays: undefined }),
  req({ id: "d30", developmentDays: 30 }),
  req({ id: "d5", developmentDays: 5 }),
  req({ id: "n2", developmentDays: undefined }),
];
check("升序：空值在末尾", ids(byDays, "developmentDays", "ascend"), [
  "d5",
  "d30",
  "n1",
  "n2",
]);
check("降序：空值仍在末尾", ids(byDays, "developmentDays", "descend"), [
  "d30",
  "d5",
  "n1",
  "n2",
]);

console.log("=== 发版时间（未发版者此值为空，占多数）===");
const byRelease = [
  req({ id: "r2", releaseDate: "2026-06-01" }),
  req({ id: "none", releaseDate: undefined }),
  req({ id: "r1", releaseDate: "2026-02-01" }),
];
check("升序", ids(byRelease, "releaseDate", "ascend"), ["r1", "r2", "none"]);
check("降序", ids(byRelease, "releaseDate", "descend"), ["r2", "r1", "none"]);

console.log("=== 当前节点（按 NODE_OPTIONS 业务流程顺序）===");
const byNode = [
  req({ id: "已发布", currentNode: "已发布" }),
  req({ id: "方案中", currentNode: "方案中" }),
  req({ id: "已合并", currentNode: "已合并" }),
  req({ id: "测试完毕", currentNode: "测试完毕" }),
  req({ id: "开发中", currentNode: "开发中" }),
  req({ id: "测试中", currentNode: "测试中" }),
];
check("升序=流程推进方向", ids(byNode, "currentNode", "ascend"), [
  "方案中",
  "开发中",
  "测试中",
  "测试完毕",
  "已合并",
  "已发布",
]);
check("降序=流程倒序", ids(byNode, "currentNode", "descend"), [
  "已发布",
  "已合并",
  "测试完毕",
  "测试中",
  "开发中",
  "方案中",
]);

console.log("=== 系统（按 SYSTEM_OPTIONS 声明顺序）===");
const bySystem = [
  req({ id: "TMS", system: "TMS" }),
  req({ id: "WMS", system: "WMS" }),
  req({ id: "其他", system: "其他" }),
  req({ id: "ERP", system: "ERP" }),
];
check("升序=声明顺序", ids(bySystem, "system", "ascend"), [
  "WMS",
  "ERP",
  "TMS",
  "其他",
]);

console.log("=== 布尔字段 ===");
const byUrgent = [
  req({ id: "yes", isUrgent: true }),
  req({ id: "no1", isUrgent: false }),
  req({ id: "no2", isUrgent: false }),
];
check("是否加急 升序：否在前", ids(byUrgent, "isUrgent", "ascend"), [
  "no1",
  "no2",
  "yes",
]);
check("是否加急 降序：是在前", ids(byUrgent, "isUrgent", "descend"), [
  "yes",
  "no1",
  "no2",
]);

console.log("=== 工单状态（按 WORK_ORDER_STATUS_OPTIONS 声明顺序）===");
const byStatus = [
  wo("已关闭", "已关闭"),
  wo("新建", "新建"),
  wo("已处理", "已处理"),
];
check("升序", ids(byStatus, "status", "ascend"), ["新建", "已处理", "已关闭"]);
check("降序", ids(byStatus, "status", "descend"), ["已关闭", "已处理", "新建"]);

console.log("=== 历史脏数据（值不在枚举表内）===");
const dirty = [
  req({ id: "未知节点", currentNode: "未知节点" as never }),
  req({ id: "方案中", currentNode: "方案中" }),
];
check("不在表内的值排末尾", ids(dirty, "currentNode", "ascend"), [
  "方案中",
  "未知节点",
]);

console.log("=== 比较器不修改原数组 ===");
const untouched = [req({ id: "b" }), req({ id: "a" })];
const before = untouched.map((r) => r.id);
[...untouched].sort(createComparator<Requirement>("id", "ascend"));
check("原数组顺序不变", untouched.map((r) => r.id), before);

console.log("");
if (fail === 0) {
  console.log(`全部用例通过 ✅（${pass} 项）`);
} else {
  console.error(`${fail} 项失败 ❌（通过 ${pass} 项）`);
  process.exit(1);
}
