import { create } from "zustand";
import type { WorkOrder, Requirement } from "@/types";
import { requirementApi, workOrderApi } from "@/lib/api";

/**
 * 全局状态（Zustand）—— 环节5 起接真实后端 API（Prisma/SQLite）。
 *
 * 约定：
 * - 读：loadWorkOrders / loadRequirements 拉取列表，配合 loading 标记驱动表格 loading；
 * - 写：add/update/delete/convert 均先请求后端，成功后再用返回值同步本地列表
 *   （保证界面与库一致；失败则抛出，由页面捕获后用 toErrorMessage 提示）；
 * - 本地不再生成 id / updatedAt，一律由后端返回。
 */
interface AppState {
  // 工单
  workOrders: WorkOrder[];
  workOrdersLoading: boolean;
  loadWorkOrders: () => Promise<WorkOrder[]>;
  addWorkOrder: (wo: Partial<WorkOrder>) => Promise<WorkOrder>;
  updateWorkOrder: (id: string, patch: Partial<WorkOrder>) => Promise<WorkOrder>;
  deleteWorkOrder: (id: string) => Promise<void>;
  /** 工单转需求（一对一）：后端创建需求并置工单标记，本地同步两表 */
  convertWorkOrder: (id: string) => Promise<Requirement>;

  // 需求
  requirements: Requirement[];
  requirementsLoading: boolean;
  loadRequirements: () => Promise<Requirement[]>;
  addRequirement: (req: Partial<Requirement>) => Promise<Requirement>;
  updateRequirement: (
    id: string,
    patch: Partial<Requirement>,
  ) => Promise<Requirement>;
  deleteRequirement: (id: string) => Promise<void>;
}

export const useAppStore = create<AppState>((set) => ({
  // ---------- 工单 ----------
  workOrders: [],
  workOrdersLoading: false,
  loadWorkOrders: async () => {
    set({ workOrdersLoading: true });
    try {
      const list = await workOrderApi.list();
      set({ workOrders: list });
      return list;
    } finally {
      set({ workOrdersLoading: false });
    }
  },
  addWorkOrder: async (wo) => {
    const created = await workOrderApi.create(wo);
    set((s) => ({ workOrders: [created, ...s.workOrders] }));
    return created;
  },
  updateWorkOrder: async (id, patch) => {
    const updated = await workOrderApi.update(id, patch);
    set((s) => ({
      workOrders: s.workOrders.map((w) => (w.id === id ? updated : w)),
    }));
    return updated;
  },
  deleteWorkOrder: async (id) => {
    await workOrderApi.remove(id);
    set((s) => ({
      workOrders: s.workOrders.filter((w) => w.id !== id),
      // 后端已保证：有关联需求时不允许删除，故此处无需额外清理
    }));
  },
  convertWorkOrder: async (id) => {
    const { requirement, workOrder } = await workOrderApi.convert(id);
    set((s) => ({
      workOrders: s.workOrders.map((w) => (w.id === id ? workOrder : w)),
      requirements: [requirement, ...s.requirements],
    }));
    return requirement;
  },

  // ---------- 需求 ----------
  requirements: [],
  requirementsLoading: false,
  loadRequirements: async () => {
    set({ requirementsLoading: true });
    try {
      const list = await requirementApi.list();
      set({ requirements: list });
      return list;
    } finally {
      set({ requirementsLoading: false });
    }
  },
  addRequirement: async (req) => {
    const created = await requirementApi.create(req);
    set((s) => ({ requirements: [created, ...s.requirements] }));
    return created;
  },
  updateRequirement: async (id, patch) => {
    const updated = await requirementApi.update(id, patch);
    set((s) => ({
      requirements: s.requirements.map((r) => (r.id === id ? updated : r)),
    }));
    return updated;
  },
  deleteRequirement: async (id) => {
    await requirementApi.remove(id);
    set((s) => ({
      requirements: s.requirements.filter((r) => r.id !== id),
      // 后端在事务内已复位来源工单的转需求标记，这里同步刷新工单列表以保持一致
    }));
  },
}));
