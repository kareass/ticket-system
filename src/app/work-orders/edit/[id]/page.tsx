"use client";

import { useParams, useRouter } from "next/navigation";
import { Button, Card, message, Result } from "antd";
import { useAppStore } from "@/store/store";
import WorkOrderForm, {
  type WorkOrderFormValues,
} from "@/components/WorkOrderForm";

/**
 * 编辑工单页
 * - useParams 取 id，从 store.workOrders 查找对应工单
 * - 找到 → 复用 WorkOrderForm（edit 模式）回填（date 由组件内转成 dayjs 给 DatePicker）
 * - 提交：updateWorkOrder(id, values)，成功后提示并返回列表
 * - 找不到 → 展示「工单不存在」空态 + 返回按钮，不抛错
 */
export default function EditWorkOrderPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const workOrders = useAppStore((s) => s.workOrders);
  const updateWorkOrder = useAppStore((s) => s.updateWorkOrder);

  const workOrder = id ? workOrders.find((wo) => wo.id === id) : undefined;

  const handleSubmit = (values: WorkOrderFormValues) => {
    if (!id) return;
    updateWorkOrder(id, {
      date: values.date,
      title: values.title,
      content: values.content,
      system: values.system,
      isConvertToRequirement: values.isConvertToRequirement,
      status: values.status,
      remark: values.remark,
      updatedAt: new Date().toISOString(),
    });
    message.success("工单已更新");
    router.push("/work-orders");
  };

  if (!workOrder) {
    return (
      <Card title="编辑工单">
        <Result
          status="warning"
          title="工单不存在"
          subTitle="未找到对应工单，可能已被删除或链接有误。"
          extra={
            <Button type="primary" onClick={() => router.push("/work-orders")}>
              返回工单列表
            </Button>
          }
        />
      </Card>
    );
  }

  // ⑤ 强制每条记录独立重挂载，确保 initialValues 重新读取（Form initialValues 只在挂载时读一次）
  return (
    <WorkOrderForm
      key={workOrder.id}
      mode="edit"
      initialValues={workOrder}
      onSubmit={handleSubmit}
    />
  );
}
