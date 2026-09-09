"use client";

/**
 * EditableChip —— 列表格内「好看的可点选值」：
 * 平时显示一个带语义色的小标签(Chip)，右带 ▼ 提示可改；点击后原地弹出 antd Select，
 * 选完立即收起并把新值交给 onChange（是否落库由调用方决定，配合 useRowDrafts 走“提交”门）。
 */
import { useState, type ReactNode } from "react";
import { Select, Tag } from "antd";

export interface ChipOption<V extends string | boolean> {
  label: string;
  value: V;
}

interface EditableChipProps<V extends string | boolean> {
  value: V;
  options: ChipOption<V>[];
  /** 根据当前值返回 Tag 颜色（antd 预设色或自定义），返回 undefined 即默认灰 */
  colorOf: (value: V) => string | undefined;
  onChange: (value: V) => void;
  /** 该字段当前为待提交状态时展示橙色小点 */
  dirty?: boolean;
  width?: number;
}

export default function EditableChip<V extends string | boolean>({
  value,
  options,
  colorOf,
  onChange,
  dirty,
  width = 120,
}: EditableChipProps<V>) {
  const [open, setOpen] = useState(false);

  const current = options.find((o) => o.value === value);
  const label = current ? current.label : String(value);

  // 收起态：带色 Chip + ▼ + 待提交小点
  if (!open) {
    return (
      <Tag
        color={colorOf(value)}
        onClick={() => setOpen(true)}
        style={{
          cursor: "pointer",
          marginInlineEnd: 0,
          userSelect: "none",
          transition: "box-shadow .2s",
        }}
        title="点击修改"
      >
        {label}
        <span
          style={{
            fontSize: 8,
            marginLeft: 4,
            opacity: 0.75,
            verticalAlign: "1px",
          }}
        >
          ▼
        </span>
        {dirty ? (
          <span
            style={{
              display: "inline-block",
              width: 6,
              height: 6,
              marginLeft: 5,
              borderRadius: "50%",
              background: "#fa8c16",
              verticalAlign: "1px",
            }}
          />
        ) : null}
      </Tag>
    );
  }

  // 编辑态：原地 Select（展开即聚焦，失焦/选中即收起）
  return (
    <Select<V>
      autoFocus
      open
      size="small"
      style={{ width }}
      value={value}
      options={options as never}
      onChange={(v) => {
        setOpen(false);
        onChange(v as V);
      }}
      onBlur={() => setOpen(false)}
      onClick={(e) => e.stopPropagation()}
      getPopupContainer={(node) => node.parentElement || document.body}
    />
  );
}
