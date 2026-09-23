"use client";

import React, { useEffect, useMemo } from "react";
import { Button, DatePicker, Form, Input, Space } from "antd";
import dayjs from "dayjs";
import PersonSelect from "@/components/common/PersonSelect";
import { useAppStore } from "@/store/store";
import type { Meeting } from "@/types";

const { TextArea } = Input;

/** 表单控件宽度（与项目既有表单一致：按选项文案长度取定值，不一律撑满） */
const WIDTH = {
  date: 160,
  title: 360,
  person: 360,
};

export interface MeetingFormValues {
  date: dayjs.Dayjs;
  title: string;
  attendees?: string[];
  recorder?: string;
  content?: string;
}

interface MeetingFormProps {
  /** 编辑时传入；新建时不传 */
  initial?: Meeting;
  submitting?: boolean;
  onSubmit: (values: MeetingFormValues) => void | Promise<void>;
  onCancel: () => void;
}

export default function MeetingForm({
  initial,
  submitting,
  onSubmit,
  onCancel,
}: MeetingFormProps) {
  const [form] = Form.useForm<MeetingFormValues>();
  const meetings = useAppStore((s) => s.meetings);

  const formInitialValues = useMemo<Partial<MeetingFormValues>>(
    () => ({
      date: initial?.date ? dayjs(initial.date) : dayjs(),
      title: initial?.title ?? "",
      attendees: initial?.attendees ?? [],
      recorder: initial?.recorder,
      content: initial?.content,
    }),
    [initial],
  );

  // antd DatePicker 首次渲染可能返回 undefined，需用 setFieldsValue 同步兜底
  useEffect(() => {
    form.setFieldsValue(formInitialValues as MeetingFormValues);
  }, [form, formInitialValues]);

  // 候选人名：已加载的全部纪要里出现过的参会人与记录人，去重排序
  const personOptions = useMemo(() => {
    const set = new Set<string>();
    for (const m of meetings) {
      m.attendees.forEach((n) => set.add(n));
      if (m.recorder) set.add(m.recorder);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [meetings]);

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={formInitialValues}
      onFinish={onSubmit as never}
    >
      <Form.Item
        name="date"
        label="日期"
        rules={[{ required: true, message: "请选择日期" }]}
      >
        <DatePicker style={{ width: WIDTH.date }} placeholder="请选择日期" />
      </Form.Item>

      <Form.Item
        name="title"
        label="主题"
        rules={[{ required: true, message: "请填写会议主题" }]}
      >
        <Input style={{ width: WIDTH.title }} placeholder="如：周例会" maxLength={120} />
      </Form.Item>

      <Form.Item name="attendees" label="参会人">
        <PersonSelect
          multiple
          options={personOptions}
          placeholder="输入人名后回车，或从下拉中选择"
          style={{ width: WIDTH.person }}
        />
      </Form.Item>

      <Form.Item name="recorder" label="记录人">
        <PersonSelect
          options={personOptions}
          placeholder="输入或选择记录人"
          style={{ width: WIDTH.person }}
        />
      </Form.Item>

      <Form.Item name="content" label="会议内容">
        <TextArea rows={6} placeholder="会议讨论了什么、有什么结论" />
      </Form.Item>

      <Form.Item>
        <Space>
          <Button type="primary" htmlType="submit" loading={submitting}>
            保存
          </Button>
          <Button onClick={onCancel}>取消</Button>
        </Space>
      </Form.Item>
    </Form>
  );
}
