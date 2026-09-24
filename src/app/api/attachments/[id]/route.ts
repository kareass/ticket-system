import { NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { prisma } from "@/lib/server/db";
import { apiError } from "@/lib/server/helpers";
import { removeStored, resolveStored } from "@/lib/server/attachments";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

/** 图片直接内联显示（页面里 <img src> 就能用），其余触发下载 */
const INLINE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".pdf"]);

/**
 * GET /api/attachments/{id} —— 下载 / 预览
 * - 记录不存在 → 404
 * - 记录在但文件不在 → 404 + 明确文案（**不要 500**，也不静默返回空文件）
 */
export async function GET(_req: Request, { params }: Ctx) {
  const row = await prisma.meetingAttachment.findUnique({ where: { id: params.id } });
  if (!row) return apiError(404, "附件不存在。");

  let full: string;
  try {
    full = resolveStored(row.storedName);
  } catch {
    return apiError(404, "附件的存储路径非法。");
  }

  let size: number;
  try {
    size = (await stat(full)).size;
  } catch {
    return apiError(404, "附件文件已丢失（可能被手工删除），请联系管理员。");
  }

  const ext = row.storedName.slice(row.storedName.lastIndexOf(".")).toLowerCase();
  const disposition = INLINE_EXT.has(ext) ? "inline" : "attachment";

  // ⚠️ 中文文件名必须双写：只给 filename= 的话浏览器会乱码或截断
  const utf8Name = encodeURIComponent(row.fileName);
  const asciiFallback = row.fileName.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");

  const stream = Readable.toWeb(createReadStream(full)) as ReadableStream;
  return new NextResponse(stream, {
    status: 200,
    headers: {
      "Content-Type": row.mimeType || "application/octet-stream",
      "Content-Length": String(size),
      "Content-Disposition":
        `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${utf8Name}`,
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}

/** DELETE /api/attachments/{id} —— 先删记录，再删文件（理由见设计文档 3.3） */
export async function DELETE(_req: Request, { params }: Ctx) {
  const row = await prisma.meetingAttachment.findUnique({ where: { id: params.id } });
  if (!row) return apiError(404, "附件不存在。");

  await prisma.meetingAttachment.delete({ where: { id: params.id } });
  await removeStored(row.storedName);

  return new NextResponse(null, { status: 204 });
}
