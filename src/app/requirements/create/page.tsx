"use client";

import { useRouter } from "next/navigation";
import { message } from "antd";
import type { Requirement } from "@/types";
import { useAppStore } from "@/store/store";
import RequirementForm, {
  type RequirementFormValues,
} from "@/components/RequirementForm";

/**
 * 新建需求页
 * - 复用 RequirementForm（create 模式：日期默认今天、系统默认 WMS、当前节点默认方案中）
 * - 提交：developmentDays 已在表单内按规则算好（未发版 date→今天；已发版 date→发版时间），
 *   组装完整 Requirement 写入全局 store（mock），成功后提示并返回列表
 */
export default function CreateRequirementPage() {
  const router = useRouter();
  const addRequirement = useAppStore((s) => s.addRequirement);

  const handleSubmit = (values: RequirementFormValues) => {
    const now = new Date().toISOString();
    const requirement: Requirement = {
      // id 留空，交由 store 生成 req-xxx
      id: "",
      requirementId: values.requirementId,
      date: values.date,
      title: values.title,
      content: values.content,
      system: values.system,
      developmentDays: values.developmentDays,
      currentNode: values.currentNode,
      isUrgent: values.isUrgent,
      isReleased: values.isReleased,
      releaseDate: values.isReleased ? values.releaseDate : undefined,
      remark: values.remark,
      createdAt: now,
      updatedAt: now,
    };
    addRequirement(requirement);
    message.success("需求已创建");
    router.push("/requirements");
  };

  return <RequirementForm mode="create" onSubmit={handleSubmit} />;
}
