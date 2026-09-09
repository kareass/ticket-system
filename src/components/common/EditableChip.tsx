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

export interface ChipOption<V extends string | boolean> {
  label: string;
  value: V;
}

interface EditableChipProps<V extends string | boolean> {
  value: V;
  options: ChipOption<V>[];
  onChange: (value: V) => void;
  /** 该字段当前为待提交状态时，在文字右缘/三角前展示橙色小点 */
  dirty?: boolean;
  /** 兼容保留：外部曾按值给色，本期改为与字段一致的普通文字色，忽略该参数 */
  colorOf?: (value: V) => string | undefined;
}

export default function EditableChip<V extends string | boolean>({
  value,
  options,
  onChange,
  dirty,
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
        className="ec-chip-trigger"
        title="点击选择"
      >
        {/* 值文本：占满并水平居中（两侧预留空间以免与三角/橙点重叠） */}
        <span
          style={{
            width: "100%",
            padding: "0 22px",
            boxSizing: "border-box",
            textAlign: "center",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: "rgba(0, 0, 0, 0.88)",
            fontSize: 14,
          }}
        >
          {label}
        </span>
        {/* 待提交橙点：贴近三角左侧，常驻（不影响文字居中） */}
        {dirty ? (
          <span
            style={{
              position: "absolute",
              right: 18,
              top: "50%",
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#fa8c16",
              transform: "translateY(-50%)",
            }}
          />
        ) : null}
        {/* 小三角：绝对定位贴格子最右侧 */}
        <span
          style={{
            position: "absolute",
            right: 4,
            top: "50%",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(0, 0, 0, 0.45)",
            transform: open
              ? "translateY(-50%) rotate(180deg)"
              : "translateY(-50%) rotate(0deg)",
            transition: "transform .15s",
          }}
        >
          <DownOutlined style={{ fontSize: 10 }} />
        </span>
      </div>
    </Dropdown>
  );
}
