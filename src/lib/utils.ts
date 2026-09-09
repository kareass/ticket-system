import dayjs from "dayjs";

/** 返回今天（YYYY-MM-DD，供日期选择器默认值） */
export function today(): string {
  return dayjs().format("YYYY-MM-DD");
}

/** 格式化展示日期 */
export function formatDate(d?: string): string {
  if (!d) return "-";
  return dayjs(d).isValid() ? dayjs(d).format("YYYY-MM-DD") : d;
}

/** 计算两个日期间隔天数（含当天为第 1 天） */
export function diffDays(start?: string, end?: string): number {
  if (!start) return 0;
  const s = dayjs(start).startOf("day");
  const e = end ? dayjs(end).startOf("day") : dayjs().startOf("day");
  return e.diff(s, "day") + 1;
}
