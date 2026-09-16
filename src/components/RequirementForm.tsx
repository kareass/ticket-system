"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import { Button, Card, DatePicker, Form, Input, Select, Switch } from "antd";
import type { Requirement, RequirementNode } from "@/types";
import { NODE_OPTIONS, YES_NO_OPTIONS, asSelectOptions } from "@/types";
import { diffDays, today } from "@/lib/utils";
import SystemSelect from "@/components/common/SystemSelect";

/**
 * 需求表单提交值
 * - date / releaseDate 已格式化为 YYYY-MM-DD 字符串，与 Requirement / mock 口径一致
 * - developmentDays 为按规则自动计算的结果（非用户输入），随提交值一并给出，
 *   供创建/编辑页直接落库，保证列表展示与表单预览口径一致
 */
export interface RequirementFormValues {
  /** 日期（YYYY-MM-DD） */
  date: string;
  /** 需求 ID（业务编号，必填） */
  requirementId: string;
  /** 需求标题（可空） */
  title?: string;
  /** 需求内容（可空） */
  content?: string;
  /** 系统 */
  system: string;
  /** 当前节点 */
  currentNode: RequirementNode;
  /** 是否加急（是/否，默认否） */
  isUrgent: boolean;
  /** 是否发版 */
  isReleased: boolean;
  /** 发版时间（仅 isReleased=true 时必填） */
  releaseDate?: string;
  /** 备注（可空） */
  remark?: string;
  /** 开发时长（天，自动计算，未发版 date→今天；已发版 date→发版时间） */
  developmentDays: number;
}

interface RequirementFormProps {
  /** 创建 / 编辑模式 */
  mode: "create" | "edit";
  /**
   * 编辑回填的原始需求字段（date/releaseDate 为字符串，组件内转成 dayjs 供 DatePicker 使用）。
   * 仅 mode="edit" 需要传入。
   */
  initialValues?: Partial<Requirement>;
  /** 校验通过后的提交回调，date/releaseDate 已格式化为 YYYY-MM-DD */
  onSubmit: (values: RequirementFormValues) => void | Promise<void>;
  /**
   * 取消按钮回调；缺省时组件内部执行 router.back()。
   * 说明：创建/编辑入口均来自列表页，back() 可靠返回列表；留 onCancel 以便后续复用方覆盖。
   */
  onCancel?: () => void;
}

/** antd Form 字段形态：日期为 dayjs 对象，其余为字符串/布尔 */
interface RequirementFormFields {
  date?: Dayjs;
  requirementId?: string;
  title?: string;
  content?: string;
  system?: string;
  currentNode?: RequirementNode;
  isUrgent?: boolean;
  isReleased?: boolean;
  releaseDate?: Dayjs;
  remark?: string;
}

/** 当前节点下拉选项：唯一来源 src/types */
const nodeOptions = asSelectOptions(NODE_OPTIONS);

/** 是否加急下拉选项：是/否（唯一来源 src/types） */
const urgentOptions = YES_NO_OPTIONS;

/**
 * 开发时长计算规则（表单实时预览与提交落库统一走此函数）：
 * - 已发版且有发版时间：date → releaseDate 的天数
 * - 未发版（或发版时间未填）：date → 今天 的天数
 * 天数按 utils.diffDays 计算（含当天为第 1 天），下限收敛到 0。
 */
function calcDevDaysFromFields(
  date?: Dayjs,
  isReleased?: boolean,
  releaseDate?: Dayjs,
): number {
  if (!date) return 0;
  const start = date.format("YYYY-MM-DD");
  if (isReleased && releaseDate) {
    return Math.max(0, diffDays(start, releaseDate.format("YYYY-MM-DD")));
  }
  return Math.max(0, diffDays(start));
}

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

/**
 * 下拉框/日期选择器宽度（px）：按选项文案实际长度取值。
 * 表单容器统一 960px，控件不再一律撑满，避免仅 2~5 个字的下拉框被拉成整行。
 */
const WIDTH = {
  /** 日期 / 发版时间：YYYY-MM-DD */
  date: 160,
  /** 系统：WMS / ERP / TMS / SCM / 追溯中心 / 其他 */
  system: 160,
  /** 当前节点：方案中 / 开发中 / 测试中 / 已合并 / 已发布 */
  currentNode: 180,
  /** 是否加急：是 / 否 */
  isUrgent: 120,
} as const;

/** 组装 antd Form 的 initialValues：date/releaseDate 字符串转 dayjs；创建模式默认今天 + WMS + 方案中 */
function buildFormInitial(
  mode: "create" | "edit",
  initialValues?: Partial<Requirement>,
): Partial<RequirementFormFields> {
  if (mode === "create") {
    return {
      date: dayjs(),
      requirementId: "",
      system: "WMS",
      currentNode: "方案中",
      isUrgent: false,
      isReleased: false,
    };
  }
  return {
    date: initialValues?.date ? dayjs(initialValues.date) : undefined,
    requirementId: initialValues?.requirementId,
    title: initialValues?.title,
    content: initialValues?.content,
    system: initialValues?.system,
    currentNode: initialValues?.currentNode,
    isUrgent: initialValues?.isUrgent ?? false,
    isReleased: initialValues?.isReleased ?? false,
    releaseDate: initialValues?.releaseDate
      ? dayjs(initialValues.releaseDate)
      : undefined,
    remark: initialValues?.remark,
  };
}

/**
 * 需求表单组件（创建 / 编辑复用）
 * - 字段：日期、需求ID、需求标题、需求内容、系统（复用 SystemSelect）、当前节点、是否发版、备注
 * - 发版时间联动：仅当「是否发版」开启时显示且必填；关闭时用 preserve=false 卸载并清空该字段
 * - 开发时长：只读实时预览（不可编辑、不占表单项），随 日期/是否发版/发版时间 联动
 * - 提交：date/releaseDate 转 YYYY-MM-DD 字符串，并携带按规则算好的 developmentDays
 */
export default function RequirementForm({
  mode,
  initialValues,
  onSubmit,
  onCancel,
}: RequirementFormProps) {
  const router = useRouter();
  const [form] = Form.useForm<RequirementFormFields>();
  // 提交中状态：mock 为同步写入，仍保留 loading 位，后续接真实 API 可感知
  const [submitting, setSubmitting] = useState(false);

  const cardTitle = mode === "create" ? "新建需求" : "编辑需求";
  const submitText = mode === "create" ? "创建需求" : "保存修改";

  // antd Form 的 initialValues 只在首次挂载时读取；页面每次进入都会重新挂载，使用 useMemo 无副作用
  const formInitialValues = useMemo(
    () => buildFormInitial(mode, initialValues),
    [mode, initialValues],
  );

  // 联动监听：是否发版控制「发版时间」显隐；日期/是否发版/发版时间共同决定「开发时长」预览
  const watchedDate = Form.useWatch("date", form);
  const watchedIsReleased = Form.useWatch("isReleased", form);
  const watchedReleaseDate = Form.useWatch("releaseDate", form);

  // 开发时长只读预览：随受控值变化实时更新
  const devDays = useMemo(
    () => calcDevDaysFromFields(watchedDate, watchedIsReleased, watchedReleaseDate),
    [watchedDate, watchedIsReleased, watchedReleaseDate],
  );

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
      return;
    }
    router.back();
  };

  const handleFinish = async (values: RequirementFormFields) => {
    setSubmitting(true);
    try {
      const payload: RequirementFormValues = {
        // date 必填（规则兜底），此处仅在理论上为空时退回今天
        date: values.date ? values.date.format("YYYY-MM-DD") : today(),
        requirementId: (values.requirementId ?? "").trim(),
        // 标题/内容始终显式传字符串（清空时传 ""）：undefined 会被 JSON 丢弃，
        // 导致编辑时「清空字段」无法下发到后端（后端仅在收到 key 时才置空）
        title: values.title?.trim() ?? "",
        content: values.content?.trim() ?? "",
        system: values.system ?? "",
        currentNode: values.currentNode ?? "方案中",
        isUrgent: values.isUrgent ?? false,
        isReleased: values.isReleased ?? false,
        // 未发版时不保留发版时间（即使字段曾填过，卸载时 preserve=false 已清空，这里再兜底一次）
        releaseDate:
          values.isReleased && values.releaseDate
            ? values.releaseDate.format("YYYY-MM-DD")
            : undefined,
        remark: values.remark?.trim() ?? "",
        developmentDays: calcDevDaysFromFields(
          values.date,
          values.isReleased,
          values.isReleased ? values.releaseDate : undefined,
        ),
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
        <Form<RequirementFormFields>
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

          {/* 开发时长：只读展示，非表单项（无 name），不写入提交的字段集合 */}
          <Form.Item
            label="开发时长"
            extra="自动计算、不可编辑：未发版为「日期 → 今天」，已发版为「日期 → 发版时间」，含当天。"
          >
            <span style={{ fontSize: 16, fontWeight: 600 }}>{devDays} 天</span>
          </Form.Item>

          <Form.Item
            label="需求ID"
            name="requirementId"
            rules={[
              { required: true, whitespace: true, message: "请输入需求ID" },
            ]}
          >
            <Input
              placeholder={
                mode === "create"
                  ? "如 R-2026-001（新建需求编号，需唯一）"
                  : "请输入需求ID"
              }
            />
          </Form.Item>

          <Form.Item label="需求标题" name="title">
            <Input placeholder="选填，如：WMS 出库单打印优化" />
          </Form.Item>

          <Form.Item label="需求内容" name="content">
            <Input.TextArea
              rows={6}
              placeholder="选填，描述需求背景、范围与验收期望"
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
            label="当前节点"
            name="currentNode"
            rules={[{ required: true, message: "请选择当前节点" }]}
          >
            <Select
              style={{ width: WIDTH.currentNode }}
              placeholder="请选择当前节点"
              options={nodeOptions}
            />
          </Form.Item>

          <Form.Item
            label="是否加急"
            name="isUrgent"
            rules={[{ required: true, message: "请选择是否加急" }]}
          >
            <Select
              style={{ width: WIDTH.isUrgent }}
              placeholder="请选择是否加急"
              options={urgentOptions}
            />
          </Form.Item>

          <Form.Item
            label="是否发版"
            name="isReleased"
            valuePropName="checked"
            extra="开启后需选择发版时间，开发时长将按「日期 → 发版时间」计算。"
          >
            <Switch />
          </Form.Item>

          {/* 发版时间联动：仅当 isReleased=true 渲染且必填；关闭时卸载（preserve=false）自动清空残留值 */}
          {watchedIsReleased ? (
            <Form.Item
              label="发版时间"
              name="releaseDate"
              preserve={false}
              rules={[{ required: true, message: "请选择发版时间" }]}
            >
              <DatePicker
                style={{ width: WIDTH.date }}
                placeholder="请选择发版时间"
                allowClear={false}
              />
            </Form.Item>
          ) : null}

          <Form.Item label="备注" name="remark">
            <Input.TextArea
              rows={4}
              placeholder="选填，补充说明（如关联工单、经办人等）"
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
