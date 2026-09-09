import axios from "axios";
import type { WorkOrder, Requirement } from "@/types";

/**
 * API 请求封装 —— 当前为后端就绪前的预留层。
 * 后端 API（环节4）完成后，本文件保持接口签名不变，
 * 前端各页面切换数据源即可，无需改动页面结构。
 */

const http = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL || "/api",
  timeout: 15000,
});

// ---------- 工单 ----------
export const workOrderApi = {
  list: (params?: Record<string, unknown>) =>
    http.get<WorkOrder[]>("/work-orders", { params }),
  create: (data: Partial<WorkOrder>) =>
    http.post<WorkOrder>("/work-orders", data),
  update: (id: string, data: Partial<WorkOrder>) =>
    http.put<WorkOrder>(`/work-orders/${id}`, data),
  remove: (id: string) => http.delete(`/work-orders/${id}`),
};

// ---------- 需求 ----------
export const requirementApi = {
  list: (params?: Record<string, unknown>) =>
    http.get<Requirement[]>("/requirements", { params }),
  create: (data: Partial<Requirement>) =>
    http.post<Requirement>("/requirements", data),
  update: (id: string, data: Partial<Requirement>) =>
    http.put<Requirement>(`/requirements/${id}`, data),
  remove: (id: string) => http.delete(`/requirements/${id}`),
};
