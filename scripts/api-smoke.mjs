#!/usr/bin/env node
/**
 * 环节4 后端 API 自动化冒烟测试
 * 依赖一个已在 :3000 运行的 dev server（Next 首次命中的路由会现场编译，单请求放宽到 90s）。
 *
 * 运行： node scripts/api-smoke.mjs
 *       SMOKE_BASE=http://localhost:3000 node scripts/api-smoke.mjs
 *
 * 覆盖：工单 CRUD / 需求 CRUD（含唯一冲突409、发版联动、开发时长重算、来源工单链接）/
 *       工单转需求 convert / 校验400 / 不存在404 / 有关联需求删除保护409 /
 *       删除需求复位来源工单标记 / 关联需求删除后工单可删。
 * 任一断言失败：打印 FAIL 并以非 0 退出。
 */

const BASE = process.env.SMOKE_BASE || "http://localhost:3000";
// 每次运行唯一后缀，避免与历史运行/并发冲突（业务编号唯一约束场景尤其关键）
const TAG = `s${process.pid}`;
let failures = 0;

function ok(cond, name, extra) {
  if (cond) {
    console.log(`  [PASS] ${name}`);
  } else {
    failures += 1;
    console.error(`  [FAIL] ${name}${extra ? " — " + extra : ""}`);
  }
}

async function req(method, path, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90_000);
  try {
    const res = await fetch(BASE + path, {
      method,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

const CAL = /^\d{4}-\d{2}-\d{2}$/;
const isDateStr = (v) => typeof v === "string" && CAL.test(v);

const WO_DATE = "2026-09-05";
const NO_DATE = (() => new Date().toISOString().slice(0, 10))();
let woA, woB, reqLink, reqConv, reqStandalone;

console.log("== 工单 CRUD ==");

// 1. 缺必填 → 400
{
  const r = await req("POST", "/api/work-orders", { title: "缺date" });
  ok(r.status === 400, "创建工单缺 date → 400", `status=${r.status}`);
}
// 2. 非法 system → 400
{
  const r = await req("POST", "/api/work-orders", {
    date: WO_DATE,
    title: "x",
    content: "y",
    system: "不存在的系统",
  });
  ok(r.status === 400, "创建工单非法 system → 400", `status=${r.status}`);
}
// 3. 正常创建 → 201，默认值回填
{
  const r = await req("POST", "/api/work-orders", {
    date: WO_DATE,
    title: `WO-A ${TAG}`,
    content: "冒烟：工单A",
  });
  ok(r.status === 201, "创建工单 → 201", `status=${r.status}`);
  woA = r.data && r.data.id;
  ok(!!woA, "工单返回 id", woA);
  ok(r.data.date === WO_DATE, "date 原样返回(YYYY-MM-DD)", r.data.date);
  ok(r.data.system === "WMS" && r.data.status === "新建", "默认 system=WMS/status=新建");
  ok(r.data.isConvertToRequirement === false, "默认 isConvertToRequirement=false");
  ok(isDateStr(r.data.createdAt.slice(0, 10)), "createdAt 为合法时间");
}
// 4. 列表按 keyword 命中
{
  const r = await req("GET", `/api/work-orders?keyword=${encodeURIComponent(`WO-A ${TAG}`)}`);
  ok(r.status === 200 && Array.isArray(r.data), "工单列表 → 200 数组");
  ok(r.data.some((w) => w.id === woA), "keyword 过滤可命中新建工单");
}
// 5. 单查 → 200
{
  const r = await req("GET", `/api/work-orders/${woA}`);
  ok(r.status === 200 && r.data.id === woA, "单查工单 → 200");
}
// 6. PUT 部分更新 → 200
{
  const r = await req("PUT", `/api/work-orders/${woA}`, { status: "已处理", title: `WO-A-upd ${TAG}` });
  ok(r.status === 200 && r.data.status === "已处理", "更新工单状态 → 200/已处理");
  ok(r.data.title.includes("upd"), "更新工单标题生效");
}
// 7. PUT 非法状态 → 400
{
  const r = await req("PUT", `/api/work-orders/${woA}`, { status: "乱写" });
  ok(r.status === 400, "更新非法状态 → 400", `status=${r.status}`);
}
// 7b. 回归：清空可选字段（备注）需真正下发（前端传空串 → 后端置空）
{
  await req("PUT", `/api/work-orders/${woA}`, { remark: "临时备注" });
  const r = await req("PUT", `/api/work-orders/${woA}`, { remark: "" });
  ok(r.status === 200 && r.data.remark === undefined, "备注清空下发生效（回归）", String(r.data.remark));
}
// 8. 第二张未转需求工单（供 convert 使用）
{
  const r = await req("POST", "/api/work-orders", {
    date: WO_DATE,
    title: `WO-B ${TAG}`,
    content: "冒烟：工单B",
  });
  ok(r.status === 201, "创建工单B → 201");
  woB = r.data && r.data.id;
}

console.log("== 需求 CRUD ==");
const RID_A = `R-${new Date().getFullYear()}-SM${TAG}`;
const RID_B = `R-${new Date().getFullYear()}-SM${TAG}b`;

// 9. 缺 requirementId → 400
{
  const r = await req("POST", "/api/requirements", { date: WO_DATE });
  ok(r.status === 400, "创建需求缺 requirementId → 400", `status=${r.status}`);
}
// 10. 正常创建 → 201 + 开发时长自算(>0)
{
  const r = await req("POST", "/api/requirements", {
    date: "2026-08-01",
    requirementId: RID_A,
    title: `REQ-A ${TAG}`,
    system: "WMS",
    currentNode: "测试中",
    isUrgent: true,
    developmentDays: 999, // 服务端应忽略重算
  });
  ok(r.status === 201, "创建需求 → 201", `status=${r.status}`);
  reqStandalone = r.data && r.data.id; // 供末尾清理，避免反复运行残留数据
  ok(r.data.requirementId === RID_A && r.data.date === "2026-08-01", "业务编号/日期正确");
  ok(r.data.currentNode === "测试中" && r.data.isUrgent === true, "节点/加急写入正确");
  ok(typeof r.data.developmentDays === "number" && r.data.developmentDays > 0, "developmentDays 服务端重算(>0)", String(r.data.developmentDays));
  ok(r.data.developmentDays !== 999, "忽略提交的 developmentDays");
}
// 11. requirementId 撞号 → 409
{
  const r = await req("POST", "/api/requirements", { date: WO_DATE, requirementId: RID_A });
  ok(r.status === 409, "重复 requirementId → 409", `status=${r.status}`);
}
// 12. 列表按 currentNode 过滤
{
  const r = await req("GET", `/api/requirements?currentNode=${encodeURIComponent("测试中")}`);
  ok(r.status === 200 && r.data.some((x) => x.requirementId === RID_A), "currentNode 过滤命中");
}
// 13. 创建时带 workOrderId（链接工单A）→ 事务置父标记
{
  const r = await req("POST", "/api/requirements", {
    date: WO_DATE,
    requirementId: RID_B,
    title: `REQ-LINK ${TAG}`,
    workOrderId: woA,
  });
  ok(r.status === 201 && r.data.workOrderId === woA, "带来源工单创建需求 → 201/链接正确", `status=${r.status}`);
  reqLink = r.data && r.data.id;
  const wo = await req("GET", `/api/work-orders/${woA}`);
  ok(wo.data.isConvertToRequirement === true, "来源工单 isConvertToRequirement 被置 true");
}
// 14. 来源工单已被占用 → 409
{
  const r = await req("POST", "/api/requirements", {
    date: WO_DATE,
    requirementId: `R-${new Date().getFullYear()}-dup${TAG}`,
    workOrderId: woA,
  });
  ok(r.status === 409, "同一来源工单再挂需求 → 409", `status=${r.status}`);
}
// 15. 单查需求
{
  const r = await req("GET", `/api/requirements/${reqLink}`);
  ok(r.status === 200 && r.data.id === reqLink, "单查需求 → 200");
}
// 16. PUT：发版开启且未给发版时间 → 自动按今天；devDays 重算
{
  const r = await req("PUT", `/api/requirements/${reqLink}`, { isReleased: true });
  ok(r.status === 200, "开启发版 → 200", `status=${r.status}`);
  ok(isDateStr(r.data.releaseDate), "未给 releaseDate 时自动补今天", r.data.releaseDate);
  ok(typeof r.data.developmentDays === "number", "发版后开发时长已重算");
}
// 17. PUT：关闭发版 → releaseDate 清空
{
  const r = await req("PUT", `/api/requirements/${reqLink}`, { isReleased: false });
  ok(r.status === 200, "关闭发版 → 200");
  ok(r.data.releaseDate === undefined || r.data.releaseDate === null, "releaseDate 已清空", String(r.data.releaseDate));
}

// 17b. 回归：清空需求标题需真正下发
{
  await req("PUT", `/api/requirements/${reqLink}`, { title: "临时标题" });
  const r = await req("PUT", `/api/requirements/${reqLink}`, { title: "" });
  ok(r.status === 200 && r.data.title === undefined, "标题清空下发生效（回归）", String(r.data.title));
}

console.log("== 工单转需求 convert ==");
// 18. convert 工单B → 201，自动编号+拷贝+开发时长
{
  const r = await req("POST", `/api/work-orders/${woB}/convert`, {});
  ok(r.status === 201, "convert → 201", `status=${r.status}`);
  reqConv = r.data && r.data.requirement && r.data.requirement.id;
  ok(!!reqConv, "convert 返回新需求");
  ok(/^R-\d{4}-\d{3,}$/.test(r.data.requirement.requirementId), "自动业务编号格式 R-年-序号", r.data.requirement.requirementId);
  ok(r.data.requirement.title === `WO-B ${TAG}`, "需求标题同步自工单标题");
  ok(r.data.requirement.currentNode === "方案中", "转换需求节点默认 方案中");
  ok(r.data.requirement.workOrderId === woB, "需求回指来源工单");
  ok(r.data.workOrder.isConvertToRequirement === true, "工单置转需求标记 true");
}
// 19. 重复 convert → 409
{
  const r = await req("POST", `/api/work-orders/${woB}/convert`, {});
  ok(r.status === 409, "重复 convert → 409", `status=${r.status}`);
}
// 20. convert 不存在工单 → 404
{
  const r = await req("POST", "/api/work-orders/not-exist-id/convert", {});
  ok(r.status === 404, "convert 不存在工单 → 404", `status=${r.status}`);
}

console.log("== 删除与一致性 ==");
// 21. 有关联需求的工单B 删除被拒 → 409
{
  const r = await req("DELETE", `/api/work-orders/${woB}`);
  ok(r.status === 409, "有关联需求的工单删除 → 409", `status=${r.status}`);
}
// 22. 删除转换需求 → 204，来源工单B 标记复位
{
  const r = await req("DELETE", `/api/requirements/${reqConv}`);
  ok(r.status === 204, "删除转换需求 → 204", `status=${r.status}`);
  const wo = await req("GET", `/api/work-orders/${woB}`);
  ok(wo.data.isConvertToRequirement === false, "来源工单转需求标记复位 false");
}
// 23. 删除工单B → 204，再查 → 404
{
  const r = await req("DELETE", `/api/work-orders/${woB}`);
  ok(r.status === 204, "无关联后删除工单B → 204", `status=${r.status}`);
  const g = await req("GET", `/api/work-orders/${woB}`);
  ok(g.status === 404, "删除后再查工单 → 404");
}
// 24. 删除链接需求 → 204，来源工单A 标记复位
{
  const r = await req("DELETE", `/api/requirements/${reqLink}`);
  ok(r.status === 204, "删除链接需求 → 204", `status=${r.status}`);
  const wo = await req("GET", `/api/work-orders/${woA}`);
  ok(wo.data.isConvertToRequirement === false, "来源工单A 标记复位 false");
}
// 25. 删除工单A → 204
{
  const r = await req("DELETE", `/api/work-orders/${woA}`);
  ok(r.status === 204, "删除工单A → 204", `status=${r.status}`);
}
// 26. 单查被删需求 → 404
{
  const r = await req("GET", `/api/requirements/${reqLink}`);
  ok(r.status === 404, "单查被删需求 → 404");
}
// 27. 清理：删除用例10 创建的无来源需求（本脚本不留下任何残留数据）
{
  const r = await req("DELETE", `/api/requirements/${reqStandalone}`);
  ok(r.status === 204, "清理独立需求 → 204（不留残留）", `status=${r.status}`);
}

console.log(failures === 0 ? "\n全部用例通过 ✅" : `\n${failures} 项失败 ❌`);
process.exit(failures === 0 ? 0 : 1);
