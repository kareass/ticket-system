"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Empty, message, Skeleton } from "antd";
import { useAppStore } from "@/store/store";
import { meetingApi } from "@/lib/api";
import { toErrorMessage } from "@/lib/errors";
import MeetingForm, { type MeetingFormValues } from "@/components/MeetingForm";
import type { Meeting } from "@/types";

/**
 * 编辑会议纪要页
 * - 优先取 store 缓存（列表页已加载）；缓存里没有才回源 meetingApi.get
 * - 保存：PUT /api/meetings/{id}（三态语义由后端负责）
 */
export default function EditMeetingPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const meetings = useAppStore((s) => s.meetings);
  const updateMeeting = useAppStore((s) => s.updateMeeting);

  const cached = meetings.find((m) => m.id === params.id);
  const [meeting, setMeeting] = useState<Meeting | undefined>(cached);
  const [loading, setLoading] = useState(!cached);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (cached) return;
    let alive = true;
    setLoading(true);
    meetingApi
      .get(params.id)
      .then((m) => {
        if (alive) setMeeting(m);
      })
      .catch((e) => message.error(toErrorMessage(e)))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [cached, params.id]);

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

  if (loading) return <Skeleton active />;
  if (!meeting) {
    return (
      <Card>
        <Empty description="会议纪要不存在，可能已被删除" />
      </Card>
    );
  }

  return (
    <MeetingForm
      initial={meeting}
      submitting={submitting}
      onSubmit={handleSubmit}
      onCancel={() => router.push("/meetings")}
    />
  );
}
