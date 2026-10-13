import { create } from "zustand";
import type { WorkOrder, Requirement, Meeting, MeetingAttachment, Reminder } from "@/types";
import { meetingApi, reminderApi, requirementApi, workOrderApi } from "@/lib/api";

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
  /**
   * 工单转需求（一对一）。
   * opts 为弹框中填写的需求ID / 需求内容 / 需求提交人，均可缺省（缺省时用后端工单上已登记的值）；
   * requirementContent 传 "" 表示将需求内容置空；submittedBy 未传时默认用工单上的提交人。
   */
  convertWorkOrder: (
    id: string,
    opts?: {
      requirementId?: string;
      requirementContent?: string;
      submittedBy?: string;
    },
  ) => Promise<Requirement>;

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

  // 会议纪要
  meetings: Meeting[];
  meetingsLoading: boolean;
  meetingsLoaded: boolean;
  loadMeetings: (force?: boolean) => Promise<Meeting[]>;
  addMeeting: (m: Partial<Meeting>) => Promise<Meeting>;
  updateMeeting: (id: string, patch: Partial<Meeting>) => Promise<Meeting>;
  deleteMeeting: (id: string) => Promise<void>;
  /** 上传附件后把返回的附件并入本地对应纪要 */
  addMeetingAttachment: (meetingId: string, att: MeetingAttachment) => void;
  removeMeetingAttachment: (meetingId: string, attId: string) => void;
  /** 把单查得到的纪要并入列表缓存（编辑页回源后调用）。
   *  附件增删只 patch 缓存，纪要不在缓存里就会静默丢掉更新。 */
  upsertMeeting: (m: Meeting) => void;

  // 工作提醒
  reminders: Reminder[];
  remindersLoading: boolean;
  /** 是否已完成过一次加载（首页卡片与列表页同用；force=true 可强制刷新） */
  remindersLoaded: boolean;
  loadReminders: (force?: boolean) => Promise<Reminder[]>;
  addReminder: (input: Partial<Reminder>) => Promise<Reminder>;
  updateReminder: (id: string, patch: Partial<Reminder>) => Promise<Reminder>;
  deleteReminder: (id: string) => Promise<void>;
  /** 把单查得到的提醒并入列表缓存（编辑页回源后调用）。
   *  updateReminder 只对**已在缓存里**的记录打补丁，未并入就会被静默丢掉。 */
  upsertReminder: (r: Reminder) => void;
}

/**
 * 提醒列表的本地顺序必须与接口一致：date 升序，同日按 createdAt 升序。
 * 新建或回源并入缓存后若不重排，界面顺序会与「刷新」之后不一致
 * （其它三个列表是 createdAt 倒序，前插恰好正确；本表升序，前插是错的）。
 */
function byReminderOrder(a: Reminder, b: Reminder): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return 0;
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
  convertWorkOrder: async (id, opts) => {
    const { requirement, workOrder } = await workOrderApi.convert(id, opts);
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

  // ---------- 会议纪要 ----------
  meetings: [],
  meetingsLoading: false,
  meetingsLoaded: false,
  loadMeetings: async (force = false) => {
    if (get().meetingsLoaded && !force) return get().meetings;
    set({ meetingsLoading: true });
    try {
      const list = await meetingApi.list();
      set({ meetings: list, meetingsLoaded: true });
      return list;
    } finally {
      set({ meetingsLoading: false });
    }
  },
  addMeeting: async (m) => {
    const created = await meetingApi.create(m);
    set((s) => ({ meetings: [created, ...s.meetings] }));
    return created;
  },
  updateMeeting: async (id, patch) => {
    const updated = await meetingApi.update(id, patch);
    set((s) => ({ meetings: s.meetings.map((m) => (m.id === id ? updated : m)) }));
    return updated;
  },
  deleteMeeting: async (id) => {
    await meetingApi.remove(id);
    set((s) => ({ meetings: s.meetings.filter((m) => m.id !== id) }));
  },
  addMeetingAttachment: (meetingId, att) => {
    set((s) => ({
      meetings: s.meetings.map((m) =>
        m.id === meetingId ? { ...m, attachments: [...m.attachments, att] } : m,
      ),
    }));
  },
  removeMeetingAttachment: (meetingId, attId) => {
    set((s) => ({
      meetings: s.meetings.map((m) =>
        m.id === meetingId
          ? { ...m, attachments: m.attachments.filter((a) => a.id !== attId) }
          : m,
      ),
    }));
  },
  upsertMeeting: (m) => {
    set((s) => ({
      meetings: s.meetings.some((x) => x.id === m.id)
        ? s.meetings.map((x) => (x.id === m.id ? m : x))
        : [m, ...s.meetings],
    }));
  },

  // ---------- 工作提醒 ----------
  reminders: [],
  remindersLoading: false,
  remindersLoaded: false,
  loadReminders: async (force = false) => {
    if (get().remindersLoaded && !force) return get().reminders;
    set({ remindersLoading: true });
    try {
      const list = await reminderApi.list();
      set({ reminders: list, remindersLoaded: true });
      return list;
    } finally {
      set({ remindersLoading: false });
    }
  },
  addReminder: async (input) => {
    const created = await reminderApi.create(input);
    set((s) => ({ reminders: [...s.reminders, created].sort(byReminderOrder) }));
    return created;
  },
  updateReminder: async (id, patch) => {
    const updated = await reminderApi.update(id, patch);
    set((s) => ({
      reminders: s.reminders
        .map((r) => (r.id === id ? updated : r))
        .sort(byReminderOrder),
    }));
    return updated;
  },
  deleteReminder: async (id) => {
    await reminderApi.remove(id);
    set((s) => ({ reminders: s.reminders.filter((r) => r.id !== id) }));
  },
  upsertReminder: (r) => {
    set((s) => ({
      reminders: (
        s.reminders.some((x) => x.id === r.id)
          ? s.reminders.map((x) => (x.id === r.id ? r : x))
          : [...s.reminders, r]
      ).sort(byReminderOrder),
    }));
  },
}));
