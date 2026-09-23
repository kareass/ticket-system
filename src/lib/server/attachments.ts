import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { ApiFailure } from "@/lib/server/helpers";

/**
 * 附件的磁盘读写、命名与校验 —— 本项目**唯一**的文件 IO 实现处。
 * 上传 / 下载 / 删除三条路径共用本文件，规则不得在别处重写
 * （与 work-order-sync.ts 之于「工单转需求」同理）。
 *
 * ⚠️ 安全前提：file.originalname 是**用户可控输入**，可能是 `../../.env`、
 * `截图 2026/09/23.png`、Windows 保留名（CON/NUL）、超长名或带 \0。
 * 因此：
 *   - 磁盘文件名一律由服务端生成（UUID），**不含任何用户输入**
 *   - 原始名只写进数据库，用于展示与下载时的文件名
 *   - 扩展名必须命中白名单才放行
 */

export const UPLOAD_DIR = path.join(process.cwd(), "uploads");

/** 单文件上限 20MB（设计文档约定） */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** 允许的扩展名（小写，含点） */
export const ALLOWED_EXT: ReadonlySet<string> = new Set([
  // 图片
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp",
  // 文档
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  // 文本
  ".txt", ".csv",
  // 压缩包
  ".zip", ".rar", ".7z",
]);

/** 供错误提示用的人类可读列表 */
export const ALLOWED_EXT_TEXT = Array.from(ALLOWED_EXT).join(" / ");

/**
 * 从原始文件名取扩展名并校验白名单。
 * 返回 null 表示不允许（无扩展名、隐藏文件、或不在白名单）。
 */
export function safeExt(originalName: string): string | null {
  // 先取 basename：浏览器偶尔会带完整路径；同时挡掉 `../../x.txt` 这类
  const base = path.basename(originalName || "");
  const i = base.lastIndexOf(".");
  // i <= 0 同时排除「无扩展名」和「.env 这类隐藏文件」
  if (i <= 0) return null;
  const ext = base.slice(i).toLowerCase();
  return ALLOWED_EXT.has(ext) ? ext : null;
}

/**
 * 把库里的 storedName 还原成磁盘绝对路径，并**断言不越界**。
 * storedName 由服务端生成，理论上不会越界；这道断言是纵深防御 ——
 * 万一将来有人往库里写了脏值，也不要让它读到 uploads/ 之外。
 */
export function resolveStored(storedName: string): string {
  if (!storedName || storedName.includes("/") || storedName.includes("\\")) {
    throw new Error(`非法的 storedName：${storedName}`);
  }
  const full = path.join(UPLOAD_DIR, storedName);
  if (path.dirname(full) !== UPLOAD_DIR) {
    throw new Error("附件路径越界");
  }
  return full;
}

export interface SavedUpload {
  fileName: string;   // 原始文件名（写库用）
  storedName: string; // 磁盘文件名（UUID + 白名单后缀）
  size: number;
  mimeType: string | null;
}

/**
 * 校验并落盘。失败抛 ApiFailure（由路由 catch 转成标准错误响应）。
 * 任一步失败都不留下半截文件。
 */
export async function saveUpload(file: File): Promise<SavedUpload> {
  const ext = safeExt(file.name);
  if (!ext) {
    throw new ApiFailure(400, `不支持的文件类型，允许：${ALLOWED_EXT_TEXT}`);
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new ApiFailure(400, "单个附件不能超过 20MB。");
  }

  const storedName = `${randomUUID()}${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());

  // 缓冲后 size 可能比 file.size 更可信，再卡一次
  if (buf.length > MAX_FILE_BYTES) {
    throw new ApiFailure(400, "单个附件不能超过 20MB。");
  }

  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(resolveStored(storedName), buf);

  return {
    fileName: path.basename(file.name || "未命名"),
    storedName,
    size: buf.length,
    // ⚠️ mimeType 来自客户端，可伪造，**只存作参考，绝不用于安全判断**
    mimeType: file.type || null,
  };
}

/**
 * 删除磁盘文件。
 * **失败只记日志、不抛错** —— 调用方是在数据库记录已删除之后执行的，
 * 此时抛错只会让用户以为删除失败，而实际记录已经没了。
 * 最坏结果是留一个孤儿文件：它不占多少空间，也不会被任何界面引用。
 */
export async function removeStored(storedName: string): Promise<void> {
  try {
    await unlink(resolveStored(storedName));
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return; // 本来就不在，视为成功
    console.error("[attachments] 删除附件文件失败：", storedName, code);
  }
}
