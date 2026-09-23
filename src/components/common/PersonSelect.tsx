"use client";

import React, { useMemo } from "react";
import { Select } from "antd";
import type { DefaultOptionType } from "antd/es/select";

/**
 * 人名选择器：**可自由输入，也可从候选里点选**。
 *
 * 候选人名由调用方传入（本项目的来源：已加载的全部会议纪要里出现过的
 * attendees + recorder）。系统没有账号体系，因此不维护固定人员名单 ——
 * 用「可打可选」把写法慢慢收敛，而不是强制用户先建档。
 *
 * mode="multiple" 用于参会人，mode 不传（单选）用于记录人。
 */

export interface PersonName {
  name: string;
  count?: number;
}

export interface PersonGroup {
  label: string; // "常用" / "其他"
  names: PersonName[];
}

interface PersonSelectProps {
  value?: string | string[];
  onChange?: (v: string | string[] | undefined) => void;
  /** 候选人名（分组结构，由调用方控制排序与封顶） */
  optionGroups: PersonGroup[];
  multiple?: boolean;
  placeholder?: string;
  style?: React.CSSProperties;
}

export default function PersonSelect({
  value,
  onChange,
  optionGroups,
  multiple = false,
  placeholder,
  style,
}: PersonSelectProps) {
  // antd tags 模式的 value/onChange 恒为数组，在此处完成与外部契约的换算：
  //   multiple=true  → 外部 value: string[]，onChange 回传 string[]
  //   multiple=false → 外部 value: string，  onChange 回传 string | undefined
  const innerValue = useMemo(
    () =>
      value === undefined || value === null
        ? undefined
        : Array.isArray(value)
          ? value
          : [value],
    [value],
  );

  const handleChange = (v: string[]) => {
    if (!onChange) return;
    if (multiple) onChange(v);
    else onChange(v && v.length ? v[v.length - 1] : undefined);
  };

  // 显式标注为 antd 的 DefaultOptionType[]：否则 TS 会把 options 的元素类型
  // 推导成分组形状，导致下面 optionRender 里取 opt.data.count 报「属性不存在」。
  const selectOptions: DefaultOptionType[] = useMemo(
    () =>
      optionGroups
        .filter((g) => g.names.length > 0)
        .map((g) => ({
          label: g.label,
          options: g.names.map((p) => ({
            label: p.name,
            value: p.name,
            count: p.count,
          })),
        })),
    [optionGroups],
  );

  return (
    <Select
      mode="tags"
      maxCount={multiple ? undefined : 1}
      value={innerValue}
      onChange={handleChange}
      options={selectOptions}
      placeholder={placeholder}
      style={style ?? { width: "100%" }}
      showSearch
      allowClear
      // 中文输入法组词时不要误触发分词
      tokenSeparators={[",", "、", "，"]}
      optionRender={(opt) => (
        // ⚠️ 次数只在下拉项里显示，**绝不能写进 option.label** ——
        // antd 选中后的标签用的是 label，写进去标签会变成「张三 (12 次)」。
        <span>
          {opt.data.label}
          {typeof opt.data.count === "number" ? (
            <span style={{ color: "#999", marginLeft: 8, fontSize: 12 }}>
              {opt.data.count} 次
            </span>
          ) : null}
        </span>
      )}
    />
  );
}
