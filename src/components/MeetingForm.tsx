"use client";

import React, { useEffect, useMemo } from "react";
import { Button, DatePicker, Form, Input, Space } from "antd";
import dayjs from "dayjs";
import PersonSelect, { PersonGroup, PersonName } from "@/components/common/PersonSelect";
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

  /** 候选上限：超过就只保留最常用的 30 个，冷门的靠用户直接打字 */
  const MAX_CANDIDATES = 30;
  /** 只统计最近这么多条纪要 —— 避免多年前的一次性人名长期占位 */
  const RECENT_WINDOW = 200;

  // 候选人名：按出现次数分组 + 封顶 30
  const personOptionGroups = useMemo<PersonGroup[]>(() => {
    const recent = meetings.slice(0, RECENT_WINDOW);
    const stat = new Map<
      string,
      { count: number; lastSeen: number }
    >();
    recent.forEach((m, idx) => {
      const names = [...m.attendees, ...(m.recorder ? [m.recorder] : [])];
      for (const raw of names) {
        const name = raw.trim();
        if (!name) continue;
        const cur = stat.get(name);
        if (cur) {
          cur.count += 1;
          cur.lastSeen = Math.min(cur.lastSeen, idx);
        } else {
          stat.set(name, { count: 1, lastSeen: idx });
        }
      }
    });

    const sorted: [string, { count: number; lastSeen: number }][] = [...stat.entries()].sort(
      ([na, a], [nb, b]) =>
        b.count - a.count ||
        a.lastSeen - b.lastSeen ||
        na.localeCompare(nb, "zh-CN"),
    );

    const frequent: PersonName[] = [];
    const others: PersonName[] = [];
    for (const [name, s] of sorted) {
      if (frequent.length + others.length >= MAX_CANDIDATES) break;
      if (s.count >= 2 && frequent.length < MAX_CANDIDATES) frequent.push({ name, count: s.count });
      else others.push({ name, count: s.count });
    }

    return [
      { label: "常用", names: frequent },
      { label: "其他", names: others },
    ];
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
          optionGroups={personOptionGroups}
          placeholder="输入人名后回车，或从下拉中选择"
          style={{ width: WIDTH.person }}
        />
      </Form.Item>

      <Form.Item name="recorder" label="记录人">
        <PersonSelect
          optionGroups={personOptionGroups}
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
