"use client";

import type { ReactNode } from "react";
import type { SortState } from "@/lib/sortRows";

export interface SortableHeaderProps<T> {
  /** 列名文本 */
  label: ReactNode;
  /** 该列对应的排序字段 */
  field: keyof T;
  /** 当前排序状态；null 表示未排序 */
  sort: SortState<T> | null;
  /** 双击时回调，由页面负责三态循环 */
  onToggle: (field: keyof T) => void;
}

/**
 * 可排序的列头：**双击**切换排序。
 *
 * 为什么不用 antd 内置 sorter 默认的单击：
 *   本项目的 ProTable 表头已用于拖拽调整列顺序（ProTable.tsx 的 HeaderCell）。
 *   若排序是单击触发，「按下鼠标准备拖列、但没移动就松手」会被判成一次点击，
 *   从而误触发排序。双击把两个手势分开。
 *
 * 指示符画在列名**左侧**：右侧要留给 ProTable 右缘那个 6px 的拖宽手柄
 * （z-index: 1），画在右边会被它盖住。
 *
 * 未排序时显示灰色 ⇅，用来提示该列「可排序」—— 双击手势不像单击那样
 * 一眼能看出来，需要这个视觉线索。
 */
export default function SortableHeader<T>({
  label,
  field,
  sort,
  onToggle,
}: SortableHeaderProps<T>) {
  const active = sort !== null && sort.field === field;
  const order = active && sort ? sort.order : null;

  return (
    <span
      onDoubleClick={() => onToggle(field)}
      title="双击排序：升序 → 降序 → 取消"
      style={{ cursor: "pointer", userSelect: "none" }}
    >
      <span
        aria-hidden="true"
        style={{
          display: "inline-block",
          width: 10,
          marginRight: 2,
          fontSize: 10,
          color: active ? "#1677ff" : "#bfbfbf",
        }}
      >
        {order === "ascend" ? "▲" : order === "descend" ? "▼" : "⇅"}
      </span>
      {label}
    </span>
  );
}
