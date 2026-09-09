"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Button,
  Card,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
} from "antd";
import type { TableProps } from "antd";
import { PlusOutlined, SearchOutlined } from "@ant-design/icons";
import type { Requirement, RequirementNode } from "@/types";
import { NODE_OPTIONS } from "@/types";
import { useAppStore } from "@/store/store";
import { formatDate } from "@/lib/utils";

// 系统标签配色：仅作视觉区分，未覆盖的系统退回默认灰色
const SYSTEM_COLORS: Record<string, string> = {
  WMS: "blue",
  ERP: "purple",
  OMS: "cyan",
  TMS: "orange",
  其他: "gold",
};

// 需求当前节点配色：方案中=default / 开发中=processing / 测试中=warning / 已合并=cyan / 已发布=success
const NODE_COLORS: Record<RequirementNode, string> = {
  方案中: "default",
  开发中: "processing",
  测试中: "warning",
  已合并: "cyan",
  已发布: "success",
};

// 当前节点筛选下拉选项：复用全局枚举 NODE_OPTIONS
const nodeOptions: { label: RequirementNode; value: RequirementNode }[] =
  NODE_OPTIONS.map((node) => ({ label: node, value: node }));

/**
 * 需求列表页
 * - 数据源：全局 store（useAppStore.requirements），当前为 mock，后端就绪后无需改页面
 * - 新建 / 编辑分别链接到 /requirements/create、/requirements/edit/{id}
 * - 搜索（按需求ID或标题）与当前节点筛选在前端对 requirements 过滤，空态使用 Table 默认 Empty
 */
export default function RequirementListPage() {
  const requirements = useAppStore((s) => s.requirements);
  const deleteRequirement = useAppStore((s) => s.deleteRequirement);

  // 需求ID/标题搜索关键字 / 当前节点筛选值（受控，allowClear 清空后为 undefined 表示不过滤）
  const [keyword, setKeyword] = useState("");
  const [node, setNode] = useState<RequirementNode | undefined>(undefined);

  // 前端过滤：需求ID或标题包含 + 当前节点相等（无关键字 / 未选节点时不参与过滤）
  const filteredRequirements = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return requirements.filter((req) => {
      const hitText =
        !kw ||
        req.requirementId.toLowerCase().includes(kw) ||
        (req.title ?? "").toLowerCase().includes(kw);
      const hitNode = !node || req.currentNode === node;
      return hitText && hitNode;
    });
  }, [requirements, keyword, node]);

  const columns: TableProps<Requirement>["columns"] = [
    {
      title: "需求ID",
      dataIndex: "requirementId",
      width: 130,
    },
    {
      title: "日期",
      dataIndex: "date",
      width: 110,
      render: (_, record) => formatDate(record.date),
    },
    {
      title: "需求标题",
      dataIndex: "title",
      ellipsis: true,
      render: (title?: string) => title || "-",
    },
    {
      title: "系统",
      dataIndex: "system",
      width: 90,
      render: (system: string) => (
        <Tag color={SYSTEM_COLORS[system]}>{system}</Tag>
      ),
    },
    {
      title: "开发时长(天)",
      dataIndex: "developmentDays",
      width: 110,
      align: "center",
      render: (days?: number) => (typeof days === "number" ? days : "-"),
    },
    {
      title: "当前节点",
      dataIndex: "currentNode",
      width: 100,
      render: (currentNode: RequirementNode) => (
        <Tag color={NODE_COLORS[currentNode]}>{currentNode}</Tag>
      ),
    },
    {
      title: "是否加急",
      dataIndex: "isUrgent",
      width: 100,
      align: "center",
      render: (isUrgent: boolean) =>
        isUrgent ? <Tag color="red">是</Tag> : <Tag>否</Tag>,
    },
    {
      title: "是否发版",
      dataIndex: "isReleased",
      width: 100,
      align: "center",
      render: (isReleased: boolean) =>
        isReleased ? <Tag color="success">是</Tag> : <Tag>否</Tag>,
    },
    {
      title: "发版时间",
      dataIndex: "releaseDate",
      width: 115,
      render: (_, record) =>
        record.isReleased ? formatDate(record.releaseDate) : "-",
    },
    {
      title: "备注",
      dataIndex: "remark",
      ellipsis: true,
      render: (remark?: string) => remark || "-",
    },
    {
      title: "操作",
      key: "action",
      width: 150,
      render: (_, record) => (
        <Space size={0}>
          <Link href={`/requirements/edit/${record.id}`}>
            <Button type="link" size="small">
              编辑
            </Button>
          </Link>
          <Popconfirm
            title="删除需求"
            description="确定删除该需求吗？删除后不可恢复。"
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => deleteRequirement(record.id)}
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
    <Card title="需求列表">
      {/* 顶部工具栏：新建入口居左，搜索与当前节点筛选居右，窄屏自动换行 */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <Link href="/requirements/create">
          <Button type="primary" icon={<PlusOutlined />}>
            新建需求
          </Button>
        </Link>
        <Space wrap>
          <Input
            allowClear
            placeholder="按需求ID/标题搜索"
            prefix={<SearchOutlined />}
            style={{ width: 220 }}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <Select<RequirementNode>
            allowClear
            placeholder="按当前节点筛选"
            style={{ width: 180 }}
            options={nodeOptions}
            value={node}
            onChange={(value) => setNode(value)}
          />
        </Space>
      </div>

      <Table<Requirement>
        rowKey="id"
        columns={columns}
        dataSource={filteredRequirements}
        scroll={{ x: 1280 }}
        pagination={{
          pageSize: 10,
          showSizeChanger: false,
          showTotal: (total) => `共 ${total} 条`,
        }}
      />
    </Card>
  );
}
