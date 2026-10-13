"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Empty, message, Skeleton } from "antd";
import { useAppStore } from "@/store/store";
import { meetingApi } from "@/lib/api";
import { toErrorMessage } from "@/lib/errors";
import Surface from "@/components/common/Surface";
import MeetingForm, { type MeetingFormValues } from "@/components/MeetingForm";

/**
 * 编辑会议纪要页
 * - 纪要**一律从 store 派生**，不要拷进 useState 快照：
 *   附件的上传/删除只 patch store，用快照会看不到变化。
 * - 缓存里没有才回源 meetingApi.get，拿到后 upsert 进 store（而不是只存本地）。
 * - 保存：PUT /api/meetings/{id}（三态语义由后端负责）
 */
export default function EditMeetingPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const meetings = useAppStore((s) => s.meetings);
  const upsertMeeting = useAppStore((s) => s.upsertMeeting);
  const updateMeeting = useAppStore((s) => s.updateMeeting);

  // store 优先：附件上传/删除后这里会跟着重新渲染
  const meeting = meetings.find((m) => m.id === params.id);
  const [loading, setLoading] = useState(!meeting);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (meeting) return;
    let alive = true;
    setLoading(true);
    meetingApi
      .get(params.id)
      .then((m) => {
        if (alive) upsertMeeting(m);
      })
      .catch((e) => message.error(toErrorMessage(e)))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [meeting, params.id, upsertMeeting]);

  const handleSubmit = async (values: MeetingFormValues) => {
    setSubmitting(true);
    try {
      await updateMeeting(params.id, {
        date: values.date.format("YYYY-MM-DD"),
        title: values.title,
        attendees: values.attendees ?? [],
        recorder: values.recorder || undefined,
        content: values.content || undefined,
      });
      message.success("会议纪要已保存");
      router.push("/meetings");
    } catch (e) {
      message.error(toErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  // 加载态与「不存在」都与 FormShell 同一块板、同一个标题，只换板内内容
  if (loading) {
    return (
      <Surface style={{ maxWidth: 960 }}>
        <div className="page-head">
          <h1>编辑会议纪要</h1>
        </div>
        <Skeleton className="form-skeleton" active paragraph={{ rows: 6 }} />
      </Surface>
    );
  }

  if (!meeting) {
    return (
      <Surface style={{ maxWidth: 960 }}>
        <div className="page-head">
          <h1>编辑会议纪要</h1>
        </div>
        <div className="form-notice">
          <Empty description="未找到该会议纪要，可能已被删除或链接有误。" />
          <Button type="primary" onClick={() => router.push("/meetings")}>
            返回会议纪要列表
          </Button>
        </div>
      </Surface>
    );
  }

  return (
    <MeetingForm
      meetingId={meeting.id}
      initial={meeting}
      submitting={submitting}
      onSubmit={handleSubmit}
      onCancel={() => router.push("/meetings")}
    />
  );
}
