"use client";

import { useRouter } from "next/navigation";
import { message } from "antd";
import { useAppStore } from "@/store/store";
import { toErrorMessage } from "@/lib/errors";
import RequirementForm, {
  type RequirementFormValues,
} from "@/components/RequirementForm";

/**
 * 新建需求页（环节5：写入真实后端）
 * - 复用 RequirementForm（create 模式：日期默认今天、系统 WMS、节点方案中）
 * - 提交：POST /api/requirements（服务端会按规则重算 developmentDays 并校验编号唯一）
 * - 失败（编号撞号 409 / 校验 400 / 网络）留在本页并友好提示
 */
export default function CreateRequirementPage() {
  const router = useRouter();
  const addRequirement = useAppStore((s) => s.addRequirement);

  const handleSubmit = async (values: RequirementFormValues) => {
    try {
      await addRequirement({
        requirementId: values.requirementId,
        date: values.date,
        title: values.title,
        content: values.content,
        system: values.system,
        currentNode: values.currentNode,
        isUrgent: values.isUrgent,
        isReleased: values.isReleased,
        releaseDate: values.isReleased ? values.releaseDate : undefined,
        remark: values.remark,
      });
      message.success("需求已创建");
      router.push("/requirements");
    } catch (e) {
      message.error(toErrorMessage(e));
    }
  };

  return <RequirementForm mode="create" onSubmit={handleSubmit} />;
}
