"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, Input, message, Popconfirm, Space, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { PlusOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import type { Meeting } from "@/types";
import { useAppStore } from "@/store/store";
import { formatDate, today } from "@/lib/utils";
import { toErrorMessage } from "@/lib/errors";
import ProTable from "@/components/common/ProTable";
import Surface from "@/components/common/Surface";
import SortableHeader from "@/components/common/SortableHeader";
import { createComparator, type SortState } from "@/lib/sortRows";
import { MOSS } from "@/lib/theme";

/** 空值占位：中文数据表惯例用全角破折号「—」，颜色退到装饰灰 */
const EMPTY = <span style={{ color: MOSS.ornament }}>—</span>;

/**
 * 会议纪要列表（**只读**）
 * - 与工单/需求列表的关键差异：**不做内联编辑**，因此不引入 useRowDrafts —
 *   会议内容是大段文本，部分可改会和「显式提交」的心智模型打架。
 *   要改就点「编辑」进独立页面。
 * - 数据源：全局 store（useAppStore.meetings），首次挂载拉取
 * - 搜索与排序均为前端行为；默认保持后端返回的 createdAt 倒序
 */
export default function MeetingListPage() {
  const meetings = useAppStore((s) => s.meetings);
  const loading = useAppStore((s) => s.meetingsLoading);
  const loadMeetings = useAppStore((s) => s.loadMeetings);
  const deleteMeeting = useAppStore((s) => s.deleteMeeting);

  const [keyword, setKeyword] = useState("");
  const [sort, setSort] = useState<SortState<Meeting> | null>(null);

  useEffect(() => {
    void loadMeetings().catch((e) => message.error(toErrorMessage(e)));
  }, [loadMeetings]);

  // 前端过滤：主题 / 记录人 / 会议内容 / 参会人 任一命中
  const filteredMeetings = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return meetings;
    return meetings.filter((m) => {
      // ⚠️ 任何可空字段做字符串操作前都要 ?? ""，否则 null 会让整页崩掉
      const haystack = [
        m.title ?? "",
        m.recorder ?? "",
        m.content ?? "",
        m.attendees.join(" "),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(kw);
    });
  }, [meetings, keyword]);

  // 台头计数：统计**全部**纪要，不随筛选变化。
  // 「本月」按 date 的 "YYYY-MM" 前缀比 —— date 是 "YYYY-MM-DD"，
  // 直接切字符串比转 Date 少一次时区风险。
  const stats = useMemo(() => {
    const month = today().slice(0, 7);
    return {
      total: meetings.length,
      thisMonth: meetings.filter((m) => m.date.startsWith(month)).length,
    };
  }, [meetings]);

  // 双击列头：升序 → 降序 → 取消（回到默认的 createdAt 倒序）
  const handleSortToggle = (field: keyof Meeting) => {
    setSort((prev) => {
      if (!prev || prev.field !== field) return { field, order: "ascend" };
      if (prev.order === "ascend") return { field, order: "descend" };
      return null;
    });
  };

  const sortedMeetings = useMemo(() => {
    if (!sort) return filteredMeetings;
    return [...filteredMeetings].sort(
      createComparator<Meeting>(sort.field, sort.order),
    );
  }, [filteredMeetings, sort]);

  const sortableTitle = (label: string, field: keyof Meeting) => (
    <SortableHeader<Meeting>
      label={label}
      field={field}
      sort={sort}
      onToggle={handleSortToggle}
    />
  );

  const columns: ColumnsType<Meeting> = [
    {
      title: sortableTitle("日期", "date"),
      dataIndex: "date",
      key: "date",
      width: 110,
      // 日期是数字串，等宽才纵向对齐
      render: (date: string) => <span className="mono">{formatDate(date)}</span>,
    },
    {
      title: sortableTitle("主题", "title"),
      dataIndex: "title",
      key: "title",
      width: 200,
      ellipsis: true,
      render: (title?: string) => title || EMPTY,
    },
    {
      title: "参会人",
      dataIndex: "attendees",
      key: "attendees",
      width: 220,
      render: (attendees: string[]) => {
        if (!attendees.length) return EMPTY;
        // 中性小标签：这里用标签只是为了把几个名字分开，不承担配色语义
        return (
          <Space size={[0, 4]} wrap>
            {attendees.map((name) => (
              <Tag key={name}>{name}</Tag>
            ))}
          </Space>
        );
      },
    },
    {
      title: "记录人",
      dataIndex: "recorder",
      key: "recorder",
      width: 110,
      render: (recorder?: string) => recorder || EMPTY,
    },
    {
      title: "会议内容",
      dataIndex: "content",
      key: "content",
      width: 320,
      ellipsis: true,
      render: (content?: string) => content || EMPTY,
    },
    {
      title: "附件",
      key: "attachments",
      width: 90,
      align: "center" as const,
      // 条数是量，等宽
      render: (_, record) =>
        record.attachments.length ? (
          <span className="mono">{record.attachments.length}</span>
        ) : (
          EMPTY
        ),
    },
    {
      title: "操作",
      key: "action",
      width: 150,
      fixed: "right" as const,
      render: (_, record) => (
        <Space size={0}>
          <Link href={`/meetings/edit/${record.id}`}>
            <Button type="link" size="small">
              编辑
            </Button>
          </Link>
          <Popconfirm
            title="删除会议纪要"
            description="确定删除吗？删除后不可恢复，其附件会一并删除。"
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={async () => {
              try {
                await deleteMeeting(record.id);
                message.success("会议纪要已删除");
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
        {/* 台头：与工单/需求同一套 */}
        <div className="page-head">
          <h1>会议纪要</h1>
          <div className="page-stats">
            <div className="page-stat">
              <b>{stats.total}</b>
              <span>纪要总数</span>
            </div>
            <div className="page-stat">
              <b>{stats.thisMonth}</b>
              <span>本月</span>
            </div>
          </div>
        </div>

        {/* 工具行：动作在左，搜索在右 */}
        <div className="page-tools">
          <Space>
            <Link href="/meetings/create">
              <Button type="primary" icon={<PlusOutlined />}>
                新建会议纪要
              </Button>
            </Link>
          </Space>
          <div className="page-filters">
            <div className="field">
              <label htmlFor="mtg-kw">搜索</label>
              <Input
                id="mtg-kw"
                allowClear
                placeholder="主题 / 参会人 / 记录人 / 内容"
                prefix={<SearchOutlined />}
                style={{ width: 260 }}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>
            <Button
              icon={<ReloadOutlined />}
              loading={loading}
              onClick={() => {
                void loadMeetings(true).catch((e) =>
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
        <ProTable<Meeting>
          rowKey="id"
          columns={columns}
          dataSource={sortedMeetings}
          loading={loading}
          scroll={{ x: 1200 }}
          layoutStorageKey="meetings"
          pagination={{
            pageSize: 10,
            showTotal: (total) => `共 ${total} 条`,
          }}
        />
      </Surface>
    </>
  );
}
