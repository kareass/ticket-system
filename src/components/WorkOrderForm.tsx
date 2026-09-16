"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import { Button, Card, DatePicker, Form, Input, Select, Switch } from "antd";
import type { WorkOrder, WorkOrderStatus } from "@/types";
import { WORK_ORDER_STATUS_OPTIONS, asSelectOptions } from "@/types";
import { today } from "@/lib/utils";
import SystemSelect from "@/components/common/SystemSelect";

// 工单状态可选项（唯一来源：src/types，与列表页内联可改共用同一份）
const STATUS_OPTIONS = asSelectOptions(WORK_ORDER_STATUS_OPTIONS);

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
  /** 是否转需求（为是时保存即按「需求ID」自动同步创建需求） */
  isConvertToRequirement: boolean;
  /** 工单状态 */
  status: WorkOrderStatus;
  /** 需求ID（业务编号；「是否转需求」为是时必填） */
  requirementId?: string;
  /** 需求内容（转需求时同步到需求表；留空则转出的需求内容也为空） */
  requirementContent?: string;
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
  requirementId?: string;
  requirementContent?: string;
  remark?: string;
}

/**
 * 下拉框/日期选择器宽度（px）：按选项文案实际长度取值。
 * 表单容器统一 960px，控件不再一律撑满，避免仅 2~5 个字的下拉框被拉成整行。
 */
const WIDTH = {
  /** 日期：YYYY-MM-DD */
  date: 160,
  /** 系统：WMS / ERP / OMS / TMS / 其他 */
  system: 160,
  /** 工单状态：新建 / 已处理 / 已关闭 */
  status: 160,
  /** 需求ID 文本：如 R-2026-001 */
  requirementId: 220,
} as const;

/**
 * SystemSelect 在 Form.Item 中的适配壳。
 * Form.Item 会把 value/onChange 注入直接子元素，因此这里用组件转发给 SystemSelect，
 * 并显式给定宽度（antd Select 宽度随内容/占位文案变化，不固定会出现选中后控件变窄的跳动）。
 */
function SystemSelectFormField(props: {
  value?: string;
  onChange?: (value: string) => void;
  width?: number;
}) {
  return (
    <SystemSelect
      value={props.value}
      onChange={props.onChange}
      style={{ width: props.width ?? WIDTH.system }}
    />
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
      requirementId: "",
      requirementContent: "",
    };
  }
  return {
    date: initialValues?.date ? dayjs(initialValues.date) : undefined,
    title: initialValues?.title,
    content: initialValues?.content,
    system: initialValues?.system,
    isConvertToRequirement: initialValues?.isConvertToRequirement,
    status: initialValues?.status,
    requirementId: initialValues?.requirementId,
    requirementContent: initialValues?.requirementContent,
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
  const [form] = Form.useForm<WorkOrderFormFields>();
  // 提交中状态：mock 为同步写入，仍保留 loading 位，后续接真实 API 可感知
  const [submitting, setSubmitting] = useState(false);

  const cardTitle = mode === "create" ? "新建工单" : "编辑工单";
  const submitText = mode === "create" ? "创建工单" : "保存修改";

  // 已转需求的工单：不允许在此关闭开关（需先删除关联需求），锁定并给出说明
  const convertedLocked =
    mode === "edit" && initialValues?.isConvertToRequirement === true;

  // antd Form 的 initialValues 只在首次挂载时读取；页面每次进入都会重新挂载，使用 useMemo 无副作用
  const formInitialValues = useMemo(
    () => buildFormInitial(mode, initialValues),
    [mode, initialValues],
  );

  // 「需求ID / 需求内容」仅服务于转需求：开关未开启时不可填写（设计方案「工单表」口径：
  // requirementId 仅当 isConvertToRequirement=true 时填充）。
  // useWatch 首次渲染可能尚未接上表单，回退到初值，避免编辑页出现一帧「误禁用」。
  // 注意：删除关联需求后工单会保留原编号且开关复位为否，此时字段只读展示，值不丢失。
  const watchedConvert = Form.useWatch("isConvertToRequirement", form);
  const convertOn =
    (watchedConvert ?? formInitialValues.isConvertToRequirement) === true;

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
        // 需求ID/需求内容同样显式传字符串，清空时后端才能置空
        requirementId: values.requirementId?.trim() ?? "",
        requirementContent: values.requirementContent?.trim() ?? "",
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
      {/* 限制表单列宽，避免整卡宽度下输入框过长；当前 960px */}
      <div style={{ maxWidth: 960 }}>
        <Form<WorkOrderFormFields>
          form={form}
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
              style={{ width: WIDTH.date }}
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
              rows={8}
              placeholder="请描述工单内容、背景与期望结果"
            />
          </Form.Item>

          <Form.Item
            label="系统"
            name="system"
            rules={[{ required: true, message: "请选择系统" }]}
          >
            <SystemSelectFormField width={WIDTH.system} />
          </Form.Item>

          <Form.Item
            label="状态"
            name="status"
            rules={[{ required: true, message: "请选择工单状态" }]}
            extra="新建 / 已处理 / 已关闭，可随工单处理进度手动调整"
          >
            <Select
              style={{ width: WIDTH.status }}
              placeholder="请选择工单状态"
              options={STATUS_OPTIONS}
            />
          </Form.Item>

          <Form.Item
            label="是否转需求"
            name="isConvertToRequirement"
            valuePropName="checked"
            extra={
              convertedLocked
                ? `该工单已转为需求${initialValues?.requirementId ? `（${initialValues.requirementId}）` : ""}，如需取消请先在需求列表删除该需求。`
                : "开启后下方「需求ID」才可填写，保存时按其自动同步创建需求。若只想在列表点「转需求」，可不开此开关。"
            }
          >
            <Switch
              disabled={convertedLocked}
              onChange={(checked) => {
                // 关闭转需求时一并清空「需求ID / 需求内容」：这两个字段仅在转需求时有意义，
                // 否则会留下一个指向不存在需求的编号（要转需求可在列表点「转需求」填编号）
                // 开启时不做任何预填 —— 需求内容填什么就是什么，留空即转出「内容为空」的需求
                if (!checked) {
                  form.setFieldsValue({ requirementId: "", requirementContent: "" });
                }
              }}
            />
          </Form.Item>

          <Form.Item
            label="需求ID"
            name="requirementId"
            dependencies={["isConvertToRequirement"]}
            rules={[
              ({ getFieldValue }) => ({
                validator(_rule, value) {
                  // 仅「是否转需求=是」时必填（未开启时字段禁用，值恒为空）
                  if (getFieldValue("isConvertToRequirement") !== true) {
                    return Promise.resolve();
                  }
                  return String(value ?? "").trim()
                    ? Promise.resolve()
                    : Promise.reject(new Error("已开启转需求，需求ID 必填"));
                },
              }),
            ]}
            extra={
              convertOn
                ? "业务编号，需唯一（如 R-2026-001）；保存工单即按此编号创建需求"
                : "需先开启上方「是否转需求」；或留空，到列表操作列点「转需求」时再填写"
            }
          >
            <Input
              style={{ width: WIDTH.requirementId }}
              disabled={!convertOn}
              placeholder={convertOn ? "如 R-2026-001" : "请先开启「是否转需求」"}
            />
          </Form.Item>

          <Form.Item
            label="需求内容"
            name="requirementContent"
            extra="转需求时同步到需求表；留空则需求内容也为空（不会自动取标题）"
          >
            <Input.TextArea
              rows={6}
              disabled={!convertOn}
              placeholder={
                convertOn ? "选填，描述需求背景与验收期望" : "请先开启「是否转需求」"
              }
            />
          </Form.Item>

          <Form.Item label="备注" name="remark">
            <Input.TextArea
              rows={4}
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
