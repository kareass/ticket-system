import axios from "axios";

/**
 * 把异常转成可直接展示给用户的中文提示（环节5.3 友好提示）。
 * - 后端校验失败：优先用响应体 { error, details } 拼出「主因（细节…）」
 * - 有响应但无 error 字段：退化为 HTTP 状态码提示
 * - 无响应：网络/服务未启动提示
 */
export function toErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const payload = err.response?.data as
      | { error?: string; details?: unknown }
      | undefined;
    if (payload?.error) {
      const details = Array.isArray(payload.details)
        ? payload.details.filter((d): d is string => typeof d === "string")
        : [];
      return details.length ? `${payload.error}（${details.join(" ")}）` : payload.error;
    }
    if (err.response) return `请求失败（HTTP ${err.response.status}）`;
    return "网络异常或服务未启动，请稍后重试。";
  }
  return err instanceof Error ? err.message : "未知错误";
}
