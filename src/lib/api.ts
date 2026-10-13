import axios from "axios";
import type { Meeting, MeetingAttachment, Reminder, WorkOrder, Requirement } from "@/types";

/**
 * API 请求封装（环节5 起为真实数据源）
 * - 所有方法直接返回业务数据（已取 .data），失败时抛 axios 错误，
 *   由调用方用 @/lib/errors 的 toErrorMessage 转成友好提示。
 * - baseURL 走 NEXT_PUBLIC_API_BASE_URL，缺省相对路径 /api。
 */

const http = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL || "/api",
  timeout: 15000,
});

// ---------- 工单 ----------
export const workOrderApi = {
  list: async (params?: { system?: string; keyword?: string }): Promise<WorkOrder[]> =>
    (await http.get<WorkOrder[]>("/work-orders", { params })).data,
  get: async (id: string): Promise<WorkOrder> =>
    (await http.get<WorkOrder>(`/work-orders/${id}`)).data,
  create: async (data: Partial<WorkOrder>): Promise<WorkOrder> =>
    (await http.post<WorkOrder>("/work-orders", data)).data,
  update: async (id: string, data: Partial<WorkOrder>): Promise<WorkOrder> =>
    (await http.put<WorkOrder>(`/work-orders/${id}`, data)).data,
  remove: async (id: string): Promise<void> => {
    await http.delete(`/work-orders/${id}`);
  },
  /**
   * 工单转需求（一对一）：返回新建需求 + 已置标记的工单。
   * opts.requirementId / opts.requirementContent / opts.submittedBy 为本次转出的值
   * （列表「转需求」弹框中填写）；三者均可缺省 —— 缺省时后端退回工单上已登记的值。
   * 注意 requirementContent 传 "" 表示「显式清空」（转出的需求内容为空），与缺省语义不同。
   * submittedBy 未传时默认用工单的 submittedBy（继承自工单）。
   */
  convert: async (
    id: string,
    opts?: {
      requirementId?: string;
      requirementContent?: string;
      submittedBy?: string;
    },
  ): Promise<{ requirement: Requirement; workOrder: WorkOrder }> => {
    const payload: {
      requirementId?: string;
      requirementContent?: string;
      submittedBy?: string;
    } = {};
    if (opts?.requirementId !== undefined) payload.requirementId = opts.requirementId;
    if (opts?.requirementContent !== undefined) {
      payload.requirementContent = opts.requirementContent;
    }
    if (opts?.submittedBy !== undefined) payload.submittedBy = opts.submittedBy;
    return (
      await http.post<{ requirement: Requirement; workOrder: WorkOrder }>(
        `/work-orders/${id}/convert`,
        payload,
      )
    ).data;
  },
};

// ---------- 需求 ----------
export const requirementApi = {
  list: async (params?: {
    system?: string;
    currentNode?: string;
    keyword?: string;
  }): Promise<Requirement[]> =>
    (await http.get<Requirement[]>("/requirements", { params })).data,
  get: async (id: string): Promise<Requirement> =>
    (await http.get<Requirement>(`/requirements/${id}`)).data,
  create: async (data: Partial<Requirement>): Promise<Requirement> =>
    (await http.post<Requirement>("/requirements", data)).data,
  update: async (id: string, data: Partial<Requirement>): Promise<Requirement> =>
    (await http.put<Requirement>(`/requirements/${id}`, data)).data,
  remove: async (id: string): Promise<void> => {
    await http.delete(`/requirements/${id}`);
  },
};

// ---------- 会议纪要 ----------
export const meetingApi = {
  list: async (params?: { keyword?: string; attendee?: string }): Promise<Meeting[]> =>
    (await http.get<Meeting[]>("/meetings", { params })).data,
  get: async (id: string): Promise<Meeting> =>
    (await http.get<Meeting>(`/meetings/${id}`)).data,
  create: async (data: Partial<Meeting>): Promise<Meeting> =>
    (await http.post<Meeting>("/meetings", data)).data,
  update: async (id: string, data: Partial<Meeting>): Promise<Meeting> =>
    (await http.put<Meeting>(`/meetings/${id}`, data)).data,
  remove: async (id: string): Promise<void> => {
    await http.delete(`/meetings/${id}`);
  },
  /** 上传单个附件（multipart）。不要手动设置 Content-Type，浏览器会自动带上 boundary */
  uploadAttachment: async (meetingId: string, file: File): Promise<MeetingAttachment> => {
    const form = new FormData();
    form.append("file", file);
    return (await http.post<MeetingAttachment>(`/meetings/${meetingId}/attachments`, form)).data;
  },
  removeAttachment: async (attachmentId: string): Promise<void> => {
    await http.delete(`/attachments/${attachmentId}`);
  },
  /** 附件下载 / 预览地址（直接给 <img src> 或 <a href> 用） */
  attachmentUrl: (attachmentId: string): string =>
    `${process.env.NEXT_PUBLIC_API_BASE_URL || "/api"}/attachments/${attachmentId}`,
};

// ---------- 工作提醒 ----------
export const reminderApi = {
  list: async (params?: {
    isDone?: boolean;
    remindee?: string;
    keyword?: string;
  }): Promise<Reminder[]> =>
    (await http.get<Reminder[]>("/reminders", { params })).data,
  get: async (id: string): Promise<Reminder> =>
    (await http.get<Reminder>(`/reminders/${id}`)).data,
  create: async (data: Partial<Reminder>): Promise<Reminder> =>
    (await http.post<Reminder>("/reminders", data)).data,
  update: async (id: string, data: Partial<Reminder>): Promise<Reminder> =>
    (await http.put<Reminder>(`/reminders/${id}`, data)).data,
  remove: async (id: string): Promise<void> => {
    await http.delete(`/reminders/${id}`);
  },
};
