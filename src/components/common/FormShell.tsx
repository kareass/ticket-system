"use client";

import type { ReactNode } from "react";
import type { FormInstance, FormProps } from "antd";
import { Button, Form } from "antd";

import Surface from "@/components/common/Surface";

interface FormShellProps<T> {
  /** 页面标题（新建工单 / 编辑需求 …） */
  title: string;
  form: FormInstance<T>;
  initialValues: Partial<T>;
  onFinish: FormProps<T>["onFinish"];
  /** 主按钮文案（创建工单 / 保存修改） */
  submitText: string;
  submitting?: boolean;
  onCancel: () => void;
  /** 字段（Form.Item），由各表单自己排 */
  children: ReactNode;
}

/**
 * 表单页外壳 —— 四个表单（工单 / 需求 / 会议 / 提醒）共用的骨架。
 *
 * 为什么收成一处：这四个表单原本有两套壳，两个套 antd `Card`、两个**裸奔**在页面
 * 地色上（连容器都没有）；字段宽度、保存按钮、提示文案各写了一遍，改一处必然漏三处。
 * 骨架收进来之后，四个表单只剩「有哪些字段」这一件事。
 *
 * 版面是**一块板、三段**，和列表页的「板一（页头）+ 板二（表格）」同源：
 *   标题（.page-head）│ 发丝线 │ 字段网格 │ 发丝线 │ 动作条
 * 不再用 antd Card 当壳：Card 自带边框与圆角，而本方向的面是**无边框**、只靠极柔
 * 投影从地色上浮起来的（见 Surface 的注释），用 Card 得逐处抵消它的边框。
 *
 * 板宽限死 960px：表单不是密表。横向铺满整屏时，视线要在标签与控件之间长途跋涉。
 */
export default function FormShell<T>({
  title,
  form,
  initialValues,
  onFinish,
  submitText,
  submitting,
  onCancel,
  children,
}: FormShellProps<T>) {
  return (
    <Surface style={{ maxWidth: 960 }}>
      <div className="page-head">
        <h1>{title}</h1>
      </div>

      <Form<T>
        className="form-grid"
        form={form}
        layout="vertical"
        initialValues={initialValues}
        onFinish={onFinish}
      >
        {children}

        {/* 动作条压在发丝线下面，与字段分开 —— 保存不是「最后一个字段」。
            主按钮在左、取消在右，与列表页 .page-tools 的动作排布一致。 */}
        <div className="span-all form-actions">
          <Button type="primary" htmlType="submit" loading={submitting}>
            {submitText}
          </Button>
          <Button onClick={onCancel}>取消</Button>
        </div>
      </Form>
    </Surface>
  );
}
