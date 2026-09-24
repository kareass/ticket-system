"use client";

import { useState } from "react";
import { Button, Image, message, Popconfirm, Space, Typography } from "antd";
import { DeleteOutlined, DownloadOutlined, PaperClipOutlined } from "@ant-design/icons";
import { meetingApi } from "@/lib/api";
import { toErrorMessage } from "@/lib/errors";
import { useAppStore } from "@/store/store";
import type { MeetingAttachment } from "@/types";

const { Text } = Typography;

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
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
      {attachments.map((att) => {
        const url = meetingApi.attachmentUrl(att.id);
        const isImage = IMAGE_EXT.has(extOf(att.fileName));
        return (
          <div
            key={att.id}
            style={{
              border: "1px solid #f0f0f0",
              borderRadius: 6,
              padding: 8,
              width: 200,
            }}
          >
            {isImage ? (
              <Image
                src={url}
                alt={att.fileName}
                height={80}
                style={{ objectFit: "cover", width: "100%" }}
              />
            ) : (
              <div
                style={{
                  height: 80,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#fafafa",
                  borderRadius: 4,
                }}
              >
                <PaperClipOutlined style={{ fontSize: 28, color: "#bfbfbf" }} />
              </div>
            )}

            <div style={{ marginTop: 6, wordBreak: "break-all" }}>
              <Text ellipsis={{ tooltip: att.fileName }} style={{ fontSize: 12 }}>
                {att.fileName}
              </Text>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {humanSize(att.size)}
              </Text>
            </div>

            <Space size={0} style={{ marginTop: 4 }}>
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
