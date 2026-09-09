"use client";

import { useRouter } from "next/navigation";
import { message } from "antd";
import type { WorkOrder } from "@/types";
import { useAppStore } from "@/store/store";
import WorkOrderForm, {
  type WorkOrderFormValues,
} from "@/components/WorkOrderForm";

/**
 * 新建工单页
 * - 复用 WorkOrderForm（create 模式：日期默认今天、系统默认 WMS）
 * - 提交：组装完整 WorkOrder 写入全局 store（mock），成功后提示并返回列表
 * - 转需求自动同步为后续环节（环节5），本期仅记录 isConvertToRequirement 标记
 */
export default function CreateWorkOrderPage() {
  const router = useRouter();
  const addWorkOrder = useAppStore((s) => s.addWorkOrder);

  const handleSubmit = (values: WorkOrderFormValues) => {
    const now = new Date().toISOString();
    const workOrder: WorkOrder = {
      // id 留空，交由 store 生成 wo-xxx
      id: "",
      date: values.date,
      title: values.title,
      content: values.content,
      system: values.system,
      isConvertToRequirement: values.isConvertToRequirement,
      remark: values.remark,
      status: "新建",
      createdAt: now,
      updatedAt: now,
    };
    addWorkOrder(workOrder);
    message.success("工单已创建");
    router.push("/work-orders");
  };

  return <WorkOrderForm mode="create" onSubmit={handleSubmit} />;
}
