"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { message } from "antd";
import { useAppStore } from "@/store/store";
import { toErrorMessage } from "@/lib/errors";
import MeetingForm, { type MeetingFormValues } from "@/components/MeetingForm";

/**
 * 新建会议纪要页
 * - 提交：POST /api/meetings（阶段一是**纯 JSON**，不带文件）
 * - 附件在阶段二接入（见 Task 12：先把纪要建出来拿到 id，再逐个上传）
 */
export default function CreateMeetingPage() {
  const router = useRouter();
  const addMeeting = useAppStore((s) => s.addMeeting);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (values: MeetingFormValues) => {
    setSubmitting(true);
    try {
      await addMeeting({
        date: values.date.format("YYYY-MM-DD"),
        title: values.title,
        attendees: values.attendees ?? [],
        recorder: values.recorder || undefined,
        content: values.content || undefined,
      });
      message.success("会议纪要已创建");
      router.push("/meetings");
    } catch (e) {
      message.error(toErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MeetingForm
      submitting={submitting}
      onSubmit={handleSubmit}
      onCancel={() => router.push("/meetings")}
    />
  );
}
