"use client";

/**
 * EditableChip —— 列表格内可点选的「整格下拉值」：
 * - 收起态不显示彩色标签：以普通文字（颜色与其它字段一致）平铺整个单元格，
 *   小三角 ▾ 置于格子最右侧，提示此处可下拉；
 * - 只要点击该格子即可触发下拉面板（面板宽度/文字颜色与字段一致）；
 * - 打开后当前值/原选项仍在原位显示，不被面板遮挡；选项选中项以固定浅灰底+对勾标注。
 * - 选中后交给 onChange（是否落库由调用方决定，配合 useRowDrafts 走“提交”门）。
 */
import { useEffect, useRef, useState } from "react";
import { DownOutlined } from "@ant-design/icons";
import { Dropdown, type MenuProps } from "antd";

import { MOSS } from "@/lib/theme";

export interface ChipOption<V extends string | boolean> {
  label: string;
  value: V;
}

interface EditableChipProps<V extends string | boolean> {
  value: V;
  options: ChipOption<V>[];
  onChange: (value: V) => void;
  /** 待提交态：整格铺强调色浅底 + 文字加粗 + 三角左侧一个小方点 */
  dirty?: boolean;
  /** 值为空时的占位（如「—」）。空值的格子若什么都不显示，用户看不出这里能点 */
  placeholder?: string;
  /**
   * 布尔字段为正（true）时的语义色。**只给本身即「例外」的列用** ——
   * 如「是否加急」（danger）、「是否发版」（accent）。
   * 不要给普通的是/否列上色：本方向里颜色是稀缺资源，
   * 一旦每列都着色，加急就淹没在一排彩色里，等于没有颜色。
   */
  tone?: "danger" | "accent";
}

export default function EditableChip<V extends string | boolean>({
  value,
  options,
  onChange,
  dirty,
  placeholder,
  tone,
}: EditableChipProps<V>) {
  const [open, setOpen] = useState(false);
  // 撑满整格：测量所在 td 的左右 padding，用负 margin 抵消，使三角真正贴格子最右、整格可点
  const rootRef = useRef<HTMLDivElement>(null);
  const [pad, setPad] = useState<{ left: number; right: number }>({
    left: 0,
    right: 0,
  });
  const [cellWidth, setCellWidth] = useState<number | undefined>(undefined);

  useEffect(() => {
    const td = rootRef.current?.parentElement;
    if (!td) return;
    const cs = window.getComputedStyle(td);
    const left = parseFloat(cs.paddingLeft) || 0;
    const right = parseFloat(cs.paddingRight) || 0;
    setPad({ left, right });
    // 面板宽度随字段宽度：取整格（含 padding）宽度
    const w = td.getBoundingClientRect().width;
    setCellWidth(w > 0 ? Math.round(w) : undefined);
  }, []);

  const current = options.find((o) => o.value === value);
  const label = current ? current.label : String(value);
  // 空值（未选/未登记）时显示占位并退到装饰灰：格子仍看得见是「一格」，而不是一片空白
  const isEmpty = label === "";
  // 文字色优先级：空值 > 语义色 > 常态
  const textColor = isEmpty
    ? MOSS.ornament
    : tone === "danger" && value === true
      ? MOSS.danger
      : tone === "accent" && value === true
        ? MOSS.accentInk
        : MOSS.ink;

  const items: MenuProps["items"] = options.map((opt) => ({
    key: String(opt.value),
    label: opt.label,
  }));

  const onClickItem: MenuProps["onClick"] = ({ key }) => {
    const hit = options.find((o) => String(o.value) === key);
    setOpen(false);
    if (hit) onChange(hit.value);
  };

  const handleOpenChange = (o: boolean) => {
    if (o) {
      const td = rootRef.current?.parentElement;
      if (td) {
        const w = td.getBoundingClientRect().width;
        if (w > 0) setCellWidth(Math.round(w));
      }
    }
    setOpen(o);
  };

  return (
    <Dropdown
      trigger={["click"]}
      open={open}
      onOpenChange={handleOpenChange}
      placement="bottomLeft"
      menu={{
        items,
        onClick: onClickItem,
        className: "ec-chip-dd",
        selectable: true,
        selectedKeys: [String(value)],
        style: { minWidth: cellWidth || undefined },
      }}
    >
      {/* 整格可点的触发区：负 margin 抵消 td padding → 占满格、三角贴最右、值文本水平居中 */}
      <div
        ref={rootRef}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          minHeight: 22,
          marginLeft: -pad.left,
          marginRight: -pad.right,
          width: `calc(100% + ${pad.left + pad.right}px)`,
          cursor: "pointer",
          userSelect: "none",
          boxSizing: "border-box",
          transition: "background-color .15s",
        }}
        className={`ec-chip-trigger${dirty ? " is-dirty" : ""}${
          open ? " is-open" : ""
        }`}
        title={dirty ? "已修改，尚未提交" : "点击选择"}
      >
        {/* 值文本：占满并水平居中（两侧预留空间以免与三角/圆点重叠） */}
        <span
          className="ec-chip-val"
          style={{
            width: "100%",
            padding: "0 22px",
            boxSizing: "border-box",
            textAlign: "center",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: textColor,
            fontSize: 13,
          }}
        >
          {isEmpty ? placeholder ?? "" : label}
        </span>
        {/* 待提交标记：贴近三角左侧的小方点，常驻（不影响文字居中）。
            改方点是因为圆点在密表里和系统图标、状态点混为一片；
            方块在中文行里不与任何字符同形。 */}
        {dirty ? (
          <span
            style={{
              position: "absolute",
              right: 18,
              top: "50%",
              width: 5,
              height: 5,
              background: MOSS.accentInk,
              transform: "translateY(-50%)",
            }}
          />
        ) : null}
        {/* 小三角：绝对定位贴格子最右侧 */}
        <span
          className="ec-chip-tri"
          style={{
            position: "absolute",
            right: 4,
            top: "50%",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: MOSS.ornament,
            transform: "translateY(-50%)",
          }}
        >
          <DownOutlined style={{ fontSize: 10 }} />
        </span>
      </div>
    </Dropdown>
  );
}
