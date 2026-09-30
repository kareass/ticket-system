#!/usr/bin/env node
/**
 * 后端 API 自动化冒烟测试
 * 依赖一个已在 :3000 运行的 dev server（Next 首次命中的路由会现场编译，单请求放宽到 90s）。
 *
 * 运行： node scripts/api-smoke.mjs
 *       SMOKE_BASE=http://localhost:3000 node scripts/api-smoke.mjs
 *
 * 覆盖：工单 CRUD（含需求ID/需求内容 / 提交人） / 工单开启「是否转需求」自动同步建需求
 *       （需求ID必填 / 提交人继承自工单） / convert 入参带需求ID（列表弹框路径）与未传入参退回工单登记编号两条路径、
 *       改名同步、撞号409、已关联不可关闭 / 提交人继承与覆写 / 需求 CRUD（唯一409、发版联动、
 *       开发时长重算、来源工单链接 / 提交人） / 转需求 convert（按工单填写的需求ID / 提交人） /
 *       校验400 / 不存在404 / 有关联需求的工单删除保护409 / 删除需求复位来源工单标记 /
 *       关联需求删除后工单可删 / 枚举扩展（工单状态「处理中/待优化」、节点「退回」、提交人「黄傲/陈婷婷」）。
 * 本脚本自清理：运行结束后不残留任何测试数据。
 * 任一断言失败：打印 FAIL 并以非 0 退出。
 */

const BASE = process.env.SMOKE_BASE || "http://localhost:3000";
// 每次运行唯一后缀，避免与历史运行/并发冲突（业务编号唯一约束场景尤其关键）
const TAG = `s${process.pid}`;
const YEAR = new Date().getFullYear();
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
let woA, woB, woC, woD, woE, woF, woG, woHist,
  reqLink, reqConv, reqConvD, reqConvE, reqConvG, reqAuto, reqAutoF, reqStandalone, reqNoId;

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
    submittedBy: "黄傲",
  });
  ok(r.status === 201, "创建工单 → 201", `status=${r.status}`);
  woA = r.data && r.data.id;
  ok(!!woA, "工单返回 id", woA);
  ok(r.data.date === WO_DATE, "date 原样返回(YYYY-MM-DD)", r.data.date);
  ok(r.data.system === "WMS" && r.data.status === "新建", "默认 system=WMS/status=新建");
  ok(r.data.isConvertToRequirement === false, "默认 isConvertToRequirement=false");
  ok(r.data.submittedBy === "黄傲", "submittedBy 回读一致", String(r.data.submittedBy));
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
// 7a-1. 枚举兼容保险：传未变更的合法 system 仍可保存（回归）
{
  const cur = await req("GET", `/api/work-orders/${woA}`);
  const r = await req("PUT", `/api/work-orders/${woA}`, {
    system: cur.data.system,
    remark: "保险回归",
  });
  ok(r.status === 200, "传未变更的 system → 200（回归）", `status=${r.status}`);
}
// 7a-2. 枚举兼容保险：改成枚举外的新值仍 400
{
  const r = await req("PUT", `/api/work-orders/${woA}`, {
    system: "不存在的系统",
  });
  ok(r.status === 400, "改成枚举外的 system → 400", `status=${r.status}`);
}
// 7a-3. 枚举兼容保险：传未变更的合法 status 仍可保存（回归）
{
  const cur = await req("GET", `/api/work-orders/${woA}`);
  const r = await req("PUT", `/api/work-orders/${woA}`, {
    status: cur.data.status,
    remark: "保险回归2",
  });
  ok(r.status === 200, "传未变更的 status → 200（回归）", `status=${r.status}`);
}
// 7b. 回归：清空可选字段（备注）需真正下发（前端传空串 → 后端置空）
{
  await req("PUT", `/api/work-orders/${woA}`, { remark: "临时备注" });
  const r = await req("PUT", `/api/work-orders/${woA}`, { remark: "" });
  ok(r.status === 200 && r.data.remark === undefined, "备注清空下发生效（回归）", String(r.data.remark));
}
// 7c. 工单上的「需求ID / 需求内容」可写入并回读，可清空
{
  const r = await req("PUT", `/api/work-orders/${woA}`, {
    requirementId: `R-${YEAR}-tmp${TAG}`,
    requirementContent: "需求内容草稿",
  });
  ok(
    r.status === 200 && r.data.requirementId === `R-${YEAR}-tmp${TAG}`,
    "工单写入需求ID → 回读一致",
    String(r.data.requirementId),
  );
  ok(r.data.requirementContent === "需求内容草稿", "工单写入需求内容 → 回读一致");
  const cleared = await req("PUT", `/api/work-orders/${woA}`, { requirementId: "", requirementContent: "" });
  ok(
    cleared.data.requirementId === undefined && cleared.data.requirementContent === undefined,
    "工单需求ID/需求内容可清空（回归）",
    String(cleared.data.requirementId),
  );
}
// 7d. 开启「是否转需求」但缺需求ID → 400（需求ID必填，不填不能完成转需求）
{
  const r = await req("PUT", `/api/work-orders/${woA}`, { isConvertToRequirement: true });
  ok(r.status === 400, "开启转需求但缺需求ID → 400", `status=${r.status}`);
}
// 7e. 建单时即开启转需求但缺需求ID → 400
{
  const r = await req("POST", "/api/work-orders", {
    date: WO_DATE,
    title: `WO-D ${TAG}`,
    content: "冒烟：缺需求ID",
    isConvertToRequirement: true,
  });
  ok(r.status === 400, "建单即转需求但缺需求ID → 400", `status=${r.status}`);
}

console.log("== 需求 CRUD ==");
const RID_A = `R-${YEAR}-SM${TAG}`;
const RID_B = `R-${YEAR}-SM${TAG}b`;

// 8. 需求ID 选填：不带编号也能建（原为 400）
{
  const r = await req("POST", "/api/requirements", { date: WO_DATE, submittedBy: "黄傲" });
  ok(r.status === 201, "创建需求不带 requirementId → 201", `status=${r.status}`);
  ok(r.data.requirementId === undefined, "无编号需求回读 requirementId 为 undefined", String(r.data.requirementId));
  ok(r.data.submittedBy === "黄傲", "无编号需求 submittedBy 回读一致", String(r.data.submittedBy));
  reqNoId = r.data && r.data.id;
}
// 8b. 连续第二条无编号需求也能建 —— 锁住「唯一索引只允许一条空串」那个坑
{
  const r = await req("POST", "/api/requirements", { date: WO_DATE, submittedBy: "陈婷婷" });
  ok(r.status === 201, "第二条无编号需求同样 → 201（回归：空串未伪装成撞号）", `status=${r.status}`);
  ok(r.data.submittedBy === "陈婷婷", "第二条 submittedBy 回读一致", String(r.data.submittedBy));
  if (r.data && r.data.id) await req("DELETE", `/api/requirements/${r.data.id}`);
}
// 9. 正常创建 → 201 + 开发时长自算(>0)
{
  const r = await req("POST", "/api/requirements", {
    date: "2026-08-01",
    requirementId: RID_A,
    title: `REQ-A ${TAG}`,
    system: "WMS",
    currentNode: "测试中",
    isUrgent: true,
    submittedBy: "黄傲",
    developmentDays: 999, // 服务端应忽略重算
  });
  ok(r.status === 201, "创建需求 → 201", `status=${r.status}`);
  reqStandalone = r.data && r.data.id; // 供末尾清理，避免反复运行残留数据
  ok(r.data.requirementId === RID_A && r.data.date === "2026-08-01", "业务编号/日期正确");
  ok(r.data.currentNode === "测试中" && r.data.isUrgent === true, "节点/加急写入正确");
  ok(typeof r.data.developmentDays === "number" && r.data.developmentDays > 0, "developmentDays 服务端重算(>0)", String(r.data.developmentDays));
  ok(r.data.developmentDays !== 999, "忽略提交的 developmentDays");
  ok(r.data.submittedBy === "黄傲", "需求 submittedBy 回读一致", String(r.data.submittedBy));
}
// 9d. 清空需求编号 → 200，回读为 undefined
{
  const r = await req("PUT", `/api/requirements/${reqStandalone}`, { requirementId: "" });
  ok(r.status === 200, "清空 requirementId → 200", `status=${r.status}`);
  ok(r.data.requirementId === undefined, "清空后回读为 undefined", String(r.data.requirementId));
  // 复原，避免影响后续断言
  await req("PUT", `/api/requirements/${reqStandalone}`, { requirementId: RID_A });
}
// 9b. 枚举兼容保险：需求侧 system 传未变更值仍可保存（回归）
{
  const r = await req("PUT", `/api/requirements/${reqStandalone}`, {
    system: "WMS",
    remark: "保险回归3",
  });
  ok(r.status === 200, "需求传未变更的 system → 200（回归）", `status=${r.status}`);
}
// 9c. 枚举兼容保险：需求侧 system 改成枚举外的新值仍 400
{
  const r = await req("PUT", `/api/requirements/${reqStandalone}`, {
    system: "不存在的系统",
  });
  ok(r.status === 400, "需求改枚举外的 system → 400", `status=${r.status}`);
}
// 10. requirementId 撞号 → 409
{
  const r = await req("POST", "/api/requirements", { date: WO_DATE, requirementId: RID_A, submittedBy: "黄傲" });
  ok(r.status === 409, "重复 requirementId → 409", `status=${r.status}`);
}
// 11. 列表按 currentNode 过滤
{
  const r = await req("GET", `/api/requirements?currentNode=${encodeURIComponent("测试中")}`);
  ok(r.status === 200 && r.data.some((x) => x.requirementId === RID_A), "currentNode 过滤命中");
}

console.log("== 工单开启「是否转需求」自动同步 ==");
const RID_AUTO = `R-${YEAR}-AUTO${TAG}`;
// 12. 建一张工单（保存时即开启转需求 + 需求ID）→ 201 且自动建需求
{
  const r = await req("POST", "/api/work-orders", {
    date: WO_DATE,
    title: `WO-C ${TAG}`,
    content: "冒烟：保存即转需求",
    system: "ERP",
    isConvertToRequirement: true,
    requirementId: RID_AUTO,
    requirementContent: "由工单C同步的需求内容",
    submittedBy: "黄傲",
  });
  ok(r.status === 201, "建单即转需求（带需求ID）→ 201", `status=${r.status}`);
  woC = r.data && r.data.id;
  ok(r.data.requirementId === RID_AUTO, "工单回读需求ID 一致", String(r.data.requirementId));

  const list = await req("GET", `/api/requirements?keyword=${encodeURIComponent(RID_AUTO)}`);
  reqAuto = list.data && list.data[0] && list.data[0].id;
  ok(list.status === 200 && list.data.length === 1, "需求已自动同步创建（仅 1 条）", `count=${list.data && list.data.length}`);
  const auto = list.data[0] || {};
  ok(auto.title === `WO-C ${TAG}`, "需求标题同步自工单标题", String(auto.title));
  ok(auto.content === "由工单C同步的需求内容", "需求内容取自工单「需求内容」", String(auto.content));
  ok(auto.system === "ERP" && auto.currentNode === "方案中", "系统同步自工单 / 节点默认方案中");
  ok(auto.workOrderId === woC, "需求回指来源工单");
  ok(typeof auto.developmentDays === "number" && auto.developmentDays > 0, "自动生成需求的开发时长已算");
  ok(auto.submittedBy === "黄傲", "自动建需求 submittedBy 继承自工单", String(auto.submittedBy));
}
// 11b. 清空来源工单需求的编号 → 需求侧清空，工单侧编号保留
{
  await req("PUT", `/api/requirements/${reqAuto}`, { requirementId: "" });
  const r = await req("GET", `/api/work-orders/${woC}`);
  ok(r.data.requirementId === RID_AUTO, "清空需求编号后，来源工单上的编号保留", String(r.data.requirementId));
  const back = await req("PUT", `/api/requirements/${reqAuto}`, { requirementId: RID_AUTO });
  ok(back.status === 200, "复原需求编号 → 200", `status=${back.status}`);
}
// 12b. 建单即转需求但不填「需求内容」→ 需求内容为空（不回退成工单标题）
{
  const RID_AUTO_F = `R-${YEAR}-AUTOF${TAG}`;
  const r = await req("POST", "/api/work-orders", {
    date: WO_DATE,
    title: `WO-F ${TAG}`,
    content: "冒烟：不填需求内容",
    isConvertToRequirement: true,
    requirementId: RID_AUTO_F,
    submittedBy: "陈婷婷",
  });
  ok(r.status === 201, "建单即转需求（不给需求内容）→ 201", `status=${r.status}`);
  woF = r.data && r.data.id;
  const list = await req("GET", `/api/requirements?keyword=${encodeURIComponent(RID_AUTO_F)}`);
  reqAutoF = list.data[0] && list.data[0].id;
  const auto = list.data[0] || {};
  ok(
    auto.content == null,
    "需求内容留空即为空（不再回退成工单标题）",
    `content=${JSON.stringify(auto.content)}`,
  );
  ok(auto.title === `WO-F ${TAG}`, "标题仍同步自工单标题（不受内容为空影响）", String(auto.title));
  ok(auto.submittedBy === "陈婷婷", "自动建需求 submittedBy 继承自工单（陈婷婷）", String(auto.submittedBy));
}
// 13. 再次保存同一工单（需求ID 未变）→ 不重复创建需求
{
  const r = await req("PUT", `/api/work-orders/${woC}`, { remark: "二次保存" });
  ok(r.status === 200, "已转需求工单可正常更新其他字段", `status=${r.status}`);
  const list = await req("GET", `/api/requirements?keyword=${encodeURIComponent(RID_AUTO)}`);
  ok(list.data.length === 1, "重复保存不重复建需求", `count=${list.data.length}`);
}
// 14. 改工单上的需求ID → 关联需求同步改名
{
  const RID_RENAMED = `R-${YEAR}-RN${TAG}`;
  const r = await req("PUT", `/api/work-orders/${woC}`, { requirementId: RID_RENAMED });
  ok(r.status === 200 && r.data.requirementId === RID_RENAMED, "工单需求ID 改名 → 200");
  const oldOne = await req("GET", `/api/requirements/${reqAuto}`);
  ok(oldOne.data.requirementId === RID_RENAMED, "关联需求编号同步改名", String(oldOne.data.requirementId));
}
// 15. 需求ID 撞号（用已存在的 RID_A）→ 409
{
  const r = await req("PUT", `/api/work-orders/${woC}`, { requirementId: RID_A });
  ok(r.status === 409, "工单需求ID 撞号 → 409", `status=${r.status}`);
}
// 16. 已关联需求的工单不允许关闭「是否转需求」→ 400
{
  const r = await req("PUT", `/api/work-orders/${woC}`, { isConvertToRequirement: false });
  ok(r.status === 400, "已关联需求时关闭转需求 → 400", `status=${r.status}`);
}

console.log("== 需求链接来源工单 ==");
// 17. 创建时带 workOrderId（链接工单A）→ 事务置父标记 + 同步父工单需求ID
{
  const r = await req("POST", "/api/requirements", {
    date: WO_DATE,
    requirementId: RID_B,
    title: `REQ-LINK ${TAG}`,
    workOrderId: woA,
    submittedBy: "黄傲",
  });
  ok(r.status === 201 && r.data.workOrderId === woA, "带来源工单创建需求 → 201/链接正确", `status=${r.status}`);
  reqLink = r.data && r.data.id;
  const wo = await req("GET", `/api/work-orders/${woA}`);
  ok(wo.data.isConvertToRequirement === true, "来源工单 isConvertToRequirement 被置 true");
  ok(wo.data.requirementId === RID_B, "来源工单需求ID 同步为该需求编号", String(wo.data.requirementId));
}
// 18. 来源工单已被占用 → 409
{
  const r = await req("POST", "/api/requirements", {
    date: WO_DATE,
    requirementId: `R-${YEAR}-dup${TAG}`,
    workOrderId: woA,
    submittedBy: "黄傲",
  });
  ok(r.status === 409, "同一来源工单再挂需求 → 409", `status=${r.status}`);
}
// 19. 单查需求
{
  const r = await req("GET", `/api/requirements/${reqLink}`);
  ok(r.status === 200 && r.data.id === reqLink, "单查需求 → 200");
}
// 20. PUT：发版开启且未给发版时间 → 自动按今天；devDays 重算
{
  const r = await req("PUT", `/api/requirements/${reqLink}`, { isReleased: true });
  ok(r.status === 200, "开启发版 → 200", `status=${r.status}`);
  ok(isDateStr(r.data.releaseDate), "未给 releaseDate 时自动补今天", r.data.releaseDate);
  ok(typeof r.data.developmentDays === "number", "发版后开发时长已重算");
}
// 21. PUT：关闭发版 → releaseDate 清空
{
  const r = await req("PUT", `/api/requirements/${reqLink}`, { isReleased: false });
  ok(r.status === 200, "关闭发版 → 200");
  ok(r.data.releaseDate === undefined || r.data.releaseDate === null, "releaseDate 已清空", String(r.data.releaseDate));
}
// 21b. 回归：清空需求标题需真正下发
{
  await req("PUT", `/api/requirements/${reqLink}`, { title: "临时标题" });
  const r = await req("PUT", `/api/requirements/${reqLink}`, { title: "" });
  ok(r.status === 200 && r.data.title === undefined, "标题清空下发生效（回归）", String(r.data.title));
}

console.log("== 工单转需求 convert ==");
// 22. 缺需求ID → 400（不填不能完成转需求）：工单未登记 + 入参空格两种都拦
{
  const c = await req("POST", "/api/work-orders", {
    date: WO_DATE,
    title: `WO-D ${TAG}`,
    content: "冒烟：convert 前未填需求ID",
    submittedBy: "黄傲",
  });
  woD = c.data && c.data.id;

  const r1 = await req("POST", `/api/work-orders/${woD}/convert`, {});
  ok(r1.status === 400, "工单未登记需求ID 且入参未传 → 400", `status=${r1.status}`);

  const r2 = await req("POST", `/api/work-orders/${woD}/convert`, { requirementId: "   " });
  ok(r2.status === 400, "入参需求ID 为空白 → 400", `status=${r2.status}`);

  const after = await req("GET", `/api/work-orders/${woD}`);
  ok(after.data.requirementId == null, "被拒后不产生半成品（工单需求ID 仍为空）", String(after.data.requirementId));
  ok(after.data.isConvertToRequirement === false, "被拒后工单转需求标记仍为 false");
}
// 22b. 弹框路径：入参带需求ID（不带需求内容）→ 201，编号取入参并回写工单，内容为空
{
  const RID_MODAL = `R-${YEAR}-CV2${TAG}`;
  const r = await req("POST", `/api/work-orders/${woD}/convert`, {
    requirementId: RID_MODAL,
    submittedBy: "黄傲",
  });
  ok(r.status === 201, "convert 入参带需求ID → 201", `status=${r.status}`);
  reqConvD = r.data && r.data.requirement && r.data.requirement.id;
  ok(r.data.requirement.requirementId === RID_MODAL, "需求编号 = 入参需求ID", String(r.data.requirement.requirementId));
  ok(r.data.requirement.submittedBy === "黄傲", "需求 submittedBy = 入参 submittedBy", String(r.data.requirement.submittedBy));
  ok(r.data.workOrder.requirementId === RID_MODAL, "入参需求ID 回写到工单", String(r.data.workOrder.requirementId));
  ok(r.data.workOrder.isConvertToRequirement === true, "工单置转需求标记 true（入参路径）");
  ok(r.data.requirement.title === `WO-D ${TAG}`, "需求标题同步自工单标题（入参路径）");
  ok(r.data.requirement.workOrderId === woD, "需求回指来源工单（入参路径）");
  ok(
    r.data.requirement.content == null,
    "未传需求内容且工单无内容 → 需求内容为空（不回退标题）",
    `content=${JSON.stringify(r.data.requirement.content)}`,
  );
}
// 22c. 弹框路径：入参带需求内容 → 需求内容取入参，并回写工单
{
  const RID_MODAL_G = `R-${YEAR}-CV3${TAG}`;
  const CONTENT_G = "冒烟：弹框填写的需求内容";
  const c = await req("POST", "/api/work-orders", {
    date: WO_DATE,
    title: `WO-G ${TAG}`,
    content: "冒烟：弹框带内容",
    submittedBy: "陈婷婷",
  });
  woG = c.data && c.data.id;
  const r = await req("POST", `/api/work-orders/${woG}/convert`, {
    requirementId: RID_MODAL_G,
    requirementContent: CONTENT_G,
    submittedBy: "陈婷婷",
  });
  ok(r.status === 201, "convert 入参带需求内容 → 201", `status=${r.status}`);
  reqConvG = r.data.requirement.id;
  ok(r.data.requirement.content === CONTENT_G, "需求内容 = 入参需求内容", String(r.data.requirement.content));
  ok(r.data.requirement.submittedBy === "陈婷婷", "需求 submittedBy = 入参 submittedBy（陈婷婷）", String(r.data.requirement.submittedBy));
  ok(r.data.workOrder.requirementContent === CONTENT_G, "入参需求内容回写到工单", String(r.data.workOrder.requirementContent));
}
// 23. 兼容路径：入参未传时退回工单已登记的需求ID 与需求内容
{
  const RID_CONV = `R-${YEAR}-CV${TAG}`;
  const CONTENT_B = "冒烟：工单B 上登记的 需求内容";
  const c = await req("POST", "/api/work-orders", {
    date: WO_DATE,
    title: `WO-B ${TAG}`,
    content: "冒烟：工单B",
    submittedBy: "黄傲",
  });
  woB = c.data && c.data.id;
  const set = await req("PUT", `/api/work-orders/${woB}`, {
    requirementId: RID_CONV,
    requirementContent: CONTENT_B,
  });
  ok(set.status === 200 && set.data.requirementId === RID_CONV, "工单登记需求ID → 200");

  const r = await req("POST", `/api/work-orders/${woB}/convert`, {});
  ok(r.status === 201, "convert 未传入参 → 201", `status=${r.status}`);
  reqConv = r.data && r.data.requirement && r.data.requirement.id;
  ok(!!reqConv, "convert 返回新需求");
  ok(r.data.requirement.requirementId === RID_CONV, "需求编号 = 工单登记的需求ID", String(r.data.requirement.requirementId));
  ok(r.data.requirement.content === CONTENT_B, "需求内容 = 工单登记的需求内容", String(r.data.requirement.content));
  ok(r.data.requirement.title === `WO-B ${TAG}`, "需求标题同步自工单标题");
  ok(r.data.requirement.currentNode === "方案中", "转换需求节点默认 方案中");
  ok(r.data.requirement.workOrderId === woB, "需求回指来源工单");
  ok(r.data.requirement.submittedBy === "黄傲", "需求 submittedBy = 工单 submittedBy（未传时继承）", String(r.data.requirement.submittedBy));
  ok(r.data.workOrder.isConvertToRequirement === true, "工单置转需求标记 true");
}
// 24. 重复 convert → 409
{
  const r = await req("POST", `/api/work-orders/${woB}/convert`, {});
  ok(r.status === 409, "重复 convert → 409", `status=${r.status}`);
}
// 24b. 弹框填了已被占用的编号 → 409（且不产生需求、工单标记不动）
{
  const RID_CONV = `R-${YEAR}-CV${TAG}`;
  const c = await req("POST", "/api/work-orders", {
    date: WO_DATE,
    title: `WO-E ${TAG}`,
    content: "冒烟：convert 撞号",
    submittedBy: "黄傲",
  });
  woE = c.data && c.data.id;
  const r = await req("POST", `/api/work-orders/${woE}/convert`, { requirementId: RID_CONV });
  ok(r.status === 409, "入参需求ID 已被占用 → 409", `status=${r.status}`);
  const after = await req("GET", `/api/work-orders/${woE}`);
  ok(after.data.isConvertToRequirement === false, "撞号被拒后工单标记仍为 false");
}
// 24c. 弹框路径：入参需求内容为空串 → 显式清空（需求内容为 null，不回退标题）
{
  const RID_MODAL_E = `R-${YEAR}-CV4${TAG}`;
  const r = await req("POST", `/api/work-orders/${woE}/convert`, {
    requirementId: RID_MODAL_E,
    requirementContent: "",
    submittedBy: "黄傲",
  });
  ok(r.status === 201, "入参需求内容为空串 → 201（不可与原 409 混淆）", `status=${r.status}`);
  reqConvE = r.data.requirement.id;
  ok(
    r.data.requirement.content == null,
    "入参需求内容为空串 → 需求内容为空（不回退标题）",
    `content=${JSON.stringify(r.data.requirement.content)}`,
  );
  ok(r.data.requirement.submittedBy === "黄傲", "需求 submittedBy = 入参 submittedBy", String(r.data.requirement.submittedBy));
  ok(r.data.workOrder.requirementId === RID_MODAL_E, "清空场景下编号仍正确回写工单");
}
// 25. convert 不存在工单 → 404
{
  const r = await req("POST", `/api/work-orders/not-exist-id/convert`, {});
  ok(r.status === 404, "convert 不存在工单 → 404", `status=${r.status}`);
}

console.log("== 枚举扩展：工单状态 / 需求节点 / 提交人 ==");
// 33. 工单状态扩展：处理中
{
  const r = await req("POST", "/api/work-orders", {
    date: WO_DATE,
    title: `WO-STATUS-PROC ${TAG}`,
    content: "枚举扩展：处理中",
    status: "处理中",
    submittedBy: "黄傲",
  });
  ok(r.status === 201 && r.data.status === "处理中", "工单状态 处理中 → 201/回读", String(r.data.status));
  if (r.data && r.data.id) await req("DELETE", `/api/work-orders/${r.data.id}`);
}
// 34. 工单状态扩展：待优化
{
  const r = await req("POST", "/api/work-orders", {
    date: WO_DATE,
    title: `WO-STATUS-WAIT ${TAG}`,
    content: "枚举扩展：待优化",
    status: "待优化",
    submittedBy: "黄傲",
  });
  ok(r.status === 201 && r.data.status === "待优化", "工单状态 待优化 → 201/回读", String(r.data.status));
  if (r.data && r.data.id) await req("DELETE", `/api/work-orders/${r.data.id}`);
}
// 35. 需求节点扩展：退回
{
  const r = await req("POST", "/api/requirements", {
    date: WO_DATE,
    requirementId: `R-${YEAR}-NODE${TAG}`,
    title: "枚举扩展：退回",
    currentNode: "退回",
    submittedBy: "黄傲",
  });
  ok(r.status === 201 && r.data.currentNode === "退回", "需求节点 退回 → 201/回读", String(r.data.currentNode));
  if (r.data && r.data.id) await req("DELETE", `/api/requirements/${r.data.id}`);
}
// 36. 提交人必填：工单不带 submittedBy → 400
{
  const r = await req("POST", "/api/work-orders", {
    date: WO_DATE,
    title: `WO-NOSUB ${TAG}`,
    content: "提交人必填",
  });
  ok(r.status === 400, "工单不带 submittedBy → 400", `status=${r.status}`);
}
// 37. 提交人必填：需求不带 submittedBy → 400
{
  const r = await req("POST", "/api/requirements", {
    date: WO_DATE,
    requirementId: `R-${YEAR}-NOSUB${TAG}`,
    title: "提交人必填",
  });
  ok(r.status === 400, "需求不带 submittedBy → 400", `status=${r.status}`);
}
// 38. 提交人取值：陈婷婷
{
  const r = await req("POST", "/api/work-orders", {
    date: WO_DATE,
    title: `WO-SUB-CTT ${TAG}`,
    content: "提交人陈婷婷",
    submittedBy: "陈婷婷",
  });
  ok(r.status === 201 && r.data.submittedBy === "陈婷婷", "工单 submittedBy 陈婷婷 → 201/回读", String(r.data.submittedBy));
  if (r.data && r.data.id) await req("DELETE", `/api/work-orders/${r.data.id}`);
}
// 39. 提交人取值校验：枚举外 → 400
{
  const r = await req("POST", "/api/work-orders", {
    date: WO_DATE,
    title: `WO-SUB-X ${TAG}`,
    content: "提交人非法",
    submittedBy: "不存在",
  });
  ok(r.status === 400, "工单 submittedBy 枚举外 → 400", `status=${r.status}`);
}
// 40. 需求侧 提交人取值校验：枚举外 → 400
{
  const r = await req("POST", "/api/requirements", {
    date: WO_DATE,
    requirementId: `R-${YEAR}-SUBX${TAG}`,
    title: "需求提交人非法",
    submittedBy: "不存在",
  });
  ok(r.status === 400, "需求 submittedBy 枚举外 → 400", `status=${r.status}`);
}
// 41. PUT 提交人改名 → 200，回读一致
//    用一个全新的工单做测试 —— 不能复用 woA：#17 把 woA.isConvertToRequirement 置为 true，
//    此处清空 submittedBy 会触发 sync，sync 在 workOrder.submittedBy=null 时会 400 拒绝，
//    整个事务回滚，让 PUT 看起来"失败"。
let woSubMod;
{
  const c = await req("POST", "/api/work-orders", {
    date: WO_DATE,
    title: `WO-SUBMOD ${TAG}`,
    content: "提交人修改 / 清空 / 历史兼容",
    submittedBy: "黄傲",
  });
  woSubMod = c.data && c.data.id;
  ok(c.status === 201, "准备工单（提交人修改）→ 201", `status=${c.status}`);
  const r = await req("PUT", `/api/work-orders/${woSubMod}`, { submittedBy: "陈婷婷" });
  ok(r.status === 200 && r.data.submittedBy === "陈婷婷", "工单 PUT submittedBy 改名 → 200/回读", String(r.data.submittedBy));
}
// 42. PUT 提交人显式清空 → 200，回读 undefined
{
  const r = await req("PUT", `/api/work-orders/${woSubMod}`, { submittedBy: "" });
  ok(r.status === 200 && r.data.submittedBy === undefined, "工单 PUT submittedBy 清空 → 200/undefined", String(r.data.submittedBy));
}
// 43. 历史数据兼容：清空后 PUT 不带 submittedBy → 200，仍 undefined
{
  const r = await req("PUT", `/api/work-orders/${woSubMod}`, { remark: "不改提交人" });
  ok(r.status === 200 && r.data.submittedBy === undefined, "工单 PUT 未传 submittedBy → 200/保持 undefined", String(r.data.submittedBy));
  if (woSubMod) await req("DELETE", `/api/work-orders/${woSubMod}`);
}
// 44. convert 提交人继承：工单黄傲 + convert 入参不带 submittedBy → 需求继承
{
  // 先建一个工单 + 清空/不留转需求标记
  const c = await req("POST", "/api/work-orders", {
    date: WO_DATE,
    title: `WO-INH ${TAG}`,
    content: "convert 提交人继承",
    submittedBy: "黄傲",
  });
  const woInh = c.data && c.data.id;
  ok(c.status === 201, "准备工单（黄傲）→ 201", `status=${c.status}`);
  const r = await req("POST", `/api/work-orders/${woInh}/convert`, {
    requirementId: `R-${YEAR}-INH${TAG}`,
  });
  ok(r.status === 201 && r.data.requirement.submittedBy === "黄傲", "convert 提交人继承自工单（黄傲）→ 201/回读", String(r.data.requirement.submittedBy));
  if (r.data && r.data.requirement && r.data.requirement.id) await req("DELETE", `/api/requirements/${r.data.requirement.id}`);
  if (woInh) await req("DELETE", `/api/work-orders/${woInh}`);
}
// 45. convert 提交人覆写：入参 陈婷婷 → 需求 陈婷婷（覆盖工单的黄傲）
{
  const c = await req("POST", "/api/work-orders", {
    date: WO_DATE,
    title: `WO-OVR ${TAG}`,
    content: "convert 提交人覆写",
    submittedBy: "黄傲",
  });
  const woOvr = c.data && c.data.id;
  const r = await req("POST", `/api/work-orders/${woOvr}/convert`, {
    requirementId: `R-${YEAR}-OVR${TAG}`,
    submittedBy: "陈婷婷",
  });
  ok(r.status === 201 && r.data.requirement.submittedBy === "陈婷婷", "convert 入参 submittedBy 覆写工单 → 201/回读", String(r.data.requirement.submittedBy));
  if (r.data && r.data.requirement && r.data.requirement.id) await req("DELETE", `/api/requirements/${r.data.requirement.id}`);
  if (woOvr) await req("DELETE", `/api/work-orders/${woOvr}`);
}
// 46. convert 入参 submittedBy 非法 → 400
{
  const c = await req("POST", "/api/work-orders", {
    date: WO_DATE,
    title: `WO-INVX ${TAG}`,
    content: "convert 提交人非法",
    submittedBy: "黄傲",
  });
  const woInvx = c.data && c.data.id;
  const r = await req("POST", `/api/work-orders/${woInvx}/convert`, {
    requirementId: `R-${YEAR}-INVX${TAG}`,
    submittedBy: "不存在",
  });
  ok(r.status === 400, "convert 入参 submittedBy 枚举外 → 400", `status=${r.status}`);
  // 工单未转需求，应可直接删
  if (woInvx) await req("DELETE", `/api/work-orders/${woInvx}`);
}
// 47. 历史工单（无提交人）convert 入参也不带 submittedBy → 400
{
  // 模拟历史数据：建一个工单 → 显式清空提交人 → convert 时不传 submittedBy
  const c = await req("POST", "/api/work-orders", {
    date: WO_DATE,
    title: `WO-HIST ${TAG}`,
    content: "历史工单（无提交人）转需求",
    submittedBy: "黄傲",
  });
  const woHist = c.data && c.data.id;
  // 显式清空 submittedBy → 工单回到「历史状态」（DB 中为 NULL）
  const cleared = await req("PUT", `/api/work-orders/${woHist}`, { submittedBy: "" });
  ok(cleared.status === 200 && cleared.data.submittedBy === undefined, "工单清空 submittedBy 后 → undefined（模拟历史）", String(cleared.data.submittedBy));
  const r = await req("POST", `/api/work-orders/${woHist}/convert`, {
    requirementId: `R-${YEAR}-HIST${TAG}`,
  });
  ok(r.status === 400, "历史工单（无 submittedBy）convert 不传 submittedBy → 400", `status=${r.status}`);
  if (woHist) await req("DELETE", `/api/work-orders/${woHist}`);
}
// 48. 提交人筛选（GET）：工单 ?submittedBy=黄傲 命中新建的；不含其它值
{
  // 先建一个标记性的工单，便于断言至少命中 1 条
  const c = await req("POST", "/api/work-orders", {
    date: WO_DATE,
    title: `WO-FILTER-HAO ${TAG}`,
    content: "筛选：黄傲",
    submittedBy: "黄傲",
  });
  const woFilterHao = c.data && c.data.id;
  const r = await req("GET", `/api/work-orders?submittedBy=${encodeURIComponent("黄傲")}`);
  const list = Array.isArray(r.data) ? r.data : [];
  ok(r.status === 200 && list.length >= 1 && list.every((w) => w.submittedBy === "黄傲"), "工单 ?submittedBy=黄傲 → 全是黄傲", `count=${list.length}`);
  if (woFilterHao) await req("DELETE", `/api/work-orders/${woFilterHao}`);
}
// 49. 提交人筛选（GET）：工单 ?submittedBy=陈婷婷 命中新建的；不含 黄傲
{
  const c = await req("POST", "/api/work-orders", {
    date: WO_DATE,
    title: `WO-FILTER-CT ${TAG}`,
    content: "筛选：陈婷婷",
    submittedBy: "陈婷婷",
  });
  const woFilterCt = c.data && c.data.id;
  const r = await req("GET", `/api/work-orders?submittedBy=${encodeURIComponent("陈婷婷")}`);
  const list = Array.isArray(r.data) ? r.data : [];
  ok(r.status === 200 && list.length >= 1 && list.every((w) => w.submittedBy === "陈婷婷"), "工单 ?submittedBy=陈婷婷 → 全是陈婷婷", `count=${list.length}`);
  // 跨提交人隔离：陈婷婷筛选不应包含黄傲
  ok(!list.some((w) => w.submittedBy === "黄傲"), "工单 提交人筛选互斥：陈婷婷不含黄傲");
  if (woFilterCt) await req("DELETE", `/api/work-orders/${woFilterCt}`);
}
// 50. 提交人筛选（GET）：枚举外的值视作不过滤（不会 400）
{
  const r = await req("GET", `/api/work-orders?submittedBy=${encodeURIComponent("不存在")}`);
  ok(r.status === 200 && Array.isArray(r.data), "工单 submittedBy 枚举外 → 200/不过滤", `status=${r.status}`);
}
// 51. 提交人筛选（GET）：需求侧
{
  const c = await req("POST", "/api/requirements", {
    date: WO_DATE,
    requirementId: `R-${YEAR}-FLH${TAG}`,
    title: "筛选：黄傲",
    submittedBy: "黄傲",
  });
  const reqFilterHao = c.data && c.data.id;
  const r = await req("GET", `/api/requirements?submittedBy=${encodeURIComponent("黄傲")}`);
  const list = Array.isArray(r.data) ? r.data : [];
  ok(r.status === 200 && list.length >= 1 && list.every((w) => w.submittedBy === "黄傲"), "需求 ?submittedBy=黄傲 → 全是黄傲", `count=${list.length}`);
  if (reqFilterHao) await req("DELETE", `/api/requirements/${reqFilterHao}`);
}

console.log("== 删除与一致性 ==");
// 26. 有关联需求的工单B 删除被拒 → 409
{
  const r = await req("DELETE", `/api/work-orders/${woB}`);
  ok(r.status === 409, "有关联需求的工单删除 → 409", `status=${r.status}`);
}
// 27. 删除转换需求 → 204，来源工单B 标记复位且保留需求ID（可再次转需求）
{
  const r = await req("DELETE", `/api/requirements/${reqConv}`);
  ok(r.status === 204, "删除转换需求 → 204", `status=${r.status}`);
  const wo = await req("GET", `/api/work-orders/${woB}`);
  ok(wo.data.isConvertToRequirement === false, "来源工单转需求标记复位 false");
  ok(wo.data.requirementId === `R-${YEAR}-CV${TAG}`, "工单需求ID 保留（便于再次转需求）", String(wo.data.requirementId));
}
// 28. 删除工单B → 204，再查 → 404
{
  const r = await req("DELETE", `/api/work-orders/${woB}`);
  ok(r.status === 204, "无关联后删除工单B → 204", `status=${r.status}`);
  const g = await req("GET", `/api/work-orders/${woB}`);
  ok(g.status === 404, "删除后再查工单 → 404");
}
// 29. 删除链接需求 → 204，来源工单A 标记复位
{
  const r = await req("DELETE", `/api/requirements/${reqLink}`);
  ok(r.status === 204, "删除链接需求 → 204", `status=${r.status}`);
  const wo = await req("GET", `/api/work-orders/${woA}`);
  ok(wo.data.isConvertToRequirement === false, "来源工单A 标记复位 false");
}
// 30. 删除工单A → 204
{
  const r = await req("DELETE", `/api/work-orders/${woA}`);
  ok(r.status === 204, "删除工单A → 204", `status=${r.status}`);
}
// 31. 单查被删需求 → 404
{
  const r = await req("GET", `/api/requirements/${reqLink}`);
  ok(r.status === 404, "单查被删需求 → 404");
}
// 32. 清理：移除本次运行创建的全部数据（不残留）
{
  const r1 = await req("DELETE", `/api/requirements/${reqStandalone}`);
  ok(r1.status === 204, "清理独立需求 → 204（不留残留）", `status=${r1.status}`);
  const r1c = await req("DELETE", `/api/requirements/${reqNoId}`);
  ok(r1c.status === 204, "清理无编号需求 → 204（不留残留）", `status=${r1c.status}`);
  const r2 = await req("DELETE", `/api/requirements/${reqAuto}`);
  ok(r2.status === 204, "清理自动同步需求 → 204（不留残留）", `status=${r2.status}`);
  const r2b = await req("DELETE", `/api/requirements/${reqAutoF}`);
  ok(r2b.status === 204, "清理自动同步需求（无内容）→ 204", `status=${r2b.status}`);
  const r3 = await req("DELETE", `/api/work-orders/${woC}`);
  ok(r3.status === 204, "清理工单C → 204", `status=${r3.status}`);
  const r3b = await req("DELETE", `/api/work-orders/${woF}`);
  ok(r3b.status === 204, "清理工单F → 204", `status=${r3b.status}`);
  // 工单D/E/G 已按弹框路径转出需求，须先删需求再删工单
  const r4 = await req("DELETE", `/api/requirements/${reqConvD}`);
  ok(r4.status === 204, "清理弹框路径转出的需求 → 204", `status=${r4.status}`);
  const r5 = await req("DELETE", `/api/work-orders/${woD}`);
  ok(r5.status === 204, "清理工单D → 204", `status=${r5.status}`);
  const r6 = await req("DELETE", `/api/requirements/${reqConvE}`);
  ok(r6.status === 204, "清理工单E 转出的需求 → 204", `status=${r6.status}`);
  const r7 = await req("DELETE", `/api/work-orders/${woE}`);
  ok(r7.status === 204, "清理工单E → 204", `status=${r7.status}`);
  const r8 = await req("DELETE", `/api/requirements/${reqConvG}`);
  ok(r8.status === 204, "清理工单G 转出的需求 → 204", `status=${r8.status}`);
  const r9 = await req("DELETE", `/api/work-orders/${woG}`);
  ok(r9.status === 204, "清理工单G → 204", `status=${r9.status}`);
}

console.log(failures === 0 ? "\n全部用例通过 ✅" : `\n${failures} 项失败 ❌`);
process.exit(failures === 0 ? 0 : 1);