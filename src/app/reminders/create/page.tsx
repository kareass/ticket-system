"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { message } from "antd";
import { useAppStore } from "@/store/store";
import { toErrorMessage } from "@/lib/errors";
import ReminderForm, { type ReminderFormValues } from "@/components/ReminderForm";

export default function CreateReminderPage() {
  const router = useRouter();
  const addReminder = useAppStore((s) => s.addReminder);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (values: ReminderFormValues) => {
    setSubmitting(true);
    try {
      await addReminder({
        date: values.date.format("YYYY-MM-DD"),
        remindee: values.remindee,
        content: values.content.trim(),
      });
      message.success("提醒已创建");
      router.push("/reminders");
    } catch (e) {
      message.error(toErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ReminderForm
      submitting={submitting}
      onSubmit={handleSubmit}
      onCancel={() => router.push("/reminders")}
    />
  );
}
