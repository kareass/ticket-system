"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import { Button, Card, DatePicker, Form, Input, Select, Switch } from "antd";
import type { WorkOrder, WorkOrderStatus } from "@/types";
import { today } from "@/lib/utils";
import SystemSelect from "@/components/common/SystemSelect";

// 工单状态可选项（与列表页内联可改一致：新建/已处理/已关闭）
const STATUS_OPTIONS: { label: WorkOrderStatus; value: WorkOrderStatus }[] = [
  { label: "新建", value: "新建" },
  { label: "已处理", value: "已处理" },
  { label: "已关闭", value: "已关闭" },
];

/**
 * 工单表单提交值
 * - date 已格式化为 YYYY-MM-DD 字符串，与 WorkOrder.date / mock 口径一致
 * - status 为工单状态（新建/已处理/已关闭）
 * - 创建页 / 编辑页在 onSubmit 中据此组装完整 WorkOrder 写入 store
 */
export interface WorkOrderFormValues {
  /** 日期（YYYY-MM-DD） */
  date: string;
  /** 标题 */
  title: string;
  /** 工单内容 */
  content: string;
  /** 系统 */
  system: string;
  /** 是否转需求（本期仅记录标记，自动同步为后续环节） */
  isConvertToRequirement: boolean;
  /** 工单状态 */
  status: WorkOrderStatus;
  /** 备注（可空） */
  remark?: string;
}

interface WorkOrderFormProps {
  /** 创建 / 编辑模式 */
  mode: "create" | "edit";
  /**
   * 编辑回填的原始工单字段（date 为字符串，组件内转成 dayjs 供 DatePicker 使用）。
   * 仅 mode="edit" 需要传入。
   */
  initialValues?: Partial<WorkOrder>;
  /** 校验通过后的提交回调，date 已格式化为 YYYY-MM-DD */
  onSubmit: (values: WorkOrderFormValues) => void | Promise<void>;
  /**
   * 取消按钮回调；缺省时组件内部执行 router.back()。
   * 说明：创建/编辑入口均来自列表页，back() 可靠返回列表；留 onCancel 以便后续复用方覆盖。
   */
  onCancel?: () => void;
}

/** antd Form 字段形态：日期为 dayjs 对象，其余为字符串/布尔 */
interface WorkOrderFormFields {
  date?: Dayjs;
  title?: string;
  content?: string;
  system?: string;
  isConvertToRequirement?: boolean;
  status?: WorkOrderStatus;
  remark?: string;
}

/**
 * SystemSelect 在 Form.Item 中的适配壳。
 * Form.Item 会把 value/onChange 注入直接子元素，因此这里用组件转发给 SystemSelect，
 * 外层 div 撑满表单项宽度（antd Select 默认按内容宽度显示，不撑满）。
 */
function SystemSelectFormField(props: {
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <div style={{ width: "100%" }}>
      <SystemSelect value={props.value} onChange={props.onChange} />
    </div>
  );
}

/** 组装 antd Form 的 initialValues：date 字符串转 dayjs；创建模式默认今天 + WMS + 新建 */
function buildFormInitial(
  mode: "create" | "edit",
  initialValues?: Partial<WorkOrder>,
): Partial<WorkOrderFormFields> {
  if (mode === "create") {
    return {
      date: dayjs(),
      system: "WMS",
      isConvertToRequirement: false,
      status: "新建",
    };
  }
  return {
    date: initialValues?.date ? dayjs(initialValues.date) : undefined,
    title: initialValues?.title,
    content: initialValues?.content,
    system: initialValues?.system,
    isConvertToRequirement: initialValues?.isConvertToRequirement,
    status: initialValues?.status,
    remark: initialValues?.remark,
  };
}

/**
 * 工单表单组件（创建 / 编辑复用）
 * - 字段：日期、标题、工单内容、系统（复用 SystemSelect）、是否转需求、备注
 * - 必填项带中文校验；提交前 antd 校验，通过后回调 onSubmit(格式化值)
 */
export default function WorkOrderForm({
  mode,
  initialValues,
  onSubmit,
  onCancel,
}: WorkOrderFormProps) {
  const router = useRouter();
  // 提交中状态：mock 为同步写入，仍保留 loading 位，后续接真实 API 可感知
  const [submitting, setSubmitting] = useState(false);

  const cardTitle = mode === "create" ? "新建工单" : "编辑工单";
  const submitText = mode === "create" ? "创建工单" : "保存修改";

  // antd Form 的 initialValues 只在首次挂载时读取；页面每次进入都会重新挂载，使用 useMemo 无副作用
  const formInitialValues = useMemo(
    () => buildFormInitial(mode, initialValues),
    [mode, initialValues],
  );

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
      return;
    }
    router.back();
  };

  const handleFinish = async (values: WorkOrderFormFields) => {
    setSubmitting(true);
    try {
      const payload: WorkOrderFormValues = {
        // date 必填（规则兜底），此处仅在理论上为空时退回今天
        date: values.date ? values.date.format("YYYY-MM-DD") : today(),
        title: (values.title ?? "").trim(),
        content: (values.content ?? "").trim(),
        system: values.system ?? "",
        isConvertToRequirement: values.isConvertToRequirement ?? false,
        // status 有默认值（create=新建），兜底防止为空
        status: values.status ?? "新建",
        // 备注始终显式传字符串（清空时传 ""）：undefined 会被 JSON 丢弃，
        // 导致编辑时「清空备注」无法下发到后端（后端仅在收到 key 时才置空）
        remark: values.remark?.trim() ?? "",
      };
      await onSubmit(payload);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card title={cardTitle}>
      {/* 限制表单列宽，避免整卡宽度下输入框过长 */}
      <div style={{ maxWidth: 640 }}>
        <Form<WorkOrderFormFields>
          layout="vertical"
          initialValues={formInitialValues}
          onFinish={handleFinish}
        >
          <Form.Item
            label="日期"
            name="date"
            rules={[{ required: true, message: "请选择日期" }]}
          >
            <DatePicker
              style={{ width: "100%" }}
              placeholder="请选择日期"
              allowClear={false}
            />
          </Form.Item>

          <Form.Item
            label="标题"
            name="title"
            rules={[{ required: true, whitespace: true, message: "请输入标题" }]}
          >
            <Input placeholder="请输入标题，如：WMS 出库单打印优化" />
          </Form.Item>

          <Form.Item
            label="工单内容"
            name="content"
            rules={[
              { required: true, whitespace: true, message: "请输入工单内容" },
            ]}
          >
            <Input.TextArea
              rows={4}
              placeholder="请描述工单内容、背景与期望结果"
            />
          </Form.Item>

          <Form.Item
            label="系统"
            name="system"
            rules={[{ required: true, message: "请选择系统" }]}
          >
            <SystemSelectFormField />
          </Form.Item>

          <Form.Item
            label="状态"
            name="status"
            rules={[{ required: true, message: "请选择工单状态" }]}
            extra="新建 / 已处理 / 已关闭，可随工单处理进度手动调整"
          >
            <Select
              style={{ width: "100%" }}
              placeholder="请选择工单状态"
              options={STATUS_OPTIONS}
            />
          </Form.Item>

          <Form.Item
            label="是否转需求"
            name="isConvertToRequirement"
            valuePropName="checked"
            extra="转需求时可从列表操作列一键转换（自动生成需求并置为「是」）；此处仅用于手工修正标记"
          >
            <Switch />
          </Form.Item>

          <Form.Item label="备注" name="remark">
            <Input.TextArea
              rows={2}
              placeholder="选填，补充说明（如关联业务、经办人等）"
            />
          </Form.Item>

          <div style={{ marginTop: 8 }}>
            <Button type="primary" htmlType="submit" loading={submitting}>
              {submitText}
            </Button>
            <Button style={{ marginLeft: 8 }} onClick={handleCancel}>
              取消
            </Button>
          </div>
        </Form>
      </div>
    </Card>
  );
}
