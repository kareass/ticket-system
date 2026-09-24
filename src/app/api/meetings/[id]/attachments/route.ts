import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/db";
import { ApiFailure, apiError, toMeetingAttachmentJson } from "@/lib/server/helpers";
import { MAX_FILE_BYTES, removeStored, saveUpload } from "@/lib/server/attachments";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

/**
 * POST /api/meetings/{id}/attachments
 * multipart/form-data，字段名 `file`。返回 201 + 附件记录。
 *
 * 两道大小关：
 *   ① Content-Length 预检 —— 超限直接 413，**在读取 body 之前**就拒绝
 *   ② 实际 file.size 超限 → 400（由 saveUpload 抛 ApiFailure）
 *
 * ⚠️ 这不是流式校验：request.formData() 会把整个 body 缓冲完才交给代码。
 * 单用户内网场景可接受；若要开放给更多人，须改为流式 multipart 解析。
 */
export async function POST(req: Request, { params }: Ctx) {
  const meeting = await prisma.meeting.findUnique({ where: { id: params.id } });
  if (!meeting) return apiError(404, "会议纪要不存在。");

  const len = Number(req.headers.get("content-length") || 0);
  // +1MB 余量给 multipart 的边界与头
  if (len > MAX_FILE_BYTES + 1024 * 1024) {
    return apiError(413, "请求体过大，单个附件不能超过 20MB。");
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return apiError(400, "请求必须是 multipart/form-data。");
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return apiError(400, "缺少文件字段 file。");
  }

  let saved;
  try {
    saved = await saveUpload(file);
  } catch (e) {
    if (e instanceof ApiFailure) return apiError(e.status, e.message);
    throw e;
  }

  try {
    const row = await prisma.meetingAttachment.create({
      data: {
        meetingId: params.id,
        fileName: saved.fileName,
        storedName: saved.storedName,
        size: saved.size,
        mimeType: saved.mimeType,
      },
    });
    return NextResponse.json(toMeetingAttachmentJson(row), { status: 201 });
  } catch (e) {
    // 写库失败 → 把刚落盘的文件删掉，不留垃圾
    await removeStored(saved.storedName);
    throw e;
  }
}
