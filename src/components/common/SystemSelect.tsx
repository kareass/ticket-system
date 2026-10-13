"use client";

import type { CSSProperties } from "react";
import { Select } from "antd";
import { SYSTEM_OPTIONS, asSelectOptions } from "@/types";

// 系统下拉可选项：唯一来源 src/types（前端表单/列表与后端枚举校验共用同一份取值）
const systemSelectOptions = asSelectOptions(SYSTEM_OPTIONS);

interface SystemSelectProps {
  /** 当前选中的系统值（受控） */
  value?: string;
  /** 选中变化回调 */
  onChange?: (value: string) => void;
  /** 是否禁用 */
  disabled?: boolean;
  /** 未选中时的占位提示 */
  placeholder?: string;
  /**
   * 自定义样式。**表单里一般不用传**：字段宽度由 `.form-grid` 按格宽统一给
   * （见 globals.css），传了 style 反而会以内联样式盖掉它。
   */
  style?: CSSProperties;
}

/**
 * 系统下拉组件
 * - 供工单表单与需求表单的「系统」字段复用，选项固定来自 SYSTEM_OPTIONS
 * - 默认值 WMS 由使用方表单（initialValue / defaultValue）控制，组件自身不写死默认值
 * - 纯受控展示组件：不含 mock 数据，不发起后端请求
 */
export default function SystemSelect({
  value,
  onChange,
  disabled,
  placeholder,
  style,
}: SystemSelectProps) {
  return (
    <Select
      value={value}
      onChange={onChange}
      disabled={disabled}
      placeholder={placeholder ?? "请选择系统"}
      options={systemSelectOptions}
      style={style}
    />
  );
}
