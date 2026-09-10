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
  /** 是否已完成过一次加载（列表页据此避免来回切换时重复请求；force=true 可强制刷新） */
  workOrdersLoaded: boolean;
  loadWorkOrders: (force?: boolean) => Promise<WorkOrder[]>;
  addWorkOrder: (wo: Partial<WorkOrder>) => Promise<WorkOrder>;
  updateWorkOrder: (id: string, patch: Partial<WorkOrder>) => Promise<WorkOrder>;
  deleteWorkOrder: (id: string) => Promise<void>;
  /** 工单转需求（一对一）：后端创建需求并置工单标记，本地同步两表 */
  /** 工单转需求（一对一）；requirementId 为弹框中填写的需求ID，缺省用工单已登记的编号 */
  convertWorkOrder: (id: string, requirementId?: string) => Promise<Requirement>;

  // 需求
  requirements: Requirement[];
  requirementsLoading: boolean;
  requirementsLoaded: boolean;
  loadRequirements: (force?: boolean) => Promise<Requirement[]>;
  addRequirement: (req: Partial<Requirement>) => Promise<Requirement>;
  updateRequirement: (
    id: string,
    patch: Partial<Requirement>,
  ) => Promise<Requirement>;
  deleteRequirement: (id: string) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  // ---------- 工单 ----------
  workOrders: [],
  workOrdersLoading: false,
  workOrdersLoaded: false,
  loadWorkOrders: async (force = false) => {
    // 已加载且非强制 → 直接用缓存，避免页面来回切换时重复请求
    if (get().workOrdersLoaded && !force) return get().workOrders;
    set({ workOrdersLoading: true });
    try {
      const list = await workOrderApi.list();
      set({ workOrders: list, workOrdersLoaded: true });
      return list;
    } finally {
      set({ workOrdersLoading: false });
    }
  },
  addWorkOrder: async (wo) => {
    const created = await workOrderApi.create(wo);
    set((s) => ({ workOrders: [created, ...s.workOrders] }));
    // 新建即「转需求」→ 后端已同步建需求，刷新需求列表保持一致
    if (created.isConvertToRequirement) {
      await get().loadRequirements(true).catch(() => undefined);
    }
    return created;
  },
  updateWorkOrder: async (id, patch) => {
    const updated = await workOrderApi.update(id, patch);
    set((s) => ({
      workOrders: s.workOrders.map((w) => (w.id === id ? updated : w)),
    }));
    // 开启「是否转需求」→ 后端在同一事务内新建了需求，刷新需求列表保持一致
    if (patch.isConvertToRequirement === true) {
      await get().loadRequirements(true).catch(() => undefined);
    }
    return updated;
  },
  deleteWorkOrder: async (id) => {
    await workOrderApi.remove(id);
    set((s) => ({
      workOrders: s.workOrders.filter((w) => w.id !== id),
      // 后端已保证：有关联需求时不允许删除，故此处无需额外清理
    }));
  },
  convertWorkOrder: async (id, requirementId) => {
    const { requirement, workOrder } = await workOrderApi.convert(id, requirementId);
    set((s) => ({
      workOrders: s.workOrders.map((w) => (w.id === id ? workOrder : w)),
      requirements: [requirement, ...s.requirements],
    }));
    return requirement;
  },

  // ---------- 需求 ----------
  requirements: [],
  requirementsLoading: false,
  requirementsLoaded: false,
  loadRequirements: async (force = false) => {
    if (get().requirementsLoaded && !force) return get().requirements;
    set({ requirementsLoading: true });
    try {
      const list = await requirementApi.list();
      set({ requirements: list, requirementsLoaded: true });
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
