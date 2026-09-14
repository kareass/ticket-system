"use client";

import { useRouter } from "next/navigation";
import { message } from "antd";
import { useAppStore } from "@/store/store";
import { toErrorMessage } from "@/lib/errors";
import WorkOrderForm, {
  type WorkOrderFormValues,
} from "@/components/WorkOrderForm";

/**
 * 新建工单页（环节5：写入真实后端）
 * - 复用 WorkOrderForm（create 模式：日期默认今天、系统默认 WMS、状态默认新建）
 * - 提交：POST /api/work-orders；成功提示并返回列表，失败展示后端校验信息且留在本页
 */
export default function CreateWorkOrderPage() {
  const router = useRouter();
  const addWorkOrder = useAppStore((s) => s.addWorkOrder);

  const handleSubmit = async (values: WorkOrderFormValues) => {
    try {
      await addWorkOrder({
        date: values.date,
        title: values.title,
        content: values.content,
        system: values.system,
        isConvertToRequirement: values.isConvertToRequirement,
        status: values.status ?? "新建",
        // 需求ID/需求内容必须一并下发：漏传时若开关为「是」，后端会以「需求ID 必填」400 拒绝
        requirementId: values.requirementId,
        requirementContent: values.requirementContent,
        remark: values.remark,
      });
      message.success("工单已创建");
      router.push("/work-orders");
    } catch (e) {
      // 留在本页，用户可修正后重新提交
      message.error(toErrorMessage(e));
    }
  };

  return <WorkOrderForm mode="create" onSubmit={handleSubmit} />;
}
