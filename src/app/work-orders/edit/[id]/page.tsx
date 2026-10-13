"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button, Empty, message, Skeleton } from "antd";
import type { WorkOrder } from "@/types";
import { useAppStore } from "@/store/store";
import { workOrderApi } from "@/lib/api";
import { toErrorMessage } from "@/lib/errors";
import Surface from "@/components/common/Surface";
import WorkOrderForm, {
  type WorkOrderFormValues,
} from "@/components/WorkOrderForm";

/**
 * 编辑工单页（环节5：真实后端）
 * - 优先用 store 中已加载的记录；直接刷新/直达 URL 时 store 为空，
 *   改为按 id 调 GET /api/work-orders/{id} 兜底拉取（拉取期间显示加载态）
 * - 提交：PUT /api/work-orders/{id}；成功提示并返回列表，失败留在本页并提示
 * - 找不到（404）→ 展示「工单不存在」空态，不抛错
 */
export default function EditWorkOrderPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const storeWorkOrder = useAppStore((s) =>
    id ? s.workOrders.find((wo) => wo.id === id) : undefined,
  );
  const updateWorkOrder = useAppStore((s) => s.updateWorkOrder);

  const [workOrder, setWorkOrder] = useState<WorkOrder | undefined>(storeWorkOrder);
  // store 未命中时需要一次兜底拉取；命中则直接可用
  const [checking, setChecking] = useState(!storeWorkOrder);

  useEffect(() => {
    if (!id) {
      setChecking(false);
      return;
    }
    if (storeWorkOrder) {
      setWorkOrder(storeWorkOrder);
      setChecking(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const fetched = await workOrderApi.get(id);
        if (!cancelled) setWorkOrder(fetched);
      } catch {
        if (!cancelled) setWorkOrder(undefined);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, storeWorkOrder]);

  const handleSubmit = async (values: WorkOrderFormValues) => {
    if (!id) return;
    try {
      await updateWorkOrder(id, {
        date: values.date,
        title: values.title,
        content: values.content,
        system: values.system,
        isConvertToRequirement: values.isConvertToRequirement,
        status: values.status,
        // 需求ID/需求内容必须一并下发：漏传时开关为「是」会被后端以「需求ID 必填」拒绝，
        // 也会导致「改编号同步改名」等操作无法生效
        requirementId: values.requirementId,
        requirementContent: values.requirementContent,
        remark: values.remark,
        // 提交人：表单必填校验把关；后端 PUT 三态语义：未传不动 / 空串清空 / 非空改名
        submittedBy: values.submittedBy,
      });
      message.success("工单已更新");
      router.push("/work-orders");
    } catch (e) {
      message.error(toErrorMessage(e));
    }
  };

  // 加载态与「不存在」都与 FormShell 同一块板、同一个标题，只换板内内容 ——
  // 三种状态之间是同一个版面的三种填充，不是三个页面。
  if (checking) {
    return (
      <Surface style={{ maxWidth: 960 }}>
        <div className="page-head">
          <h1>编辑工单</h1>
        </div>
        <Skeleton className="form-skeleton" active paragraph={{ rows: 6 }} />
      </Surface>
    );
  }

  if (!workOrder) {
    return (
      <Surface style={{ maxWidth: 960 }}>
        <div className="page-head">
          <h1>编辑工单</h1>
        </div>
        <div className="form-notice">
          <Empty description="未找到该工单，可能已被删除或链接有误。" />
          <Button type="primary" onClick={() => router.push("/work-orders")}>
            返回工单列表
          </Button>
        </div>
      </Surface>
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
