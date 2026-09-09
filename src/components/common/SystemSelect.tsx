"use client";

import { Select } from "antd";
import { SYSTEM_OPTIONS } from "@/types";

// 系统下拉可选项：由全局系统枚举 SYSTEM_OPTIONS 映射为 antd 所需结构
const systemSelectOptions: { label: string; value: string }[] =
  SYSTEM_OPTIONS.map((item) => ({ label: item, value: item }));

interface SystemSelectProps {
  /** 当前选中的系统值（受控） */
  value?: string;
  /** 选中变化回调 */
  onChange?: (value: string) => void;
  /** 是否禁用 */
  disabled?: boolean;
  /** 未选中时的占位提示 */
  placeholder?: string;
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
}: SystemSelectProps) {
  return (
    <Select
      value={value}
      onChange={onChange}
      disabled={disabled}
      placeholder={placeholder ?? "请选择系统"}
      options={systemSelectOptions}
    />
  );
}
