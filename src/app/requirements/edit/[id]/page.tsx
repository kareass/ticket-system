"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button, Card, message, Result, Spin } from "antd";
import type { Requirement } from "@/types";
import { useAppStore } from "@/store/store";
import { requirementApi } from "@/lib/api";
import { toErrorMessage } from "@/lib/errors";
import RequirementForm, {
  type RequirementFormValues,
} from "@/components/RequirementForm";

/**
 * 编辑需求页（环节5：真实后端）
 * - 优先用 store 中已加载的记录；直接刷新/直达 URL 时按 id 调 GET /api/requirements/{id} 兜底
 * - 提交：PUT /api/requirements/{id}（发版联动与开发时长由服务端重算）
 * - 失败留在本页提示；404 → 空态
 */
export default function EditRequirementPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const storeRequirement = useAppStore((s) =>
    id ? s.requirements.find((req) => req.id === id) : undefined,
  );
  const updateRequirement = useAppStore((s) => s.updateRequirement);

  const [requirement, setRequirement] = useState<Requirement | undefined>(
    storeRequirement,
  );
  const [checking, setChecking] = useState(!storeRequirement);

  useEffect(() => {
    if (!id) {
      setChecking(false);
      return;
    }
    if (storeRequirement) {
      setRequirement(storeRequirement);
      setChecking(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const fetched = await requirementApi.get(id);
        if (!cancelled) setRequirement(fetched);
      } catch {
        if (!cancelled) setRequirement(undefined);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, storeRequirement]);

  const handleSubmit = async (values: RequirementFormValues) => {
    if (!id) return;
    try {
      await updateRequirement(id, {
        requirementId: values.requirementId,
        date: values.date,
        title: values.title,
        content: values.content,
        system: values.system,
        currentNode: values.currentNode,
        isUrgent: values.isUrgent,
        isReleased: values.isReleased,
        // 未发版时清空原发版时间（改为否时不应残留旧值；服务端亦会清空）
        releaseDate: values.isReleased ? values.releaseDate : undefined,
        remark: values.remark,
      });
      message.success("需求已更新");
      router.push("/requirements");
    } catch (e) {
      message.error(toErrorMessage(e));
    }
  };

  if (checking) {
    return (
      <Card title="编辑需求">
        <div style={{ padding: "48px 0", textAlign: "center" }}>
          <Spin size="large" />
          <div style={{ marginTop: 12, color: "#999" }}>加载需求中…</div>
        </div>
      </Card>
    );
  }

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
