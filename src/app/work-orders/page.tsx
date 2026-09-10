"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Button,
  Card,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Tag,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { PlusOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import ProTable from "@/components/common/ProTable";
import EditableChip from "@/components/common/EditableChip";
import { useRowDrafts } from "@/lib/useRowDrafts";
import { SYSTEM_OPTIONS } from "@/types";
import type { WorkOrder, WorkOrderStatus } from "@/types";
import { useAppStore } from "@/store/store";
import { formatDate, workOrderNo } from "@/lib/utils";
import { toErrorMessage } from "@/lib/errors";

// 系统标签配色：仅作视觉区分，未覆盖的系统退回默认灰色
const SYSTEM_COLORS: Record<string, string> = {
  WMS: "blue",
  ERP: "purple",
  OMS: "cyan",
  TMS: "orange",
  其他: "gold",
};

/**
 * 工单列表页（环节5：数据源为真实后端 API）
 * - 挂载时拉取工单 + 需求（后者用于「关联需求」列反查）
 * - 列表内可改「系统 / 是否转需求 / 状态」→ 暂存草稿，点「提交」并确认后才落库
 * - 操作列提供「转需求」：调用后端一对一转换接口，自动创建需求并置标记
 * - 所有失败（校验/冲突/网络）统一用 toErrorMessage 友好提示
 */
export default function WorkOrderListPage() {
  const workOrders = useAppStore((s) => s.workOrders);
  const requirements = useAppStore((s) => s.requirements);
  const loading = useAppStore((s) => s.workOrdersLoading);
  const loadWorkOrders = useAppStore((s) => s.loadWorkOrders);
  const loadRequirements = useAppStore((s) => s.loadRequirements);
  const deleteWorkOrder = useAppStore((s) => s.deleteWorkOrder);
  const updateWorkOrder = useAppStore((s) => s.updateWorkOrder);
  const convertWorkOrder = useAppStore((s) => s.convertWorkOrder);

  // 草稿状态：内联修改暂存草稿，显式提交才落库
  const drafts = useRowDrafts<WorkOrder>();

  // 标题搜索关键字 / 系统筛选值（受控，allowClear 清空后为 undefined 表示不过滤）
  const [keyword, setKeyword] = useState("");
  const [system, setSystem] = useState<string | undefined>(undefined);

  // 初次挂载拉取数据（需求列表用于反查「关联需求」）
  useEffect(() => {
    void loadWorkOrders().catch((e) => message.error(toErrorMessage(e)));
    void loadRequirements().catch((e) => message.error(toErrorMessage(e)));
  }, [loadWorkOrders, loadRequirements]);

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

  // 提交：先确认，再把全部草稿逐个写入后端（全成功才清空草稿）
  const handleCommit = () => {
    Modal.confirm({
      title: `确认提交 ${drafts.count} 条修改？`,
      content: "提交后将写入数据库，列表数据会同步更新。",
      okText: "确认提交",
      cancelText: "取消",
      onOk: async () => {
        try {
          const n = await drafts.commitAsync(async (id, patch) => {
            await updateWorkOrder(id, patch);
          });
          if (n > 0) message.success(`已提交 ${n} 条工单修改`);
        } catch (e) {
          message.error(toErrorMessage(e));
        }
      },
    });
  };

  // 转需求：确认后调用后端一对一转换（自动建需求 + 置工单标记）
  const handleConvert = (record: WorkOrder) => {
    Modal.confirm({
      title: "确认将该工单转为需求？",
      content: `将按工单「${record.title}」自动创建需求（日期/标题/内容/系统同步），并标记该工单已转需求。`,
      okText: "转为需求",
      cancelText: "取消",
      onOk: async () => {
        try {
          const req = await convertWorkOrder(record.id);
          message.success(`已转为需求 ${req.requirementId}`);
        } catch (e) {
          message.error(toErrorMessage(e));
        }
      },
    });
  };

  const columns: ColumnsType<WorkOrder> = [
    {
      // ① 工单ID列：库主键为 cuid，展示派生短号（wo-末8位）
      title: "工单ID",
      dataIndex: "id",
      width: 120,
      render: (id: string) => workOrderNo(id),
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
        <EditableChip
          value={sys}
          options={SYSTEM_OPTIONS.map((v) => ({ label: v, value: v }))}
          colorOf={(s) => (SYSTEM_COLORS as Record<string, string | undefined>)[s]}
          dirty={drafts.isFieldDirty(record.id, "system")}
          onChange={(v) => drafts.stage(record.id, { system: v } as Partial<WorkOrder>)}
        />
      ),
    },
    {
      title: "是否转需求",
      dataIndex: "isConvertToRequirement",
      width: 120,
      render: (isConvert: boolean, record) => (
        <EditableChip
          value={isConvert}
          options={[
            { label: "否", value: false },
            { label: "是", value: true },
          ]}
          colorOf={(v) => (v ? "blue" : undefined)}
          dirty={drafts.isFieldDirty(record.id, "isConvertToRequirement")}
          onChange={(v) =>
            drafts.stage(record.id, { isConvertToRequirement: v } as Partial<WorkOrder>)
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
        <EditableChip
          value={status as WorkOrderStatus}
          options={["新建", "已处理", "已关闭"].map((v) => ({
            label: v,
            value: v as WorkOrderStatus,
          }))}
          colorOf={(s) =>
            s === "已处理" ? "success" : s === "新建" ? "gold" : undefined
          }
          dirty={drafts.isFieldDirty(record.id, "status")}
          onChange={(v) =>
            drafts.stage(record.id, { status: v as WorkOrderStatus } as Partial<WorkOrder>)
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
      // ② ③ 操作列固定在最右侧（含转需求入口）
      title: "操作",
      key: "action",
      width: 210,
      fixed: "right",
      render: (_, record) => (
        <Space size={0}>
          <Link href={`/work-orders/edit/${record.id}`}>
            <Button type="link" size="small">
              编辑
            </Button>
          </Link>
          <Button
            type="link"
            size="small"
            disabled={record.isConvertToRequirement}
            title={
              record.isConvertToRequirement ? "该工单已转需求" : "自动创建需求并关联"
            }
            onClick={() => handleConvert(record)}
          >
            转需求
          </Button>
          <Popconfirm
            title="删除工单"
            description="确定删除该工单吗？删除后不可恢复。"
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={async () => {
              drafts.discard(record.id);
              try {
                await deleteWorkOrder(record.id);
                message.success("工单已删除");
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
        {/* 新建工单 + 提交/还原（草稿计数） */}
        <Space>
          <Link href="/work-orders/create">
            <Button type="primary" icon={<PlusOutlined />}>
              新建工单
            </Button>
          </Link>
          <Button
            type="primary"
            disabled={drafts.count === 0}
            onClick={handleCommit}
          >
            提交{drafts.count ? `（${drafts.count}）` : ""}
          </Button>
          {drafts.count > 0 ? (
            <Button onClick={() => drafts.discard()}>还原</Button>
          ) : null}
        </Space>
        <Space wrap>
          <Button
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={() => {
              void loadWorkOrders(true).catch((e) =>
                message.error(toErrorMessage(e)),
              );
              void loadRequirements(true).catch(() => undefined);
            }}
          >
            刷新
          </Button>
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
        dataSource={filteredWorkOrders.map(drafts.merge)}
        loading={loading}
        scroll={{ x: 1510 }}
        layoutStorageKey="work-orders"
        pagination={{
          pageSize: 10,
          showSizeChanger: false,
          showTotal: (total) => `共 ${total} 条`,
        }}
      />
    </Card>
  );
}
