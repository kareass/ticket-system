"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { message } from "antd";
import { useAppStore } from "@/store/store";
import { meetingApi } from "@/lib/api";
import { toErrorMessage } from "@/lib/errors";
import MeetingForm, { type MeetingFormValues } from "@/components/MeetingForm";

export default function CreateMeetingPage() {
  const router = useRouter();
  const addMeeting = useAppStore((s) => s.addMeeting);
  const addMeetingAttachment = useAppStore((s) => s.addMeetingAttachment);
  const [submitting, setSubmitting] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  // 用 useCallback 固定引用，否则 MeetingForm 里的 useEffect 会反复触发
  const handlePendingFilesChange = useCallback((files: File[]) => {
    setPendingFiles(files);
  }, []);

  const handleSubmit = async (values: MeetingFormValues) => {
    setSubmitting(true);
    try {
      // ① 先把纪要建出来，拿到 id
      const created = await addMeeting({
        date: values.date.format("YYYY-MM-DD"),
        title: values.title,
        attendees: values.attendees ?? [],
        recorder: values.recorder || undefined,
        content: values.content || undefined,
      });

      // ② 再逐个传附件
      const failed: string[] = [];
      for (const f of pendingFiles) {
        try {
          const att = await meetingApi.uploadAttachment(created.id, f);
          addMeetingAttachment(created.id, att);
        } catch {
          failed.push(f.name);
        }
      }

      // ③ 如实汇报 —— 不得把「部分失败」说成成功
      if (failed.length) {
        message.warning(
          `会议纪要已保存，但 ${failed.length} 个附件上传失败：${failed.join("、")}。请在编辑页重新上传。`,
        );
      } else if (pendingFiles.length) {
        message.success(`会议纪要已创建，${pendingFiles.length} 个附件已上传`);
      } else {
        message.success("会议纪要已创建");
      }

      // ④ 一律跳编辑页：上传失败的附件能立刻在这儿重传
      router.push(`/meetings/edit/${created.id}`);
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
      onPendingFilesChange={handlePendingFilesChange}
    />
  );
}
