"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { DatePicker, Form, Input, Select } from "antd";
import dayjs from "dayjs";
import { REMINDEE_OPTIONS, asSelectOptions } from "@/types";
import type { Reminder } from "@/types";
import FormShell from "@/components/common/FormShell";

const { TextArea } = Input;

export interface ReminderFormValues {
  date: dayjs.Dayjs;
  remindee: string;
  content: string;
}

interface ReminderFormProps {
  /** 编辑时传入；新建时不传 */
  initial?: Reminder;
  submitting?: boolean;
  onSubmit: (values: ReminderFormValues) => void | Promise<void>;
  onCancel: () => void;
}

export default function ReminderForm({
  initial,
  submitting,
  onSubmit,
  onCancel,
}: ReminderFormProps) {
  const [form] = Form.useForm<ReminderFormValues>();

  const formInitialValues = useMemo<Partial<ReminderFormValues>>(
    () => ({
      // 新建时默认今天；编辑时用记录里已有的日期
      date: initial?.date ? dayjs(initial.date) : dayjs(),
      remindee: initial?.remindee,
      content: initial?.content ?? "",
    }),
    [initial],
  );

  // antd DatePicker 首次渲染可能返回 undefined，需用 setFieldsValue 同步兜底。
  // ⚠️ 只在「换成了另一条提醒」时灌一次，**绝不能用 initial / formInitialValues
  // 的对象身份做依赖** —— 否则 store 里这条提醒一旦变成新对象，本 effect 就会重跑，
  // 把用户正在输入的内容覆盖回已保存的值（静默丢草稿）。用 id 做 key 才对。
  const appliedKeyRef = useRef<string>("");
  useEffect(() => {
    const key = initial?.id ?? "__new__";
    if (appliedKeyRef.current === key) return;
    appliedKeyRef.current = key;
    form.setFieldsValue(formInitialValues as ReminderFormValues);
  }, [form, initial?.id, formInitialValues]);

  // 与工单/需求/会议表单同一套口径：有初值即编辑态（新建页不传 initial、编辑页传）
  const isEdit = Boolean(initial);

  return (
    <FormShell<ReminderFormValues>
      title={isEdit ? "编辑提醒" : "新建提醒"}
      form={form}
      initialValues={formInitialValues}
      onFinish={onSubmit}
      submitText={isEdit ? "保存修改" : "创建提醒"}
      submitting={submitting}
      onCancel={onCancel}
    >
      <Form.Item
        name="date"
        label="日期"
        rules={[{ required: true, message: "请选择日期" }]}
        extra="该办这件事的日子。到了日子仍未勾选完成，列表会把整行标红。"
      >
        <DatePicker placeholder="请选择日期" />
      </Form.Item>

      <Form.Item
        name="remindee"
        label="提醒人"
        rules={[{ required: true, message: "请选择提醒人" }]}
      >
        {/* 选项唯一来源 src/types —— 不得在此就地写数组 */}
        <Select
          placeholder="请选择提醒人"
          options={asSelectOptions(REMINDEE_OPTIONS)}
        />
      </Form.Item>

      {/* 提醒内容：本表单唯一的长文本，独占整行 */}
      <Form.Item
        name="content"
        label="提醒内容"
        className="span-all"
        rules={[{ required: true, whitespace: true, message: "请填写提醒内容" }]}
      >
        <TextArea
          rows={4}
          placeholder="要提醒什么事"
          maxLength={200}
          showCount
        />
      </Form.Item>
    </FormShell>
  );
}
