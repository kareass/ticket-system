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
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { PlusOutlined, SearchOutlined } from "@ant-design/icons";
import type { Requirement, RequirementNode } from "@/types";
import { NODE_OPTIONS, SYSTEM_OPTIONS } from "@/types";
import { useAppStore } from "@/store/store";
import { formatDate, today } from "@/lib/utils";
import ProTable from "@/components/common/ProTable";

// 系统标签配色
const SYSTEM_COLORS: Record<string, string> = {
  WMS: "blue",
  ERP: "purple",
  OMS: "cyan",
  TMS: "orange",
  其他: "gold",
};

// 需求当前节点配色
const NODE_COLORS: Record<RequirementNode, string> = {
  方案中: "default",
  开发中: "processing",
  测试中: "warning",
  已合并: "cyan",
  已发布: "success",
};

// 当前节点筛选下拉选项
const nodeOptions: { label: RequirementNode; value: RequirementNode }[] =
  NODE_OPTIONS.map((node) => ({ label: node, value: node }));

/** 内联下拉复用组件：antd Select size="small" 全宽 */
function InlineSelect<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (val: T) => void;
  options: { label: string; value: T }[];
}) {
  return (
    <Select
      size="small"
      style={{ width: "100%" }}
      value={value}
      onChange={onChange}
      options={options}
    />
  );
}

/**
 * 需求列表页
 * - 数据源：全局 store（useAppStore.requirements）
 * - ProTable 提供列拖排序 + 拖宽能力
 * - 系统/当前节点/是否加急/是否发版支持列表内联编辑
 */
export default function RequirementListPage() {
  const requirements = useAppStore((s) => s.requirements);
  const workOrders = useAppStore((s) => s.workOrders);
  const deleteRequirement = useAppStore((s) => s.deleteRequirement);
  const updateRequirement = useAppStore((s) => s.updateRequirement);

  const [keyword, setKeyword] = useState("");
  const [node, setNode] = useState<RequirementNode | undefined>(undefined);

  // 前端过滤：需求ID或标题包含 + 当前节点相等
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

  const columns: ColumnsType<Requirement> = [
    {
      title: "需求ID",
      dataIndex: "requirementId",
      key: "requirementId",
      width: 130,
    },
    {
      title: "日期",
      dataIndex: "date",
      key: "date",
      width: 110,
      render: (date: string) => formatDate(date),
    },
    {
      title: "需求标题",
      dataIndex: "title",
      key: "title",
      width: 200,
      ellipsis: true,
      render: (title?: string) => title || "-",
    },
    {
      title: "需求内容",
      dataIndex: "content",
      key: "content",
      width: 240,
      ellipsis: true,
      render: (content?: string) => content || "-",
    },
    {
      title: "系统",
      dataIndex: "system",
      key: "system",
      width: 100,
      render: (system: string, record) => {
        const systemOpts = SYSTEM_OPTIONS.map((s) => ({
          label: s,
          value: s,
        }));
        return (
          <InlineSelect
            value={system}
            onChange={(val) =>
              updateRequirement(record.id, {
                system: val,
                updatedAt: new Date().toISOString(),
              })
            }
            options={systemOpts}
          />
        );
      },
    },
    {
      title: "开发时长(天)",
      dataIndex: "developmentDays",
      key: "developmentDays",
      width: 110,
      align: "center" as const,
      render: (days?: number) => (typeof days === "number" ? days : "-"),
    },
    {
      title: "当前节点",
      dataIndex: "currentNode",
      key: "currentNode",
      width: 120,
      render: (currentNode: RequirementNode, record) => {
        const nodeOpts = NODE_OPTIONS.map((n) => ({ label: n, value: n }));
        return (
          <InlineSelect
            value={currentNode}
            onChange={(val) =>
              updateRequirement(record.id, {
                currentNode: val,
                updatedAt: new Date().toISOString(),
              })
            }
            options={nodeOpts}
          />
        );
      },
    },
    {
      title: "是否加急",
      dataIndex: "isUrgent",
      key: "isUrgent",
      width: 100,
      align: "center" as const,
      render: (isUrgent: boolean, record) => (
        <InlineSelect
          value={isUrgent ? "true" : "false"}
          onChange={(val) =>
            updateRequirement(record.id, {
              isUrgent: val === "true",
              updatedAt: new Date().toISOString(),
            })
          }
          options={[
            { label: "否", value: "false" },
            { label: "是", value: "true" },
          ]}
        />
      ),
    },
    {
      title: "是否发版",
      dataIndex: "isReleased",
      key: "isReleased",
      width: 100,
      align: "center" as const,
      render: (isReleased: boolean, record) => (
        <InlineSelect
          value={isReleased ? "true" : "false"}
          onChange={(val) => {
            if (val === "true") {
              // 改为是：若原本 false，发版时间默认今天
              const patch: Partial<Requirement> = {
                isReleased: true,
                updatedAt: new Date().toISOString(),
              };
              if (!record.isReleased) {
                patch.releaseDate = today();
              }
              updateRequirement(record.id, patch);
            } else {
              // 改为否：清空发版时间
              updateRequirement(record.id, {
                isReleased: false,
                releaseDate: undefined,
                updatedAt: new Date().toISOString(),
              });
            }
          }}
          options={[
            { label: "否", value: "false" },
            { label: "是", value: "true" },
          ]}
        />
      ),
    },
    {
      title: "发版时间",
      dataIndex: "releaseDate",
      key: "releaseDate",
      width: 115,
      render: (_, record) =>
        record.isReleased ? formatDate(record.releaseDate) : "-",
    },
    {
      title: "来源工单",
      key: "sourceWorkOrder",
      width: 130,
      render: (_, record) => {
        if (!record.workOrderId) return "-";
        const src = workOrders.find((w) => w.id === record.workOrderId);
        return (
          <Tag color="geekblue">
            {src ? src.title || src.id : record.workOrderId}
          </Tag>
        );
      },
    },
    {
      title: "备注",
      dataIndex: "remark",
      key: "remark",
      width: 160,
      ellipsis: true,
      render: (remark?: string) => remark || "-",
    },
    {
      title: "操作",
      key: "action",
      width: 150,
      fixed: "right" as const,
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
      {/* 顶部工具栏 */}
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

      <ProTable<Requirement>
        rowKey="id"
        columns={columns}
        dataSource={filteredRequirements}
        scroll={{ x: 1560 }}
        pagination={{
          pageSize: 10,
          showSizeChanger: false,
          showTotal: (total) => `共 ${total} 条`,
        }}
      />
    </Card>
  );
}
