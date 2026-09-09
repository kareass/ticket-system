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
import { SYSTEM_OPTIONS } from "@/types";
import type { WorkOrder } from "@/types";
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
 * 工单列表页
 * - 数据源：全局 store（useAppStore.workOrders），当前为 mock，后端就绪后无需改页面
 * - 新建 / 编辑分别链接到 /work-orders/create、/work-orders/edit/{id}（表单页另见任务卡）
 * - 搜索（按标题）与系统筛选在前端对 workOrders 过滤，空态使用 Table 默认 Empty
 */
export default function WorkOrderListPage() {
  const workOrders = useAppStore((s) => s.workOrders);
  const deleteWorkOrder = useAppStore((s) => s.deleteWorkOrder);

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
  const systemOptions: { label: string; value: string }[] = SYSTEM_OPTIONS.map(
    (item) => ({ label: item, value: item }),
  );

  const columns: TableProps<WorkOrder>["columns"] = [
    {
      title: "日期",
      dataIndex: "date",
      width: 110,
      render: (_, record) => formatDate(record.date),
    },
    {
      title: "标题",
      dataIndex: "title",
      ellipsis: true,
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
      title: "是否转需求",
      dataIndex: "isConvertToRequirement",
      width: 110,
      render: (isConvert: boolean) =>
        isConvert ? <Tag color="success">是</Tag> : <Tag>否</Tag>,
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
      width: 140,
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
            options={systemOptions}
            value={system}
            onChange={(value) => setSystem(value)}
          />
        </Space>
      </div>

      <Table<WorkOrder>
        rowKey="id"
        columns={columns}
        dataSource={filteredWorkOrders}
        scroll={{ x: 760 }}
        pagination={{
          pageSize: 10,
          showSizeChanger: false,
          showTotal: (total) => `共 ${total} 条`,
        }}
      />
    </Card>
  );
}
