"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Button,
  Checkbox,
  Input,
  message,
  Popconfirm,
  Segmented,
  Select,
  Space,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { PlusOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { REMINDEE_OPTIONS, asSelectOptions } from "@/types";
import type { Reminder } from "@/types";
import { useAppStore } from "@/store/store";
import { formatDate, today } from "@/lib/utils";
import { toErrorMessage } from "@/lib/errors";
import ProTable from "@/components/common/ProTable";
import Surface from "@/components/common/Surface";
import SortableHeader from "@/components/common/SortableHeader";
import { createComparator, type SortState } from "@/lib/sortRows";

type DoneFilter = "undone" | "all" | "done";

/**
 * 工作提醒列表
 * - **只读列表 + 独立新建/编辑页**（与会议纪要列表同构）：提醒内容是大段文本，
 *   做成内联编辑会和「显式提交」的心智模型打架。要改就进编辑页。
 * - **唯一破例**：勾选「已完成」点即 PUT 落库，不经草稿门。理由见设计文档 1.1 ——
 *   布尔开关没有中间态，不存在「半成品被静默丢弃」的风险。文本仍走编辑页。
 * - 数据源：全局 store（useAppStore.reminders），首次挂载拉取。
 * - 筛选与排序均为**前端行为**；未排序时保持接口返回的 date 升序（**不重新排序**）。
 * - ⚠️ 这是全站唯一一个按 date 升序的列表（其余三个都是 createdAt 倒序），别「顺手统一」。
 */
export default function ReminderListPage() {
  const reminders = useAppStore((s) => s.reminders);
  const loading = useAppStore((s) => s.remindersLoading);
  const loadReminders = useAppStore((s) => s.loadReminders);
  const updateReminder = useAppStore((s) => s.updateReminder);
  const deleteReminder = useAppStore((s) => s.deleteReminder);

  // 完成状态筛选：默认「未完成」—— 打开提醒页要看的本来就是还没办的事
  const [doneFilter, setDoneFilter] = useState<DoneFilter>("undone");
  const [remindee, setRemindee] = useState<string | undefined>(undefined);
  const [keyword, setKeyword] = useState("");
  // 排序状态：null = 未排序，保持后端返回的 date 升序
  const [sort, setSort] = useState<SortState<Reminder> | null>(null);

  useEffect(() => {
    void loadReminders().catch((e) => message.error(toErrorMessage(e)));
  }, [loadReminders]);

  // 勾选「已完成」→ 直接落库。失败时 store 不动，勾选框会回弹到原状态。
  const handleToggleDone = async (r: Reminder, checked: boolean) => {
    try {
      await updateReminder(r.id, { isDone: checked });
    } catch (e) {
      message.error(toErrorMessage(e));
    }
  };

  // 前端过滤：完成状态 + 提醒人相等 + 内容含关键字
  const filteredReminders = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return reminders.filter((r) => {
      const hitDone =
        doneFilter === "all"
          ? true
          : doneFilter === "done"
            ? r.isDone
            : !r.isDone;
      const hitRemindee = !remindee || r.remindee === remindee;
      const hitKeyword = !kw || r.content.toLowerCase().includes(kw);
      return hitDone && hitRemindee && hitKeyword;
    });
  }, [reminders, doneFilter, remindee, keyword]);

  // 台头计数：统计**全部**提醒，不随筛选变化。
  // 「已逾期」= 未完成 且 日期 ≤ 今天 —— 与下面整行标红用的是同一个判断，
  // 抽成一处以免台头的数字和红行的数量对不上。
  // date 是 "YYYY-MM-DD" 字符串，字典序比较即日期序，不必转 Date。
  const stats = useMemo(() => {
    const t = today();
    const undone = reminders.filter((r) => !r.isDone).length;
    const overdue = reminders.filter((r) => !r.isDone && r.date <= t).length;
    return { undone, overdue };
  }, [reminders]);

  // 双击列头：升序 → 降序 → 取消（回到接口给的 date 升序）
  const handleSortToggle = (field: keyof Reminder) => {
    setSort((prev) => {
      if (!prev || prev.field !== field) return { field, order: "ascend" };
      if (prev.order === "ascend") return { field, order: "descend" };
      return null;
    });
  };

  const sortedReminders = useMemo(() => {
    if (!sort) return filteredReminders;
    return [...filteredReminders].sort(
      createComparator<Reminder>(sort.field, sort.order),
    );
  }, [filteredReminders, sort]);

  const sortableTitle = (label: string, field: keyof Reminder) => (
    <SortableHeader<Reminder>
      label={label}
      field={field}
      sort={sort}
      onToggle={handleSortToggle}
    />
  );

  // 提醒人筛选选项：唯一来源 src/types，与表单共用
  const remindeeOptions = asSelectOptions(REMINDEE_OPTIONS);

  const columns: ColumnsType<Reminder> = [
    {
      title: "",
      key: "isDone",
      width: 50,
      align: "center" as const,
      render: (_, record) => (
        <Checkbox
          checked={record.isDone}
          onChange={(e) => void handleToggleDone(record, e.target.checked)}
        />
      ),
    },
    {
      title: sortableTitle("日期", "date"),
      dataIndex: "date",
      key: "date",
      width: 110,
      // 日期是数字串，等宽才纵向对齐
      render: (date: string) => <span className="mono">{formatDate(date)}</span>,
    },
    {
      title: "提醒人",
      dataIndex: "remindee",
      key: "remindee",
      width: 110,
    },
    {
      title: "提醒内容",
      dataIndex: "content",
      key: "content",
      ellipsis: true,
      render: (content: string) => content,
    },
    {
      title: "操作",
      key: "action",
      width: 150,
      fixed: "right" as const,
      render: (_, record) => (
        <Space size={0}>
          <Link href={`/reminders/edit/${record.id}`}>
            <Button type="link" size="small">
              编辑
            </Button>
          </Link>
          <Popconfirm
            title="删除提醒"
            description="确定删除吗？删除后不可恢复。"
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={async () => {
              try {
                await deleteReminder(record.id);
                message.success("提醒已删除");
              } catch (e) {
                message.error(toErrorMessage(e));
              }
            }}
          >
            <Button type="link" size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Surface style={{ marginBottom: 20 }}>
        {/* 台头：与工单/需求/会议同一套。「已逾期」计数是这页最该被一眼看到的东西 */}
        <div className="page-head">
          <h1>工作提醒</h1>
          <div className="page-stats">
            <div className="page-stat">
              <b>{stats.undone}</b>
              <span>未完成</span>
            </div>
            <div className="page-stat">
              <b style={stats.overdue > 0 ? { color: "var(--danger)" } : undefined}>
                {stats.overdue}
              </b>
              <span>已逾期</span>
            </div>
          </div>
        </div>

        {/* 工具行：动作在左，筛选在右 */}
        <div className="page-tools">
          <Space>
            <Link href="/reminders/create">
              <Button type="primary" icon={<PlusOutlined />}>
                新建提醒
              </Button>
            </Link>
          </Space>
          <div className="page-filters">
            {/* 三态是这一页的主筛选，放最左；Segmented 自己已说明选项含义，
                故只给一个不与之关联的视觉标签（关联不了 div，用 aria-label 兜语义） */}
            <div className="field">
              <span className="field-label">状态</span>
              <Segmented<DoneFilter>
                aria-label="按完成状态筛选"
                value={doneFilter}
                onChange={(value) => setDoneFilter(value)}
                options={[
                  { label: "未完成", value: "undone" },
                  { label: "全部", value: "all" },
                  { label: "已完成", value: "done" },
                ]}
              />
            </div>
            <div className="field">
              <label htmlFor="rmd-remindee">提醒人</label>
              <Select<string>
                id="rmd-remindee"
                allowClear
                placeholder="全部"
                style={{ width: 130 }}
                options={remindeeOptions}
                value={remindee}
                onChange={(value) => setRemindee(value)}
              />
            </div>
            <div className="field">
              <label htmlFor="rmd-kw">搜索</label>
              <Input
                id="rmd-kw"
                allowClear
                placeholder="提醒内容"
                prefix={<SearchOutlined />}
                style={{ width: 200 }}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>
            <Button
              icon={<ReloadOutlined />}
              loading={loading}
              onClick={() => {
                void loadReminders(true).catch((e) =>
                  message.error(toErrorMessage(e)),
                );
              }}
            >
              刷新
            </Button>
          </div>
        </div>
      </Surface>

      <Surface padding={0}>
        <ProTable<Reminder>
          rowKey="id"
          columns={columns}
          dataSource={sortedReminders}
          loading={loading}
          // 未完成 且 日期 ≤ 今天 → 整行红。
          // date 是 "YYYY-MM-DD" 字符串，字典序比较即日期序，不必转 Date。
          rowClassName={(r) =>
            !r.isDone && r.date <= today() ? "reminder-row-overdue" : ""
          }
          // 操作列是 fixed: "right"，**不给 scroll.x 会让它错位**
          scroll={{ x: 1000 }}
          layoutStorageKey="reminders"
          pagination={{
            pageSize: 10,
            showTotal: (total) => `共 ${total} 条`,
          }}
        />
      </Surface>
    </>
  );
}
