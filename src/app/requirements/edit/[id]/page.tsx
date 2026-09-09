"use client";

import { useParams, useRouter } from "next/navigation";
import { Button, Card, message, Result } from "antd";
import { useAppStore } from "@/store/store";
import RequirementForm, {
  type RequirementFormValues,
} from "@/components/RequirementForm";

/**
 * 编辑需求页
 * - useParams 取 id，从 store.requirements 查找对应需求
 * - 找到 → 复用 RequirementForm（edit 模式）回填（date/releaseDate 由组件内转成 dayjs 给 DatePicker）
 * - 提交：updateRequirement(id, values)，developmentDays 已按规则重算；成功后提示并返回列表
 * - 找不到 → 展示「需求不存在」空态 + 返回按钮，不抛错
 */
export default function EditRequirementPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const requirements = useAppStore((s) => s.requirements);
  const updateRequirement = useAppStore((s) => s.updateRequirement);

  const requirement = id
    ? requirements.find((req) => req.id === id)
    : undefined;

  const handleSubmit = (values: RequirementFormValues) => {
    if (!id) return;
    updateRequirement(id, {
      requirementId: values.requirementId,
      date: values.date,
      title: values.title,
      content: values.content,
      system: values.system,
      developmentDays: values.developmentDays,
      currentNode: values.currentNode,
      isUrgent: values.isUrgent,
      isReleased: values.isReleased,
      // 未发版时清空原发版时间（改为否时不应残留旧值）
      releaseDate: values.isReleased ? values.releaseDate : undefined,
      remark: values.remark,
      updatedAt: new Date().toISOString(),
    });
    message.success("需求已更新");
    router.push("/requirements");
  };

  if (!requirement) {
    return (
      <Card title="编辑需求">
        <Result
          status="warning"
          title="需求不存在"
          subTitle="未找到对应需求，可能已被删除或链接有误。"
          extra={
            <Button
              type="primary"
              onClick={() => router.push("/requirements")}
            >
              返回需求列表
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <RequirementForm
      key={requirement.id}
      mode="edit"
      initialValues={requirement}
      onSubmit={handleSubmit}
    />
  );
}
