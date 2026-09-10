import axios from "axios";
import type { WorkOrder, Requirement } from "@/types";

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
  /** 工单转需求（一对一）：返回新建需求 + 已置标记的工单 */
  convert: async (
    id: string,
  ): Promise<{ requirement: Requirement; workOrder: WorkOrder }> =>
    (
      await http.post<{ requirement: Requirement; workOrder: WorkOrder }>(
        `/work-orders/${id}/convert`,
        {},
      )
    ).data,
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
