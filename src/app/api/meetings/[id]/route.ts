import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/db";
import {
  apiError,
  asTrimmed,
  isValidCalendarDay,
  readJson,
  serializeAttendees,
  toDayUtc,
  toMeetingJson,
} from "@/lib/server/helpers";
import { removeStored } from "@/lib/server/attachments";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

/** GET /api/meetings/{id} —— 单条（含附件） */
export async function GET(_req: Request, { params }: Ctx) {
  const row = await prisma.meeting.findUnique({
    where: { id: params.id },
    include: { attachments: true },
  });
  if (!row) return apiError(404, "会议纪要不存在。");
  return NextResponse.json(toMeetingJson(row));
}

/**
 * PUT /api/meetings/{id}
 * 三态语义（与需求模块一致，不得自创）：
 *   undefined（未传）→ 不改该字段；""（显式清空）→ 落 null；非空 → 改。
 * attendees 额外约定：传数组则整体替换；传 [] 视为清空；未传则不动。**不做数组级增量合并**。
 */
export async function PUT(req: Request, { params }: Ctx) {
  const body = await readJson(req);
  if (!body) return apiError(400, "请求体必须是合法 JSON 对象。");

  const existing = await prisma.meeting.findUnique({ where: { id: params.id } });
  if (!existing) return apiError(404, "会议纪要不存在。");

  const errors: string[] = [];
  const data: Prisma.MeetingUpdateInput = {};

  if (body.date !== undefined) {
    const date = asTrimmed(body.date);
    if (!date || !isValidCalendarDay(date)) {
      errors.push("date 格式须为 YYYY-MM-DD。");
    } else {
      data.date = toDayUtc(date) as Date;
    }
  }

  if (body.title !== undefined) {
    const title = asTrimmed(body.title);
    if (!title) errors.push("title（主题）不能为空。");
    else data.title = title;
  }

  if (body.attendees !== undefined) {
    if (!Array.isArray(body.attendees)) {
      errors.push("attendees 须为字符串数组。");
    } else {
      data.attendees = serializeAttendees(body.attendees) ?? null;
    }
  }

  if (body.recorder !== undefined) data.recorder = asTrimmed(body.recorder) || null;
  if (body.content !== undefined) data.content = asTrimmed(body.content) || null;

  if (errors.length) return apiError(400, "参数校验失败。", errors);

  const updated = await prisma.meeting.update({
    where: { id: params.id },
    data,
    include: { attachments: true },
  });
  return NextResponse.json(toMeetingJson(updated));
}

/**
 * DELETE /api/meetings/{id}
 * 1) 先查出所有附件的 storedName
 * 2) 删纪要（附件记录随 onDelete: Cascade 清掉）
 * 3) **事务提交之后**再逐个删磁盘文件；删文件失败只记日志，不影响接口返回
 *
 * 顺序不能颠倒：先删文件后删记录，一旦第二步失败就会留下「记录还在、文件没了」
 * 的不可自愈状态；反过来最坏只留一个孤儿文件。
 */
export async function DELETE(_req: Request, { params }: Ctx) {
  const existing = await prisma.meeting.findUnique({
    where: { id: params.id },
    include: { attachments: true },
  });
  if (!existing) return apiError(404, "会议纪要不存在。");

  const storedNames = existing.attachments.map((a) => a.storedName);

  await prisma.meeting.delete({ where: { id: params.id } });

  // 记录已删，现在清理磁盘。失败只记日志 —— 孤儿文件人畜无害，
  // 而「记录还在文件没了」是不可自愈的。
  for (const name of storedNames) {
    await removeStored(name);
  }

  return new NextResponse(null, { status: 204 });
}
