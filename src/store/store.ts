import { create } from "zustand";
import type { WorkOrder, Requirement } from "@/types";
import { mockWorkOrders, mockRequirements } from "@/lib/mockData";

/**
 * 全局状态（Zustand）
 * 环节3：数据源为 mock；后端 API 就绪后，将 actions 改为调用 @/lib/api 即可。
 */

interface AppState {
  // 工单
  workOrders: WorkOrder[];
  addWorkOrder: (wo: WorkOrder) => void;
  updateWorkOrder: (id: string, wo: Partial<WorkOrder>) => void;
  deleteWorkOrder: (id: string) => void;
  // 需求
  requirements: Requirement[];
  addRequirement: (req: Requirement) => void;
  updateRequirement: (id: string, req: Partial<Requirement>) => void;
  deleteRequirement: (id: string) => void;
  // 源标识（mock / api）
  dataSource: "mock" | "api";
  setDataSource: (s: "mock" | "api") => void;
}

let woSeq = 100;
let reqSeq = 100;

export const useAppStore = create<AppState>((set) => ({
  workOrders: mockWorkOrders,
  addWorkOrder: (wo) =>
    set((s) => ({
      workOrders: [
        { ...wo, id: wo.id || `wo-${++woSeq}` },
        ...s.workOrders,
      ],
    })),
  updateWorkOrder: (id, wo) =>
    set((s) => ({
      workOrders: s.workOrders.map((w) =>
        w.id === id ? { ...w, ...wo, id } : w,
      ),
    })),
  deleteWorkOrder: (id) =>
    set((s) => ({ workOrders: s.workOrders.filter((w) => w.id !== id) })),

  requirements: mockRequirements,
  addRequirement: (req) =>
    set((s) => ({
      requirements: [
        { ...req, id: req.id || `req-${++reqSeq}` },
        ...s.requirements,
      ],
    })),
  updateRequirement: (id, req) =>
    set((s) => ({
      requirements: s.requirements.map((r) =>
        r.id === id ? { ...r, ...req, id } : r,
      ),
    })),
  deleteRequirement: (id) =>
    set((s) => ({
      requirements: s.requirements.filter((r) => r.id !== id),
    })),

  dataSource: "mock",
  setDataSource: (source) => set({ dataSource: source }),
}));
