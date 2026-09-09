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
import ProTable from "@/components/common/ProTable";
import { SYSTEM_OPTIONS } from "@/types";
import type { WorkOrder, WorkOrderStatus } from "@/types";
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

/**
 * 内联下拉小组件（模块级，支持列表格内直接修改）
 * - 接收受控 value + onChange + options
 * - onClick stopPropagation 防止触发行级操作
 */
function InlineSelect({
  value,
  onChange,
  options,
}: {
  value: string | boolean | undefined;
  onChange: (v: string | boolean) => void;
  options: { label: string; value: string | boolean }[];
}) {
  return (
    <Select
      size="small"
      style={{ width: "100%" }}
      value={value}
      options={options}
      onChange={onChange}
      allowClear={false}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

/**
 * 工单列表页
 * - 数据源：全局 store（useAppStore.workOrders），当前为 mock，后端就绪后无需改页面
 * - 新建 / 编辑分别链接到 /work-orders/create、/work-orders/edit/{id}（表单页另见任务卡）
 * - 搜索（按标题）与系统筛选在前端对 workOrders 过滤，空态使用 Table 默认 Empty
 * - 列表格内可直接修改「是否转需求」「系统」「状态」字段
 */
export default function WorkOrderListPage() {
  const workOrders = useAppStore((s) => s.workOrders);
  const requirements = useAppStore((s) => s.requirements);
  const deleteWorkOrder = useAppStore((s) => s.deleteWorkOrder);
  const updateWorkOrder = useAppStore((s) => s.updateWorkOrder);

  // 标题搜索关键字 / 系统筛选值（受控，allowClear 清空后为 undefined 表示不过滤）
  const [keyword, setKeyword] = useState("");
  const [system, setSystem] = useState<string | undefined>(undefined);

  // 前端过滤：标题包含 + 系统相等（无关键字 / 未选系统时不参与过滤）
  const filteredWorkOrders = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return workOrders.filter((wo) => {
      const hitTitle = !kw || wo.title.toLowerCase().includes(kw);
      const hitSystem = !system || wo.system === system;
      return hitTitle && hitSystem;
    });
  }, [workOrders, keyword, system]);

  // 系统筛选下拉可选项：与 SystemSelect 一致，复用全局枚举 SYSTEM_OPTIONS
  const systemFilterOptions: { label: string; value: string }[] =
    SYSTEM_OPTIONS.map((item) => ({ label: item, value: item }));

  // 是否转需求 选项
  const isConvertOptions = [
    { label: "否", value: false },
    { label: "是", value: true },
  ];

  // 系统 选项
  const systemOptions = SYSTEM_OPTIONS.map((v) => ({
    label: v,
    value: v,
  }));

  // 状态 选项
  const statusOptions = ["新建", "已处理", "已关闭"].map((v) => ({
    label: v,
    value: v,
  }));

  const columns: ColumnsType<WorkOrder> = [
    {
      // ① 工单ID列（直接显示 id 字符串，如 wo-001）
      title: "工单ID",
      dataIndex: "id",
      width: 110,
    },
    {
      title: "日期",
      dataIndex: "date",
      width: 110,
      render: (_, record) => formatDate(record.date),
    },
    {
      title: "标题",
      dataIndex: "title",
      width: 220,
      ellipsis: true,
    },
    {
      title: "工单内容",
      dataIndex: "content",
      width: 240,
      ellipsis: true,
      render: (content?: string) => content || "-",
    },
    {
      title: "系统",
      dataIndex: "system",
      width: 100,
      render: (sys: string, record) => (
        <InlineSelect
          value={sys}
          options={systemOptions}
          onChange={(v) =>
            updateWorkOrder(record.id, {
              system: v as string,
              updatedAt: new Date().toISOString(),
            })
          }
        />
      ),
    },
    {
      title: "是否转需求",
      dataIndex: "isConvertToRequirement",
      width: 120,
      render: (isConvert: boolean, record) => (
        <InlineSelect
          value={isConvert}
          options={isConvertOptions}
          onChange={(v) =>
            updateWorkOrder(record.id, {
              isConvertToRequirement: v as boolean,
              updatedAt: new Date().toISOString(),
            })
          }
        />
      ),
    },
    {
      // 关联需求：反查需求表，找到显示 Tag 需求业务编号，否则 "-"
      title: "关联需求",
      key: "linkRequirement",
      width: 140,
      render: (_, record) => {
        const found = requirements.find((r) => r.workOrderId === record.id);
        return found ? (
          <Tag color="geekblue">{found.requirementId}</Tag>
        ) : (
          "-"
        );
      },
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 110,
      render: (status: string, record) => (
        <InlineSelect
          value={status}
          options={statusOptions}
          onChange={(v) =>
            updateWorkOrder(record.id, {
              status: v as WorkOrderStatus,
              updatedAt: new Date().toISOString(),
            })
          }
        />
      ),
    },
    {
      title: "备注",
      dataIndex: "remark",
      width: 180,
      ellipsis: true,
      render: (remark?: string) => remark || "-",
    },
    {
      // ② ③ 操作列固定在最右侧
      title: "操作",
      key: "action",
      width: 150,
      fixed: "right",
      render: (_, record) => (
        <Space size={0}>
          <Link href={`/work-orders/edit/${record.id}`}>
            <Button type="link" size="small">
              编辑
            </Button>
          </Link>
          <Popconfirm
            title="删除工单"
            description="确定删除该工单吗？删除后不可恢复。"
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => deleteWorkOrder(record.id)}
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
    <Card title="工单列表">
      {/* 顶部工具栏：新建入口居左，搜索与系统筛选居右，窄屏自动换行 */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <Link href="/work-orders/create">
          <Button type="primary" icon={<PlusOutlined />}>
            新建工单
          </Button>
        </Link>
        <Space wrap>
          <Input
            allowClear
            placeholder="按标题搜索"
            prefix={<SearchOutlined />}
            style={{ width: 220 }}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <Select<string>
            allowClear
            placeholder="按系统筛选"
            style={{ width: 160 }}
            options={systemFilterOptions}
            value={system}
            onChange={(value) => setSystem(value)}
          />
        </Space>
      </div>

      <ProTable<WorkOrder>
        rowKey="id"
        columns={columns}
        dataSource={filteredWorkOrders}
        scroll={{ x: 1450 }}
        pagination={{
          pageSize: 10,
          showSizeChanger: false,
          showTotal: (total) => `共 ${total} 条`,
        }}
      />
    </Card>
  );
}
