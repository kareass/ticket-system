"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import dayjs from "dayjs";
import {
  AppstoreOutlined,
  BellOutlined,
  FileTextOutlined,
  RightOutlined,
  ScheduleOutlined,
} from "@ant-design/icons";
import { useAppStore } from "@/store/store";
import { today } from "@/lib/utils";
import Surface from "@/components/common/Surface";

/**
 * 首页（方向：柔和 · 苔绿）
 *
 * 两条与旧版不同的决定，都是「读者能得到什么」而非「好不好看」：
 *
 * 1. **页头是今天，不是系统名。** 「四川物流工单系统」已经写在左侧导航顶端，
 *    在正文里再用大标题重复一遍，等于第一屏最贵的位置什么都没说。
 *    这个系统的日期默认今天、提醒按日期判逾期 —— 今天几号是这一屏真正高频的数据。
 *
 * 2. **四张卡的下缘各挂一条实时计数。** 一行两块、四块等大的形态是用户要的；
 *    但四块只有图标颜色不同的卡，扫过去得不到任何信息差。
 *    数字补上了这个差 —— 哪一栏堆了多少东西，一进首页就该看见。
 *
 * 数据：四张列表全部走 store 的「已加载」缓存，来回切页面不重复请求；
 * 失败一律**不弹提示** —— 首页的计数只是锦上添花，接口抖动时退成空计数即可，
 * 不该一进首页就甩一个错误提示给用户。
 *
 * ⚠️ 计数必须按 `*Loaded` 门控：先渲染 0、接口回来再跳成真实值的「闪一帧」
 * 比空着更难受（工作提醒 spec §11.5 记过这个风险）。
 */

const WEEKDAYS = [
  "星期日",
  "星期一",
  "星期二",
  "星期三",
  "星期四",
  "星期五",
  "星期六",
];

export default function HomePage() {
  const workOrders = useAppStore((s) => s.workOrders);
  const workOrdersLoaded = useAppStore((s) => s.workOrdersLoaded);
  const loadWorkOrders = useAppStore((s) => s.loadWorkOrders);

  const requirements = useAppStore((s) => s.requirements);
  const requirementsLoaded = useAppStore((s) => s.requirementsLoaded);
  const loadRequirements = useAppStore((s) => s.loadRequirements);

  const meetings = useAppStore((s) => s.meetings);
  const meetingsLoaded = useAppStore((s) => s.meetingsLoaded);
  const loadMeetings = useAppStore((s) => s.loadMeetings);

  const reminders = useAppStore((s) => s.reminders);
  const remindersLoaded = useAppStore((s) => s.remindersLoaded);
  const loadReminders = useAppStore((s) => s.loadReminders);

  useEffect(() => {
    void loadWorkOrders().catch(() => undefined);
    void loadRequirements().catch(() => undefined);
    void loadMeetings().catch(() => undefined);
    void loadReminders().catch(() => undefined);
  }, [loadWorkOrders, loadRequirements, loadMeetings, loadReminders]);

  const modules = useMemo(() => {
    const pendingConvert = workOrders.filter(
      (w) => !w.isConvertToRequirement,
    ).length;
    const released = requirements.filter((r) => r.isReleased).length;
    const month = today().slice(0, 7);
    const meetingsThisMonth = meetings.filter((m) =>
      m.date.startsWith(month),
    ).length;
    const undone = reminders.filter((r) => !r.isDone).length;
    // date 是 "YYYY-MM-DD"，字典序即日期序，不必转 Date（与提醒列表同一套判断）
    const overdue = reminders.filter(
      (r) => !r.isDone && r.date <= today(),
    ).length;

    return [
      {
        href: "/work-orders",
        icon: <FileTextOutlined />,
        name: "工单管理",
        desc: "登记、追踪部门内的工作工单，支持检索、筛选与转为需求。",
        loaded: workOrdersLoaded,
        stats: [
          { value: workOrders.length, label: "工单总数" },
          { value: pendingConvert, label: "待转需求" },
        ],
      },
      {
        href: "/requirements",
        icon: <AppstoreOutlined />,
        name: "需求管理",
        desc: "从工单转化的需求或手工登记的需求，跟进方案、开发、测试、发版全流程。",
        loaded: requirementsLoaded,
        stats: [
          { value: requirements.length, label: "需求总数" },
          { value: released, label: "已发版" },
        ],
      },
      {
        href: "/meetings",
        icon: <ScheduleOutlined />,
        name: "会议纪要",
        desc: "记录部门会议的主题、参会人与讨论内容，支持上传附件。",
        loaded: meetingsLoaded,
        stats: [
          { value: meetings.length, label: "纪要总数" },
          { value: meetingsThisMonth, label: "本月" },
        ],
      },
      {
        href: "/reminders",
        icon: <BellOutlined />,
        name: "工作提醒",
        desc: "登记待办提醒，到日子一眼看到。",
        loaded: remindersLoaded,
        stats: [
          { value: undone, label: "未完成" },
          { value: overdue, label: "已逾期", alert: overdue > 0 },
        ],
      },
    ];
  }, [
    workOrders,
    workOrdersLoaded,
    requirements,
    requirementsLoaded,
    meetings,
    meetingsLoaded,
    reminders,
    remindersLoaded,
  ]);

  return (
    <>
      <Surface style={{ marginBottom: 20 }}>
        <div className="page-head">
          <div>
            {/* 数字用等宽、星期用中文 —— 只靠字体切换区分，不加第二个色 */}
            <h1>
              <span className="mono">{today()}</span>
              <span style={{ marginLeft: 10 }}>{WEEKDAYS[dayjs().day()]}</span>
            </h1>
            <p className="page-sub">
              部门内部的工单登记、需求追踪、会议记录与工作提醒。
            </p>
          </div>
        </div>
      </Surface>

      <div className="home-grid">
        {modules.map((m) => (
          <Link href={m.href} key={m.href} className="mod-card">
            <span className="mod-top">
              <span className="mod-ico" aria-hidden>
                {m.icon}
              </span>
              <span className="mod-name">{m.name}</span>
              <RightOutlined className="mod-go" style={{ fontSize: 12 }} />
            </span>
            <span className="mod-desc">{m.desc}</span>
            <span className="mod-stats">
              {/* 未加载完不渲染数字：0 → 真实值的跳动比空白刺眼 */}
              {m.loaded
                ? m.stats.map((s) => (
                    <span
                      key={s.label}
                      className={`page-stat${s.alert ? " is-alert" : ""}`}
                    >
                      <b>{s.value}</b>
                      <span>{s.label}</span>
                    </span>
                  ))
                : null}
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
