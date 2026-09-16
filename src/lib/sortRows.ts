// 列表排序的比较器。纯函数，不依赖 React 与 antd。
//
// 枚举字段（system / currentNode / status）的业务顺序不另建一套，
// 直接复用 src/types/index.ts 里下拉选项数组的下标 —— 符合项目硬规则第 1 条
// 「下拉选项只有一个来源」。日后调整下拉顺序，排序顺序自动跟随。
import {
  NODE_OPTIONS,
  SYSTEM_OPTIONS,
  WORK_ORDER_STATUS_OPTIONS,
} from "@/types";

export type SortOrder = "ascend" | "descend";

export interface SortState<T> {
  field: keyof T;
  order: SortOrder;
}

/** 字段名 → 该字段的枚举取值顺序表 */
const ENUM_RANK: Record<string, readonly string[]> = {
  system: SYSTEM_OPTIONS,
  currentNode: NODE_OPTIONS,
  status: WORK_ORDER_STATUS_OPTIONS,
};

/** null / undefined / 空串 一律视为无值 */
function isBlank(v: unknown): boolean {
  return v === null || v === undefined || v === "";
}

/**
 * 建一个排序比较器。
 *
 * 空值判定放在升降序取反**之外**：未发版的需求 releaseDate 为空、未填
 * developmentDays 也为空，这些行无论升序降序都排在末尾，不会在降序时
 * 冲到最前面。
 */
export function createComparator<T>(
  field: keyof T,
  order: SortOrder,
): (a: T, b: T) => number {
  const rank = ENUM_RANK[String(field)];

  return (a, b) => {
    const av: unknown = a[field];
    const bv: unknown = b[field];

    const aBlank = isBlank(av);
    const bBlank = isBlank(bv);
    if (aBlank && bBlank) return 0;
    if (aBlank) return 1;
    if (bBlank) return -1;

    let r: number;
    if (rank) {
      // 枚举字段：按下标比业务顺序；不在表内的历史脏数据排末尾
      const ai = rank.indexOf(String(av));
      const bi = rank.indexOf(String(bv));
      if (ai < 0 && bi < 0) return 0;
      if (ai < 0) return 1;
      if (bi < 0) return -1;
      r = ai - bi;
    } else if (typeof av === "number" && typeof bv === "number") {
      r = av - bv;
    } else if (typeof av === "boolean" && typeof bv === "boolean") {
      r = Number(av) - Number(bv);
    } else {
      // 字符串字段：date / releaseDate 出参为 YYYY-MM-DD，字典序即时间序
      const as = String(av);
      const bs = String(bv);
      r = as < bs ? -1 : as > bs ? 1 : 0;
    }

    return order === "ascend" ? r : -r;
  };
}
