"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Empty, message, Skeleton } from "antd";
import { useAppStore } from "@/store/store";
import { reminderApi } from "@/lib/api";
import { toErrorMessage } from "@/lib/errors";
import ReminderForm, { type ReminderFormValues } from "@/components/ReminderForm";

/**
 * 编辑工作提醒页
 * - 提醒**一律从 store 派生**，不要拷进 useState 快照 —— 否则别处（列表勾选）改了它，这里看不到。
 * - 缓存里没有才回源 reminderApi.get，拿到后 upsert 进 store（而不是只存本地）。
 * - 保存：PUT /api/reminders/{id}（必填字段传空串会被后端 400 打回，前端已用 rules 挡住）。
 */
export default function EditReminderPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const reminders = useAppStore((s) => s.reminders);
  const upsertReminder = useAppStore((s) => s.upsertReminder);
  const updateReminder = useAppStore((s) => s.updateReminder);

  // store 优先：列表勾选/保存后这里会跟着重新渲染
  const reminder = reminders.find((r) => r.id === params.id);
  const [loading, setLoading] = useState(!reminder);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (reminder) return;
    let alive = true;
    setLoading(true);
    reminderApi
      .get(params.id)
      .then((r) => {
        if (alive) upsertReminder(r);
      })
      .catch((e) => message.error(toErrorMessage(e)))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [reminder, params.id, upsertReminder]);

  const handleSubmit = async (values: ReminderFormValues) => {
    setSubmitting(true);
    try {
      await updateReminder(params.id, {
        date: values.date.format("YYYY-MM-DD"),
        remindee: values.remindee,
        content: values.content.trim(),
      });
      message.success("提醒已保存");
      router.push("/reminders");
    } catch (e) {
      message.error(toErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Skeleton active />;
  if (!reminder) {
    return (
      <Card>
        <Empty description="提醒不存在，可能已被删除" />
      </Card>
    );
  }

  return (
    <ReminderForm
      initial={reminder}
      submitting={submitting}
      onSubmit={handleSubmit}
      onCancel={() => router.push("/reminders")}
    />
  );
}
