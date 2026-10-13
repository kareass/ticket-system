"use client";

import { useState } from "react";
import { Button, Image, message, Popconfirm, Space } from "antd";
import { DeleteOutlined, DownloadOutlined } from "@ant-design/icons";
import { meetingApi } from "@/lib/api";
import { toErrorMessage } from "@/lib/errors";
import { useAppStore } from "@/store/store";
import type { MeetingAttachment } from "@/types";

/** 图片类附件出缩略图（扩展名判断，与后端 INLINE_EXT 的口径保持一致） */
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"]);

function extOf(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  return i < 0 ? "" : fileName.slice(i).toLowerCase();
}

/** 字节数 → 人话 */
function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

interface AttachmentListProps {
  meetingId: string;
  attachments: MeetingAttachment[];
}

/**
 * 已保存附件的展示 / 预览 / 删除。
 * **只负责已落库的附件** —— 尚未上传的本地文件由调用方自己的待传列表负责。
 *
 * 形态是**行列表**而不是一排带边框的卡片，两个原因：
 * ① 它嵌在表单板里，卡片套卡片是本方向的禁令；
 * ② 附件是支撑材料不是主内容 —— 行列表更省地方，文件名也不必挤在 200px 里截断。
 * 非图片文件不画通用回形针，直接把扩展名写出来：一眼分得清 docx / pdf / xlsx，
 * 回形针分不清。图片仍出 40px 缩略图，点开是 antd 的放大预览。
 */
export default function AttachmentList({
  meetingId,
  attachments,
}: AttachmentListProps) {
  const removeMeetingAttachment = useAppStore((s) => s.removeMeetingAttachment);
  const [deleting, setDeleting] = useState<string | null>(null);

  if (!attachments.length) return null;

  const handleDelete = async (att: MeetingAttachment) => {
    setDeleting(att.id);
    try {
      await meetingApi.removeAttachment(att.id);
      removeMeetingAttachment(meetingId, att.id);
      message.success("附件已删除");
    } catch (e) {
      message.error(toErrorMessage(e));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="att-list">
      {attachments.map((att) => {
        const url = meetingApi.attachmentUrl(att.id);
        const ext = extOf(att.fileName);
        const isImage = IMAGE_EXT.has(ext);
        return (
          <div key={att.id} className="att-row">
            {isImage ? (
              <Image
                src={url}
                alt={att.fileName}
                width={40}
                height={40}
                style={{ objectFit: "cover", borderRadius: 6 }}
              />
            ) : (
              // 扩展名去点大写；没有扩展名（如 "README"）时退成一个中性字
              <span className="att-ext mono">
                {ext ? ext.slice(1).toUpperCase() : "文件"}
              </span>
            )}

            {/* 文件名用 title 提供完整值：列宽固定，长文件名靠省略号 + 悬停看全 */}
            <span className="att-name" title={att.fileName}>
              {att.fileName}
            </span>
            <span className="att-size mono">{humanSize(att.size)}</span>

            <Space size={0}>
              <Button
                type="link"
                size="small"
                icon={<DownloadOutlined />}
                href={url}
                target="_blank"
                rel="noreferrer"
              >
                打开
              </Button>
              <Popconfirm
                title="删除附件"
                description="确定删除该附件吗？删除后不可恢复。"
                okText="删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                onConfirm={() => handleDelete(att)}
              >
                <Button
                  type="link"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  loading={deleting === att.id}
                >
                  删除
                </Button>
              </Popconfirm>
            </Space>
          </div>
        );
      })}
    </div>
  );
}
