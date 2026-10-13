import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/db";
import {
  apiError,
  asTrimmed,
  isValidCalendarDay,
  readJson,
  REMINDEES,
  toDayUtc,
  toReminderJson,
} from "@/lib/server/helpers";

export const runtime = "nodejs";

/**
 * GET /api/reminders
 * 工作提醒列表。三个可选筛选参数（可叠加）：
 *   ?isDone=true|false   三态：不传 = 全部；非法值（如 abc）同样视作不过滤，不报错
 *   ?remindee=黄傲        精确匹配；**值不在 REMINDEE_OPTIONS 内时视作不过滤**
 *                         （与工单/需求的 ?submittedBy 同一口径，不要改成返回空数组）
 *   ?keyword=xxx         子串匹配「提醒内容」
 *
 * ⚠️ 排序：**按 date 升序，同日按 createdAt 升序** —— 这是全站唯一一个不按
 * createdAt 倒序的列表。提醒的价值在「接下来要做什么」，最早的日期排最前，
 * 已逾期 / 今日到期的自然浮到顶部。不要为了「保持一致」把它改成倒序。
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const isDoneRaw = url.searchParams.get("isDone");
  const remindee = url.searchParams.get("remindee")?.trim();
  const keyword = url.searchParams.get("keyword")?.trim();

  // 三态：只有字面量 "true" / "false" 才参与过滤，其余（不传、abc、空串）一律不过滤
  const isDone =
    isDoneRaw === "true" ? true : isDoneRaw === "false" ? false : undefined;

  const where: Prisma.ReminderWhereInput = {
    ...(isDone === undefined ? {} : { isDone }),
    ...(remindee && REMINDEES.includes(remindee) ? { remindee } : {}),
    ...(keyword ? { content: { contains: keyword } } : {}),
  };

  const rows = await prisma.reminder.findMany({
    where,
    // 同日必须给出第二排序键，否则 SQLite 不保证 tie 的稳定顺序（分页会抖）
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(rows.map(toReminderJson));
}

/**
 * POST /api/reminders
 * 新建工作提醒。body：date*（YYYY-MM-DD）/ remindee*（枚举内）/ content*（非空）。
 * 返回 201 + 创建结果；校验失败 400 + details。
 * 本表无唯一约束，因此**不会**出现 409。
 */
export async function POST(req: Request) {
  const body = await readJson(req);
  if (!body) return apiError(400, "请求体必须是合法 JSON 对象。");

  const errors: string[] = [];

  const date = asTrimmed(body.date);
  if (!date || !isValidCalendarDay(date)) {
    errors.push("date 必填，格式 YYYY-MM-DD。");
  }

  const remindee = asTrimmed(body.remindee);
  if (!remindee) {
    errors.push("remindee（提醒人）必填。");
  } else if (!REMINDEES.includes(remindee)) {
    errors.push(`remindee 须为 ${REMINDEES.join(" / ")} 之一。`);
  }

  const content = asTrimmed(body.content);
  if (!content) errors.push("content（提醒内容）必填。");

  if (errors.length) return apiError(400, "参数校验失败。", errors);

  const created = await prisma.reminder.create({
    data: {
      date: toDayUtc(date as string) as Date,
      remindee: remindee as string,
      content: content as string,
    },
  });
  return NextResponse.json(toReminderJson(created), { status: 201 });
}
