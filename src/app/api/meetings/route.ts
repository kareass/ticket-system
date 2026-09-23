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

export const runtime = "nodejs";

/**
 * GET /api/meetings
 * 会议纪要列表。可选过滤：?keyword=xxx（匹配 主题 / 记录人 / 会议内容 / 参会人）
 * ?attendee=张三（按人筛，同样是子串匹配，见设计文档「明确不做」）。
 * 按创建时间倒序，含附件列表。
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const keyword = url.searchParams.get("keyword")?.trim();
  const attendee = url.searchParams.get("attendee")?.trim();

  const where: Prisma.MeetingWhereInput = {
    ...(keyword
      ? {
          OR: [
            { title: { contains: keyword } },
            { recorder: { contains: keyword } },
            { content: { contains: keyword } },
            { attendees: { contains: keyword } },
          ],
        }
      : {}),
    ...(attendee ? { attendees: { contains: attendee } } : {}),
  };

  const rows = await prisma.meeting.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { attachments: true },
  });
  return NextResponse.json(rows.map(toMeetingJson));
}

/**
 * POST /api/meetings
 * 新建会议纪要（**纯 JSON，不接收文件** —— 附件由 POST /api/meetings/{id}/attachments 上传）。
 * body：date*（YYYY-MM-DD）/ title* 必填；attendees（字符串数组）/ recorder / content 可选。
 * 返回 201 + 创建结果。
 */
export async function POST(req: Request) {
  const body = await readJson(req);
  if (!body) return apiError(400, "请求体必须是合法 JSON 对象。");

  const errors: string[] = [];

  const date = asTrimmed(body.date);
  if (!date || !isValidCalendarDay(date)) {
    errors.push("date 必填，格式 YYYY-MM-DD。");
  }

  const title = asTrimmed(body.title);
  if (!title) errors.push("title（主题）必填。");

  // attendees 必须是字符串数组（或缺省）；传其它类型直接 400，不要静默吞掉
  if (body.attendees !== undefined && !Array.isArray(body.attendees)) {
    errors.push("attendees 须为字符串数组。");
  }

  if (errors.length) return apiError(400, "参数校验失败。", errors);

  const attendees = serializeAttendees(body.attendees);
  const recorder = asTrimmed(body.recorder);
  const content = asTrimmed(body.content);

  const created = await prisma.meeting.create({
    data: {
      date: toDayUtc(date as string) as Date,
      title: title as string,
      ...(attendees ? { attendees } : {}),
      ...(recorder ? { recorder } : {}),
      ...(content ? { content } : {}),
    },
    include: { attachments: true },
  });
  return NextResponse.json(toMeetingJson(created), { status: 201 });
}
