"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button, Empty, message, Skeleton } from "antd";
import type { Requirement } from "@/types";
import { useAppStore } from "@/store/store";
import { requirementApi } from "@/lib/api";
import { toErrorMessage } from "@/lib/errors";
import Surface from "@/components/common/Surface";
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
        // 提交人：表单必填校验把关；后端 PUT 三态语义：未传不动 / 空串清空 / 非空改名
        submittedBy: values.submittedBy,
      });
      message.success("需求已更新");
      router.push("/requirements");
    } catch (e) {
      message.error(toErrorMessage(e));
    }
  };

  // 加载态与「不存在」都与 FormShell 同一块板、同一个标题，只换板内内容
  if (checking) {
    return (
      <Surface style={{ maxWidth: 960 }}>
        <div className="page-head">
          <h1>编辑需求</h1>
        </div>
        <Skeleton className="form-skeleton" active paragraph={{ rows: 6 }} />
      </Surface>
    );
  }

  if (!requirement) {
    return (
      <Surface style={{ maxWidth: 960 }}>
        <div className="page-head">
          <h1>编辑需求</h1>
        </div>
        <div className="form-notice">
          <Empty description="未找到该需求，可能已被删除或链接有误。" />
          <Button type="primary" onClick={() => router.push("/requirements")}>
            返回需求列表
          </Button>
        </div>
      </Surface>
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
