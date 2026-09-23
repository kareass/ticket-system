"use client";

import React, { useMemo } from "react";
import { Select } from "antd";

/**
 * 人名选择器：**可自由输入，也可从候选里点选**。
 *
 * 候选人名由调用方传入（本项目的来源：已加载的全部会议纪要里出现过的
 * attendees + recorder）。系统没有账号体系，因此不维护固定人员名单 ——
 * 用「可打可选」把写法慢慢收敛，而不是强制用户先建档。
 *
 * mode="multiple" 用于参会人，mode 不传（单选）用于记录人。
 */
interface PersonSelectProps {
  value?: string | string[];
  onChange?: (v: string | string[] | undefined) => void;
  /** 候选人名 */
  options: string[];
  multiple?: boolean;
  placeholder?: string;
  style?: React.CSSProperties;
}

export default function PersonSelect({
  value,
  onChange,
  options,
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

  const selectOptions = useMemo(
    () => options.map((name) => ({ label: name, value: name })),
    [options],
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
    />
  );
}
