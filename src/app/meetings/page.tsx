"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, Card, Input, message, Popconfirm, Space, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { PlusOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import type { Meeting } from "@/types";
import { useAppStore } from "@/store/store";
import { formatDate } from "@/lib/utils";
import { toErrorMessage } from "@/lib/errors";
import ProTable from "@/components/common/ProTable";
import SortableHeader from "@/components/common/SortableHeader";
import { createComparator, type SortState } from "@/lib/sortRows";

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
      render: (date: string) => formatDate(date),
    },
    {
      title: sortableTitle("主题", "title"),
      dataIndex: "title",
      key: "title",
      width: 200,
      ellipsis: true,
      render: (title?: string) => title || "-",
    },
    {
      title: "参会人",
      dataIndex: "attendees",
      key: "attendees",
      width: 220,
      render: (attendees: string[]) => {
        if (!attendees.length) return "-";
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
      render: (recorder?: string) => recorder || "-",
    },
    {
      title: "会议内容",
      dataIndex: "content",
      key: "content",
      width: 320,
      ellipsis: true,
      render: (content?: string) => content || "-",
    },
    {
      title: "附件",
      key: "attachments",
      width: 90,
      align: "center" as const,
      render: (_, record) =>
        record.attachments.length ? `${record.attachments.length} 个` : "-",
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
    <Card title="会议纪要">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <Space>
          <Link href="/meetings/create">
            <Button type="primary" icon={<PlusOutlined />}>
              新建会议纪要
            </Button>
          </Link>
        </Space>
        <Space wrap>
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
          <Input
            allowClear
            placeholder="按主题/参会人/记录人/内容搜索"
            prefix={<SearchOutlined />}
            style={{ width: 260 }}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </Space>
      </div>

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
    </Card>
  );
}
