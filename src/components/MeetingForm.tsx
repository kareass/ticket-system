"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button, DatePicker, Form, Input, message, Space, Upload } from "antd";
import { UploadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import PersonSelect, { PersonGroup, PersonName } from "@/components/common/PersonSelect";
import { useAppStore } from "@/store/store";
import { meetingApi } from "@/lib/api";
import { toErrorMessage } from "@/lib/errors";
import type { Meeting } from "@/types";
import AttachmentList from "@/components/common/AttachmentList";
import FormShell from "@/components/common/FormShell";

const { TextArea } = Input;

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
  /** 编辑模式传入：用于渲染「已有附件」区，并支持立即上传 */
  meetingId?: string;
  submitting?: boolean;
  onSubmit: (values: MeetingFormValues) => void | Promise<void>;
  onCancel: () => void;
  /** 新建模式使用：把用户选中的文件交回给页面，等纪要建好后再传 */
  onPendingFilesChange?: (files: File[]) => void;
}

export default function MeetingForm({
  initial,
  meetingId,
  submitting,
  onSubmit,
  onCancel,
  onPendingFilesChange,
}: MeetingFormProps) {
  const [form] = Form.useForm<MeetingFormValues>();
  const meetings = useAppStore((s) => s.meetings);
  const addMeetingAttachment = useAppStore((s) => s.addMeetingAttachment);

  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  // 与工单/需求表单同一套口径：有初值即编辑态。会议表单没有 mode 参数
  // （新建页不传 initial、编辑页传），因此由 initial 是否存在反推。
  const isEdit = Boolean(initial);
  const pageTitle = isEdit ? "编辑会议纪要" : "新建会议纪要";
  const submitText = isEdit ? "保存修改" : "创建纪要";

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

  // antd DatePicker 首次渲染可能返回 undefined，需用 setFieldsValue 同步兜底。
  //
  // ⚠️ 只在「换成了另一条纪要」时灌一次，**绝不能用 initial / formInitialValues
  // 的对象身份做依赖**：附件上传/删除会让 store 里这条纪要变成新对象，从而重跑
  // 本 effect，把用户正在输入的内容覆盖回已保存的值（静默丢草稿）。
  const appliedKeyRef = useRef<string>("");
  useEffect(() => {
    const key = initial?.id ?? "__new__";
    if (appliedKeyRef.current === key) return;
    appliedKeyRef.current = key;
    form.setFieldsValue(formInitialValues as MeetingFormValues);
  }, [form, initial?.id, formInitialValues]);

  // 新建模式：把待传文件同步给页面（页面在保存成功后负责上传）
  useEffect(() => {
    onPendingFilesChange?.(pendingFiles);
  }, [pendingFiles, onPendingFilesChange]);

  // 编辑模式：立传立得
  const handleImmediateUpload = async (file: File) => {
    if (!meetingId) return;
    try {
      const att = await meetingApi.uploadAttachment(meetingId, file);
      addMeetingAttachment(meetingId, att);
      message.success(`「${file.name}」已上传`);
    } catch (e) {
      message.error(toErrorMessage(e));
    }
  };

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
    <FormShell<MeetingFormValues>
      title={pageTitle}
      form={form}
      initialValues={formInitialValues}
      onFinish={onSubmit}
      submitText={submitText}
      submitting={submitting}
      onCancel={onCancel}
    >
      {/* 第一行：日期 + 主题。主题占两格并限宽 —— 它是本表单唯一的长单行输入 */}
      <Form.Item
        name="date"
        label="日期"
        rules={[{ required: true, message: "请选择日期" }]}
      >
        <DatePicker placeholder="请选择日期" />
      </Form.Item>

      <Form.Item
        name="title"
        label="主题"
        className="span-2"
        rules={[{ required: true, message: "请填写会议主题" }]}
      >
        <Input className="narrow" placeholder="如：周例会" maxLength={120} />
      </Form.Item>

      {/* 第二行：参会人占两格（多人标签要横向空间），记录人一格 */}
      <Form.Item name="attendees" label="参会人" className="span-2">
        <PersonSelect
          multiple
          optionGroups={personOptionGroups}
          placeholder="输入人名后回车，或从下拉中选择"
        />
      </Form.Item>

      <Form.Item name="recorder" label="记录人">
        <PersonSelect
          optionGroups={personOptionGroups}
          placeholder="输入或选择记录人"
        />
      </Form.Item>

      <Form.Item name="content" label="会议内容" className="span-all">
        <TextArea rows={6} placeholder="会议讨论了什么、有什么结论" />
      </Form.Item>

      {/* 附件：把「保存后才上传」这条关键差别放进字段说明（extra），
          与其余表单的提示同一处、同一字号，不再单独排一个 Typography */}
      <Form.Item
        label="附件"
        className="span-all"
        extra={
          meetingId
            ? "点「打开」下载；删除不可恢复。"
            : "保存后才会开始上传。"
        }
      >
        {meetingId ? (
          <Space direction="vertical" style={{ width: "100%" }} size={12}>
            <Upload
              beforeUpload={(file) => {
                void handleImmediateUpload(file);
                return false; // 阻止 antd 自己发请求，一律走我们的接口
              }}
              showUploadList={false}
              multiple
            >
              <Button icon={<UploadOutlined />}>上传附件</Button>
            </Upload>
            <AttachmentList
              meetingId={meetingId}
              attachments={initial?.attachments ?? []}
            />
          </Space>
        ) : (
          <Upload
            beforeUpload={(file) => {
              setPendingFiles((prev) => [...prev, file]);
              return false;
            }}
            onRemove={(file) => {
              setPendingFiles((prev) => prev.filter((f) => f.name !== file.name));
            }}
            multiple
          >
            <Button icon={<UploadOutlined />}>选择文件</Button>
          </Upload>
        )}
      </Form.Item>
    </FormShell>
  );
}
