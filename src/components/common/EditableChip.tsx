"use client";

/**
 * EditableChip —— 列表格内「好看的可点选值」：
 * 平时显示一个带语义色的小标签(Chip，即当前值/原选项)，右带 ▼ 提示可改。
 *
 * 交互（用户 Gate 迭代 R5.1）：
 * - 点击彩条：原地不变，仅在其正下方弹出下拉面板（antd Dropdown 自带展开动画，更顺滑）。
 *   → 彩条即「原选项」始终保留显示，不会被下拉面板遮挡/替换。
 * - 下拉面板：每个选项左侧带语义色圆点(与收起彩条同色)，当前值高亮底固定 rgb(250,250,250) + 对勾；
 *   面板宽度随当前字段(所在单元格)宽度自适应。
 * - 选完立即收起并交给 onChange（是否落库由调用方决定，配合 useRowDrafts 走“提交”门）。
 */
import { useRef, useState } from "react";
import { CheckOutlined, DownOutlined } from "@ant-design/icons";
import { Dropdown, Tag, type MenuProps } from "antd";

export interface ChipOption<V extends string | boolean> {
  label: string;
  value: V;
}

interface EditableChipProps<V extends string | boolean> {
  value: V;
  options: ChipOption<V>[];
  /** 根据某个选项值返回语义色（antd 预设色），undefined=默认灰 */
  colorOf: (value: V) => string | undefined;
  onChange: (value: V) => void;
  /** 该字段当前为待提交状态时展示橙色小点 */
  dirty?: boolean;
}

/** antd Tag 预设色 → 十六进制（用于选项左侧语义圆点）；未列出的取灰 */
const PRESET_HEX: Record<string, string> = {
  magenta: "#eb2f96",
  pink: "#eb2f96",
  red: "#f5222d",
  volcano: "#fa541c",
  orange: "#fa8c16",
  gold: "#faad14",
  lime: "#a0d911",
  green: "#52c41a",
  cyan: "#13c2c2",
  blue: "#1677ff",
  geekblue: "#2f54eb",
  purple: "#722ed1",
  success: "#52c41a",
  processing: "#1677ff",
  error: "#ff4d4d",
  warning: "#faad14",
  default: "#d9d9d9",
};

function presetToHex(color: string | undefined): string {
  if (!color) return "#d9d9d9";
  return PRESET_HEX[color] || "#d9d9d9";
}

export default function EditableChip<V extends string | boolean>({
  value,
  options,
  colorOf,
  onChange,
  dirty,
}: EditableChipProps<V>) {
  const [open, setOpen] = useState(false);
  // 打开时量一下所在单元格宽度，让面板「宽度随当前字段宽度」
  const cellRef = useRef<HTMLSpanElement>(null);
  const [panelWidth, setPanelWidth] = useState<number | undefined>(undefined);

  const current = options.find((o) => o.value === value);
  const label = current ? current.label : String(value);

  const handleOpenChange = (o: boolean) => {
    if (o) {
      const w = cellRef.current?.closest("td")?.getBoundingClientRect().width;
      setPanelWidth(w && w > 0 ? Math.round(w) : undefined);
    }
    setOpen(o);
  };

  const items: MenuProps["items"] = options.map((opt) => ({
    key: String(opt.value),
    label: (
      <span className="ec-opt">
        <i
          className="ec-opt-dot"
          style={{ background: presetToHex(colorOf(opt.value)) }}
        />
        {opt.label}
      </span>
    ),
  }));

  const onClickItem: MenuProps["onClick"] = ({ key }) => {
    const hit = options.find((o) => String(o.value) === key);
    setOpen(false);
    if (hit) onChange(hit.value);
  };

  return (
    <span ref={cellRef} style={{ display: "inline-flex" }}>
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
          style: { minWidth: panelWidth || undefined },
        }}
      >
        <Tag
          color={colorOf(value)}
          style={{
            cursor: "pointer",
            marginInlineEnd: 0,
            userSelect: "none",
            transition: "box-shadow .15s, filter .15s",
          }}
          title="点击选择"
        >
          {label}
          <span
            style={{
              fontSize: 8,
              marginLeft: 4,
              opacity: open ? 1 : 0.75,
              display: "inline-block",
              transition: "transform .15s",
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
              verticalAlign: "1px",
            }}
          >
            <DownOutlined style={{ fontSize: 8 }} />
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
      </Dropdown>
    </span>
  );
}
