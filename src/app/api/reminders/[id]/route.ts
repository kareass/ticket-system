import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/db";
import {
  apiError,
  asBool,
  asTrimmed,
  isValidCalendarDay,
  readJson,
  REMINDEES,
  toDayUtc,
  toReminderJson,
} from "@/lib/server/helpers";

export const runtime = "nodejs";

// Next 14 的 params 是**同步对象**，不要 await
interface Ctx {
  params: { id: string };
}

/** GET /api/reminders/{id} —— 单条 */
export async function GET(_req: Request, { params }: Ctx) {
  const row = await prisma.reminder.findUnique({ where: { id: params.id } });
  if (!row) return apiError(404, "工作提醒不存在。");
  return NextResponse.json(toReminderJson(row));
}

/**
 * PUT /api/reminders/{id}
 * 局部更新。**必填字段不适用三态语义** —— 项目里「未传 = 不改 / 空串 = 清空 /
 * 非空 = 设为该值」那套只对**可选**字段成立（WorkOrder.remark、Meeting.recorder 等）。
 * remindee / content 是必填，空串只能是误操作或前端 bug，一律 400 打回。
 *
 * 列表页勾选「已完成」走的就是这个接口，且**只传 isDone** —— 这是全站唯一一处
 * 不经草稿门的写入（理由见设计文档 1.1：布尔开关没有中间态）。
 */
export async function PUT(req: Request, { params }: Ctx) {
  const body = await readJson(req);
  if (!body) return apiError(400, "请求体必须是合法 JSON 对象。");

  const existing = await prisma.reminder.findUnique({ where: { id: params.id } });
  if (!existing) return apiError(404, "工作提醒不存在。");

  const errors: string[] = [];
  const data: Prisma.ReminderUpdateInput = {};

  if (body.date !== undefined) {
    const date = asTrimmed(body.date);
    if (!date || !isValidCalendarDay(date)) {
      errors.push("date 格式须为 YYYY-MM-DD。");
    } else {
      data.date = toDayUtc(date) as Date;
    }
  }

  if (body.remindee !== undefined) {
    const remindee = asTrimmed(body.remindee);
    if (!remindee) {
      errors.push("remindee（提醒人）不能为空。");
    } else if (!REMINDEES.includes(remindee)) {
      errors.push(`remindee 须为 ${REMINDEES.join(" / ")} 之一。`);
    } else {
      data.remindee = remindee;
    }
  }

  if (body.content !== undefined) {
    const content = asTrimmed(body.content);
    if (!content) errors.push("content（提醒内容）不能为空。");
    else data.content = content;
  }

  // isDone：**false 是有效值，不是「不改」** —— 必须显式判 undefined，不能用 || 或 ??
  if (body.isDone !== undefined) {
    const isDone = asBool(body.isDone);
    if (isDone === undefined) errors.push("isDone 须为布尔值。");
    else data.isDone = isDone;
  }

  if (errors.length) return apiError(400, "参数校验失败。", errors);
  if (Object.keys(data).length === 0) {
    return apiError(400, "没有可更新的字段。");
  }

  const updated = await prisma.reminder.update({
    where: { id: params.id },
    data,
  });
  return NextResponse.json(toReminderJson(updated));
}

/** DELETE /api/reminders/{id} —— 无关联对象，直接删，返回 204 无响应体 */
export async function DELETE(_req: Request, { params }: Ctx) {
  const existing = await prisma.reminder.findUnique({ where: { id: params.id } });
  if (!existing) return apiError(404, "工作提醒不存在。");

  await prisma.reminder.delete({ where: { id: params.id } });
  return new NextResponse(null, { status: 204 });
}
